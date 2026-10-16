// 書き込みパス検証: 未ログイン書込のRLSブロック / ログイン後CRUD / cascade削除
// 施設の指定が必須（0010 以降）: node scripts/verify-mutations.mjs --facility=<施設の id>
//   テストユーザーをその施設の会員に登録してから試し、終わったら（この実行で登録した時だけ）外す。
//   作る・消すのはその施設の行だけ。テストユーザーが既に別の施設の会員なら止める（1人1施設）。
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { facilityIdFromArgs, assertFacilityExists } from './_facility.mjs'

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
const FACILITY_ID = facilityIdFromArgs()
await assertFacilityExists(admin, FACILITY_ID)

// 1) 未ログインの書込はRLSでブロックされるか（対照）
{
  const { error } = await anon.from('menu_sets').insert({ facility_id: FACILITY_ID, code: '__rls_test__', category: 'テスト' })
  console.log('未ログイン書込:', error ? `✓ ブロック (code=${error.code})` : '✗ 通過してしまった(RLS不備!)')
  if (!error) await admin.from('menu_sets').delete().eq('facility_id', FACILITY_ID).eq('code', '__rls_test__')
}

// 2) テストユーザー作成（既存なら再利用）
{
  const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true })
  if (error && !/already|exists|registered/i.test(error.message)) throw error
  console.log('テストユーザー:', EMAIL, data?.user ? '作成' : '既存')
}

// 3) ログイン
let userId
{
  const { data, error } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD })
  if (error) throw error
  userId = data.user.id
  console.log('ログイン: ✓')
}

// 3b) テストユーザーを指定の施設の会員にする（会員でないと RLS で何も読めず・書けない）
let addedMember = false
{
  const { data: mem, error } = await admin.from('facility_members').select('facility_id').eq('user_id', userId)
  if (error) throw error
  const other = (mem ?? []).filter((m) => m.facility_id !== FACILITY_ID)
  if (other.length) {
    console.error('❌ テストユーザーが別の施設の会員です（1人1施設）。止めます:', other.map((m) => m.facility_id).join(', '))
    process.exit(1)
  }
  if (!(mem ?? []).length) {
    const { error: e } = await admin.from('facility_members').insert({ user_id: userId, facility_id: FACILITY_ID })
    if (e) throw e
    addedMember = true
  }
  console.log('施設の会員:', addedMember ? '登録した（終わりに外す）' : '登録済み')
}

// 4) 認証ありCRUD
const code = '__verify__'
await admin.from('menu_sets').delete().eq('facility_id', FACILITY_ID).eq('code', code) // 念のため既存掃除
const { data: ms, error: e1 } = await anon
  .from('menu_sets')
  .insert({ facility_id: FACILITY_ID, code, category: 'テスト', seq_no: 999 })
  .select('id')
  .single()
if (e1) throw e1
const { data: dish, error: e2 } = await anon
  .from('dishes')
  .insert({ facility_id: FACILITY_ID, name: '検証料理', dish_type: 'main', owner_menu_set_id: ms.id })
  .select('id')
  .single()
if (e2) throw e2
await anon.from('menu_sets').update({ main_dish_id: dish.id }).eq('id', ms.id)
const { data: ing } = await anon
  .from('ingredients')
  .upsert({ facility_id: FACILITY_ID, name: '__検証食材__' }, { onConflict: 'facility_id,name' })
  .select('id')
  .single()
const { error: e3 } = await anon
  .from('dish_ingredients')
  .insert({ facility_id: FACILITY_ID, dish_id: dish.id, ingredient_id: ing.id, amount_g: 50, sort_order: 0 })
if (e3) throw e3
await anon.from('dishes').update({ name: '検証料理(改)' }).eq('id', dish.id)
console.log('作成＋更新: ✓')
const { data: check } = await anon
  .from('menu_sets')
  .select('code, main:dishes!menu_sets_main_dish_fkey(name, dish_ingredients(amount_g, ingredients(name)))')
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
await admin.from('ingredients').delete().eq('facility_id', FACILITY_ID).eq('name', '__検証食材__')
if (addedMember) {
  const { error } = await admin.from('facility_members').delete().eq('user_id', userId).eq('facility_id', FACILITY_ID)
  console.log('施設の会員から外す:', error ? `✗ ${error.message}` : '✓')
}

console.log('\n✅ バックエンド CRUD＋RLS 検証OK')
console.log('UIテスト用ログイン →', EMAIL, '/', PASSWORD, '（検証後に削除します）')
