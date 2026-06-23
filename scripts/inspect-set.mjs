import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const one = (v) => (Array.isArray(v) ? v[0] : v)
for (const code of process.argv.slice(2).length ? process.argv.slice(2) : ['朝①', '豚①', '魚①']) {
  const slots = ['staple_dish_id', 'main_dish_id', 'side1_dish_id', 'side2_dish_id', 'soup_dish_id']
  const { data: ms } = await sb.from('menu_sets').select('id,' + slots.join(',')).eq('code', code).maybeSingle()
  if (!ms) { console.log(code, 'なし'); continue }
  console.log('=== ' + code)
  for (const slot of slots) {
    const did = ms[slot]; if (!did) continue
    const { data: dish } = await sb.from('dishes').select('name,dish_ingredients(amount_g,ingredients(name,food_code))').eq('id', did).maybeSingle()
    const its = (dish.dish_ingredients || []).map((x) => { const ing = one(x.ingredients); return `${ing.name}:${x.amount_g ?? '適量'}${ing.food_code ? '' : '[未]'}` }).join(', ')
    console.log(`   [${slot.replace('_dish_id', '')}] ${dish.name} → ${its || '(食材なし)'}`)
  }
}
