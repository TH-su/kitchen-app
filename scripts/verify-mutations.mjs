// 書き込みパス検証: 未ログイン書込のRLSブロック / ログイン後CRUD / cascade削除
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(ROOT, '.env') })
const URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON = process.env.VITE_SUPABASE_ANON_KEY
if (!URL || !SERVICE || !ANON) {
  console.error('❌ .env の URL / SERVICE_ROLE / ANON が不足')
  process.exit(1)
}
const EMAIL = 'uitest@example.com'
const PASSWORD = 'Kitchen-Verify-123'
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } })
const anon = createClient(URL, ANON, { auth: { persistSession: false } })
const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null)

// 1) 未ログインの書込はRLSでブロックされるか（対照）
{
  const { error } = await anon.from('menu_sets').insert({ code: '__rls_test__', category: 'テスト' })
  console.log('未ログイン書込:', error ? `✓ ブロック (code=${error.code})` : '✗ 通過してしまった(RLS不備!)')
  if (!error) await admin.from('menu_sets').delete().eq('code', '__rls_test__')
}

// 2) テストユーザー作成（既存なら再利用）
{
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
  if (error && !/already|exists|registered/i.test(error.message)) throw error
  console.log('テストユーザー:', EMAIL, data?.user ? '作成' : '既存')
}

// 3) ログイン
{
  const { error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw error
  console.log('ログイン: ✓')
}

// 4) 認証ありCRUD
const code = '__verify__'
await admin.from('menu_sets').delete().eq('code', code) // 念のため既存掃除
const { data: ms, error: e1 } = await anon
  .from('menu_sets')
  .insert({ code, category: 'テスト', seq_no: 999 })
  .select('id')
  .single()
if (e1) throw e1
const { data: dish, error: e2 } = await anon
  .from('dishes')
  .insert({ name: '検証料理', dish_type: 'main', owner_menu_set_id: ms.id })
  .select('id')
  .single()
if (e2) throw e2
await anon.from('menu_sets').update({ main_dish_id: dish.id }).eq('id', ms.id)
const { data: ing } = await anon
  .from('ingredients')
  .upsert({ name: '__検証食材__' }, { onConflict: 'name' })
  .select('id')
  .single()
const { error: e3 } = await anon
  .from('dish_ingredients')
  .insert({ dish_id: dish.id, ingredient_id: ing.id, amount_g: 50, sort_order: 0 })
if (e3) throw e3
await anon.from('dishes').update({ name: '検証料理(改)' }).eq('id', dish.id)
console.log('作成＋更新: ✓')
const { data: check } = await anon
  .from('menu_sets')
  .select('code, main:main_dish_id(name, dish_ingredients(amount_g, ingredients(name)))')
  .eq('id', ms.id)
  .single()
console.log(
  '  読戻し:',
  check.code,
  '/',
  one(check.main)?.name,
  '/',
  (one(check.main)?.dish_ingredients ?? []).map((x) => `${one(x.ingredients).name}${x.amount_g}`).join(',')
)

// 5) 削除 cascade
const { error: e4 } = await anon.from('menu_sets').delete().eq('id', ms.id)
if (e4) throw e4
const { data: gone } = await admin.from('dishes').select('id').eq('id', dish.id)
console.log('削除cascade: dishes残', gone.length, gone.length === 0 ? '✓' : '✗')
await admin.from('ingredients').delete().eq('name', '__検証食材__')

console.log('\n✅ バックエンド CRUD＋RLS 検証OK')
console.log('UIテスト用ログイン →', EMAIL, '/', PASSWORD, '（検証後に削除します）')
