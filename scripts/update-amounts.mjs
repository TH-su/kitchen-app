// 新Excel の食材分量だけを現行DBへ安全反映。既定はDRY RUN（--apply で書込）。
//   parse-excel と同じスロット↔レシピ突合で、menu_set×スロット単位に amount_g のみ更新。
//   食材名/料理名/menu_set構成/food_code/daily_menus は一切触らない。
//   実行: EXCEL_PATH="..." node scripts/update-amounts.mjs [--apply]
import xlsx from 'xlsx'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')
const one = (v) => (Array.isArray(v) ? v[0] : v)
const SRC = process.env.EXCEL_PATH
if (!SRC) { console.error('EXCEL_PATH を指定'); process.exit(1) }

const clean = (v) => { if (v == null) return null; const s = String(v).replace(/　/g, ' ').trim(); return s === '' ? null : s }
const num = (v) => { if (v == null || v === '') return null; if (typeof v === 'number') return v; const n = Number(String(v).replace(/　/g, '').trim()); return Number.isNaN(n) ? null : n }
const norm = (s) => String(s ?? '').replace(/\s|　/g, '')
const charSet = (s) => new Set([...String(s).replace(/\s|　/g, '')])
const jaccard = (a, b) => { const A = charSet(a), B = charSet(b); if (!A.size || !B.size) return 0; let i = 0; for (const c of A) if (B.has(c)) i++; return i / (A.size + B.size - i) }
const SIM = 0.34
const isSoup = (n) => /汁|スープ|すまし/.test(n)

// --- parse new Excel: menuSets + recipesByCode ---
const wb = xlsx.readFile(SRC)
const sheet = (n) => xlsx.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null })
const allRows = sheet('all')
const menuSets = []
for (let i = 1; i < allRows.length; i++) {
  const r = allRows[i]; const code = clean(r[0]); if (!code) continue
  const slots = { staple: clean(r[1]), main: clean(r[2]), side1: clean(r[3]), side2: clean(r[4]), soup: clean(r[5]) }
  if (!Object.values(slots).some(Boolean)) continue
  menuSets.push({ code, slots })
}
const sansRows = sheet('all指示書')
const recipesByCode = {}
for (const r of sansRows) {
  const code = clean(r[0]); const name = clean(r[1]); if (!code || !name) continue
  const ingredients = []
  for (let c = 2; c <= 21 && c < r.length; c += 2) { const in_ = clean(r[c]); if (!in_) continue; ingredients.push({ name: in_, amount: num(r[c + 1]) }) }
  ;(recipesByCode[code] ||= []).push({ name, ingredients })
}

// --- slot↔recipe matching (parse-excel と同一) → parsed[code][slot] = ingredients map ---
const parsed = {} // code -> slot -> Map(normName -> amount), 末尾配列で重複対応
for (const ms of menuSets) {
  const recipes = recipesByCode[ms.code] || []
  const slotsOrder = ['staple', 'main', 'side1', 'side2', 'soup'].filter((s) => ms.slots[s])
  const assign = {}; const used = new Set()
  for (const slot of slotsOrder) { const ri = recipes.findIndex((rc, i) => !used.has(i) && rc.name === ms.slots[slot]); if (ri >= 0) { assign[slot] = ri; used.add(ri) } }
  for (const slot of slotsOrder.filter((s) => assign[s] === undefined)) {
    let best = -1, bs = 0
    recipes.forEach((rc, i) => { if (used.has(i)) return; const s = jaccard(ms.slots[slot], rc.name); if (s > bs) { bs = s; best = i } })
    let chosen = -1
    if (best >= 0 && bs >= SIM) chosen = best
    else if (slot === 'soup') { const si = recipes.findIndex((rc, i) => !used.has(i) && isSoup(rc.name)); if (si >= 0) chosen = si }
    if (chosen >= 0) { assign[slot] = chosen; used.add(chosen) }
  }
  parsed[ms.code] = {}
  for (const slot of slotsOrder) {
    const ri = assign[slot]
    parsed[ms.code][slot] = ri !== undefined ? recipes[ri].ingredients : []
  }
}

// --- DB: menu_sets の各スロット dish + dish_ingredients ---
const DISH_SEL = '(name, dish_ingredients(id, amount_g, sort_order, ingredients(name)))'
let sets = [], from = 0
for (;;) {
  const { data, error } = await sb.from('menu_sets')
    .select(`code, staple:staple_dish_id${DISH_SEL}, main:main_dish_id${DISH_SEL}, side1:side1_dish_id${DISH_SEL}, side2:side2_dish_id${DISH_SEL}, soup:soup_dish_id${DISH_SEL}`)
    .range(from, from + 499)
  if (error) throw error
  sets = sets.concat(data); if (data.length < 500) break; from += 500
}

// --- 突合 & 差分 ---
const updates = [] // {id, code, slot, dish, ing, old, new}
let same = 0, missingExcelSlot = 0, dupSkipped = 0
for (const s of sets) {
  const code = s.code; const pslots = parsed[code]
  for (const slot of ['staple', 'main', 'side1', 'side2', 'soup']) {
    const dish = one(s[slot]); if (!dish) continue
    const exIngs = pslots?.[slot]
    if (!exIngs) { missingExcelSlot++; continue }
    // Excel側 amount: 同名重複は順序で対応
    const exByName = new Map()
    exIngs.forEach((i) => { const k = norm(i.name); (exByName.get(k) || exByName.set(k, []).get(k)).push(i.amount) })
    const usedIdx = new Map()
    for (const di of (dish.dish_ingredients ?? [])) {
      const nm = one(di.ingredients)?.name; const k = norm(nm)
      const arr = exByName.get(k)
      if (!arr) continue // Excelに無い食材＝触らない（削除しない）
      const idx = usedIdx.get(k) ?? 0; usedIdx.set(k, idx + 1)
      if (idx >= arr.length) { dupSkipped++; continue }
      const ex = arr[idx] ?? null; const cur = di.amount_g ?? null
      if (ex !== cur) updates.push({ id: di.id, code, slot, dish: dish.name, ing: nm, old: cur, new: ex })
      else same++
    }
  }
}

console.log(`=== 分量更新 ${APPLY ? '(APPLY)' : '(DRY RUN)'} ===`)
console.log(`一致 ${same} / 更新対象 ${updates.length} / Excel未対応スロット ${missingExcelSlot} / 重複超過スキップ ${dupSkipped}`)
console.log('--- 更新内容 ---')
for (const u of updates) console.log(`  ${u.code}/${u.dish}: ${u.ing} ${u.old}→${u.new}`)

if (APPLY) {
  let ok = 0
  for (const u of updates) {
    const { error } = await sb.from('dish_ingredients').update({ amount_g: u.new }).eq('id', u.id)
    if (error) { console.error(`  ✗ ${u.code}/${u.ing}:`, error.message); continue }
    ok++
  }
  console.log(`\n✅ ${ok}/${updates.length} 件を更新しました`)
} else {
  console.log('\n（DRY RUN。実行するには --apply を付与）')
}
