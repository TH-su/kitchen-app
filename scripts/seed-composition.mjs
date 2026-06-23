// =====================================================================
// 成分表 → food_composition 投入 ＋ ingredients.food_code 紐付け
//   前提: parse-composition.mjs / match-ingredients.mjs 実行済み
//   実行: node scripts/seed-composition.mjs
//   ※ Service Role キー使用（RLSバイパス）。冪等（food_codeでupsert）
// =====================================================================
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
dotenv.config({ path: join(ROOT, '.env') })
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('❌ .env に接続情報が必要'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const comp = JSON.parse(readFileSync(join(ROOT, 'data', 'food_composition.json'), 'utf8'))
const map = JSON.parse(readFileSync(join(ROOT, 'data', 'ingredient_code_map.json'), 'utf8'))

// 1) food_composition upsert（chunkで）
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
let ins = 0
for (const part of chunk(comp, 500)) {
  const { error } = await sb.from('food_composition').upsert(part, { onConflict: 'food_code' })
  if (error) { console.error('food_composition upsert失敗:', error.message); process.exit(1) }
  ins += part.length
}
console.log(`food_composition: ${ins} 件 upsert`)

// 2) ingredients.food_code 紐付け
//   先に全食材の food_code を一旦クリア（マップから外れた食材＝米/ご飯等を確実に未紐付けへ戻す＝冪等）
{
  const { error } = await sb.from('ingredients').update({ food_code: null }).not('food_code', 'is', null)
  if (error) { console.error('food_code リセット失敗:', error.message); process.exit(1) }
}
let ok = 0, miss = 0
for (const [name, v] of Object.entries(map)) {
  const { data, error } = await sb.from('ingredients').update({ food_code: v.food_code }).eq('name', name).select('id')
  if (error) { console.error(`update失敗 ${name}:`, error.message); continue }
  if (data && data.length) ok++; else { miss++; console.warn(`  ⚠ 食材名が見つからない: ${name}`) }
}
console.log(`ingredients.food_code: ${ok} 件紐付け（該当なし ${miss}）`)

// 3) サニティ: 紐付け済み件数とビューの動作
const { count } = await sb.from('ingredients').select('id', { count: 'exact', head: true }).not('food_code', 'is', null)
console.log(`food_code付き ingredients = ${count}`)
