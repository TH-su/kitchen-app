// =====================================================================
// DB の ingredients を使用頻度つきでダンプ（成分表マッチングの対象把握用）
//   出力: data/ingredients_live.json
//   実行: node scripts/dump-ingredients.mjs
// =====================================================================
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
dotenv.config({ path: join(ROOT, '.env') })

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('❌ .env に SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: ings, error: e1 } = await sb
  .from('ingredients')
  .select('id, name, food_code')
  .order('id')
if (e1) throw e1

// 使用頻度（dish_ingredients での出現数・amount_g の有無）※全件ページング
let di = [], from = 0
for (;;) {
  const { data, error: e2 } = await sb.from('dish_ingredients').select('ingredient_id, amount_g').range(from, from + 999)
  if (e2) throw e2
  di = di.concat(data)
  if (data.length < 1000) break
  from += 1000
}
const useCount = new Map()
const hasAmount = new Map()
for (const r of di) {
  useCount.set(r.ingredient_id, (useCount.get(r.ingredient_id) ?? 0) + 1)
  if (r.amount_g != null) hasAmount.set(r.ingredient_id, true)
}

const rows = ings.map((g) => ({
  id: g.id,
  name: g.name,
  food_code: g.food_code,
  uses: useCount.get(g.id) ?? 0,
  has_amount: !!hasAmount.get(g.id),
}))
rows.sort((a, b) => b.uses - a.uses)

writeFileSync(join(ROOT, 'data', 'ingredients_live.json'), JSON.stringify(rows, null, 2))
const matched = rows.filter((r) => r.food_code).length
const junk = rows.filter((r) => /^[\d.．，,／/]+(個|本|枚|g|ｇ|cc)?$/.test(r.name)).length
console.log(`ingredients=${rows.length}  food_code付=${matched}  使用0回=${rows.filter((r) => r.uses === 0).length}  数値ゴミ推定=${junk}`)
console.log('上位20（使用頻度）:')
for (const r of rows.slice(0, 20)) console.log(`  ${String(r.uses).padStart(3)}x  ${r.name}`)
