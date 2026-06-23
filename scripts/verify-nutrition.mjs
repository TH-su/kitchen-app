// 栄養ビューのサニティチェック（v_dish/menuset/daily_nutrition）＋紐付けカバレッジ
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
dotenv.config({ path: join(ROOT, '.env') })
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// 1) 献立セット栄養 上位（番号つき）
const { data: ms } = await sb.from('menu_sets').select('id, code, category').order('seq_no').limit(2000)
const { data: nut } = await sb.from('v_menuset_nutrition').select('*')
const byId = new Map((nut ?? []).map((n) => [n.menu_set_id, n]))
const sample = (ms ?? []).filter((m) => ['朝', '魚', '豚', '鶏', '行事'].includes(m.category)).slice(0, 12)
console.log('=== 献立セット1食あたり栄養（抜粋）===')
for (const m of sample) {
  const n = byId.get(m.id)
  if (n) console.log(`  ${m.code.padEnd(6)} ${Math.round(n.energy_kcal)}kcal  P${n.protein_g?.toFixed(1)} F${n.fat_g?.toFixed(1)} C${n.carbohydrate_g?.toFixed(1)} 塩${n.salt_g?.toFixed(1)}`)
  else console.log(`  ${m.code.padEnd(6)} （栄養データなし）`)
}

// 2) カバレッジ: dish_ingredients のうち food_code 未紐付けの割合（amount_g有・使用中の料理）
const { data: di } = await sb.from('dish_ingredients').select('amount_g, ingredients(name, food_code)')
let withAmt = 0, linked = 0
const unlinked = new Map()
for (const r of di ?? []) {
  if (r.amount_g == null) continue
  withAmt++
  const ing = Array.isArray(r.ingredients) ? r.ingredients[0] : r.ingredients
  if (ing?.food_code) linked++; else unlinked.set(ing?.name, (unlinked.get(ing?.name) ?? 0) + 1)
}
console.log(`\n=== カバレッジ ===\n  amount_g有のレシピ明細 ${withAmt} 件中 ${linked} 件紐付け（${Math.round((linked / withAmt) * 100)}%）`)
console.log('  未紐付け食材(明細数順):', [...unlinked.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(', '))
