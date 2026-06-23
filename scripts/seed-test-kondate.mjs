// 一括印刷検証用: テスト日付(2099-12-28〜30)に日々の献立を3日分作成（service role）
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(ROOT, '.env') })
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const setCodes = ['朝①', '朝②', '朝③', '魚⑨', '牛⑨', '豚①', '鶏①', 'めん①', 'そ①']
const { data: sets } = await admin.from('menu_sets').select('id,code').in('code', setCodes)
const m = Object.fromEntries((sets ?? []).map((s) => [s.code, s.id]))
const { data: snacks } = await admin
  .from('dishes')
  .select('id,code')
  .eq('dish_type', 'snack')
  .in('code', ['お56', 'お①', 'お②'])
const sn = Object.fromEntries((snacks ?? []).map((s) => [s.code, s.id]))

await admin.from('daily_menus').delete().gte('menu_date', '2099-01-01')
const { error } = await admin.from('daily_menus').insert([
  { menu_date: '2099-12-28', meal_count: 30, breakfast_set_id: m['朝①'], lunch_set_id: m['魚⑨'], dinner_set_id: m['牛⑨'], snack_dish_id: sn['お56'] },
  { menu_date: '2099-12-29', meal_count: 32, breakfast_set_id: m['朝②'], lunch_set_id: m['豚①'], dinner_set_id: m['鶏①'], snack_dish_id: sn['お①'] },
  { menu_date: '2099-12-30', meal_count: 28, breakfast_set_id: m['朝③'], lunch_set_id: m['めん①'], dinner_set_id: m['そ①'], snack_dish_id: sn['お②'] },
])
if (error) throw error
console.log('✅ テスト献立 3日分作成: 2099-12-28〜30')
