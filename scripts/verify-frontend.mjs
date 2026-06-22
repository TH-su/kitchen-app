// フロントが使う anon(publishable) キーで、RLS越しに UI と同じクエリが通るか検証
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(ROOT, '.env') })
const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('❌ VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY が未設定')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })
const one = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null)

// 1) カテゴリ取得（anonでread可か）
const { data: cats, error: e1 } = await sb.from('menu_sets').select('category')
if (e1) throw e1
console.log('✓ anon read OK / カテゴリ種類:', [...new Set(cats.map((r) => r.category))].length)

// 2) 一覧クエリ（埋め込みFK）
const { data: list, error: e2 } = await sb
  .from('menu_sets')
  .select(
    'id,code,category, staple:staple_dish_id(name), main:main_dish_id(name), side1:side1_dish_id(name), side2:side2_dish_id(name), soup:soup_dish_id(name)'
  )
  .eq('category', '魚')
  .order('seq_no', { ascending: true, nullsFirst: false })
  .limit(3)
if (e2) throw e2
console.log('\n魚カテゴリ先頭3件:')
for (const m of list)
  console.log(
    `  ${m.code}: ${[one(m.staple)?.name, one(m.main)?.name, one(m.side1)?.name, one(m.side2)?.name, one(m.soup)?.name].filter(Boolean).join(' / ')}`
  )

// 3) 詳細クエリ（レシピ展開）魚⑨
const { data: f9, error: e3 } = await sb
  .from('menu_sets')
  .select('code, main:main_dish_id(name, dish_ingredients(amount_g,sort_order, ingredients(name)))')
  .eq('code', '魚⑨')
  .single()
if (e3) throw e3
const m = one(f9.main)
console.log('\n魚⑨ メイン:', m.name)
console.log(
  '  材料:',
  m.dish_ingredients
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((x) => `${one(x.ingredients).name}${x.amount_g ?? '(適量)'}`)
    .join(' / ')
)
console.log('\n✅ フロントのデータ取得経路（anonキー＋RLS＋埋め込みクエリ）は正常です')
