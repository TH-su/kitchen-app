import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const one = (v) => (Array.isArray(v) ? v[0] : v)

// 全dish_ingredients を取得（ページング）
let all = [], from = 0
for (;;) {
  const { data, error } = await sb.from('dish_ingredients').select('amount_g, ingredients(name, food_code)').range(from, from + 999)
  if (error) throw error
  all = all.concat(data); if (data.length < 1000) break; from += 1000
}
let amt = 0, amtLinked = 0, tekiryo = 0
const unlinkedAmt = new Map()
for (const r of all) {
  const ing = one(r.ingredients)
  if (r.amount_g == null) { tekiryo++; continue }
  amt++
  if (ing?.food_code) amtLinked++
  else unlinkedAmt.set(ing?.name, (unlinkedAmt.get(ing?.name) ?? 0) + 1)
}
console.log(`dish_ingredients 総数=${all.length}  amount有=${amt}(紐付${amtLinked}=${Math.round(amtLinked / amt * 100)}%)  適量=${tekiryo}`)
console.log('amount有で未紐付けの食材:', [...unlinkedAmt.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', ') || 'なし')

// 主食(staple)の分量記録状況: menu_setごとに staple dish の amount有食材数
const { data: sets } = await sb.from('menu_sets').select('id, code, category, staple_dish_id').limit(2000)
let stapleNone = 0, stapleTekiryoOnly = 0, stapleHasAmt = 0, noStaple = 0
const examples = []
for (const s of sets) {
  if (!s.staple_dish_id) { noStaple++; continue }
  const { data: dish } = await sb.from('dishes').select('name, dish_ingredients(amount_g)').eq('id', s.staple_dish_id).maybeSingle()
  const lines = dish?.dish_ingredients ?? []
  if (lines.length === 0) { stapleNone++; if (examples.length < 8) examples.push(`${s.code}:${dish?.name}(食材なし)`) }
  else if (lines.every((l) => l.amount_g == null)) { stapleTekiryoOnly++; if (examples.length < 8) examples.push(`${s.code}:${dish?.name}(適量のみ)`) }
  else stapleHasAmt++
}
console.log(`\n主食(${sets.length}セット): 分量あり=${stapleHasAmt}  食材なし=${stapleNone}  適量のみ=${stapleTekiryoOnly}  主食スロット無=${noStaple}`)
console.log('主食が計上されない例:', examples.join(' / '))
