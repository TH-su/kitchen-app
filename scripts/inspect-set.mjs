import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { facilityIdFromArgs, assertFacilityExists } from './_facility.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
// 施設を指定して読む（2026-10-18 改善プロンプト第2弾の15）。service role は RLS を通らないので、絞らないと全施設の行を読む
const FACILITY_ID = facilityIdFromArgs()
await assertFacilityExists(sb, FACILITY_ID)
const one = (v) => (Array.isArray(v) ? v[0] : v)
const codes = process.argv.slice(2).filter((a) => !a.startsWith('--'))   // --facility= は献立の番号ではない
for (const code of codes.length ? codes : ['朝①', '豚①', '魚①']) {
  const slots = ['staple_dish_id', 'main_dish_id', 'side1_dish_id', 'side2_dish_id', 'soup_dish_id']
  const { data: ms } = await sb.from('menu_sets').select('id,' + slots.join(',')).eq('facility_id', FACILITY_ID).eq('code', code).maybeSingle()
  if (!ms) { console.log(code, 'なし'); continue }
  console.log('=== ' + code)
  for (const slot of slots) {
    const did = ms[slot]; if (!did) continue
    const { data: dish } = await sb.from('dishes').select('name,dish_ingredients(amount_g,ingredients(name,food_code))').eq('facility_id', FACILITY_ID).eq('id', did).maybeSingle()
    const its = (dish.dish_ingredients || []).map((x) => { const ing = one(x.ingredients); return `${ing.name}:${x.amount_g ?? '適量'}${ing.food_code ? '' : '[未]'}` }).join(', ')
    console.log(`   [${slot.replace('_dish_id', '')}] ${dish.name} → ${its || '(食材なし)'}`)
  }
}
