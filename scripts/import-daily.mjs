// 日次作業指示書xlsx群 → daily_menus へ反映。
// 既定はドライラン（書き込みなし・プレビューのみ）。--apply で実投入(upsert onConflict=menu_date)。
// 実行: node scripts/import-daily.mjs        (プレビュー)
//       node scripts/import-daily.mjs --apply (投入)
import xlsx from 'xlsx'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readdirSync } from 'node:fs'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')
const YEAR = 2026 // 令和8年
const BASE = '/Users/Takeshi/Documents/【厨房】/【10. 厨房】/作業指示書R8年度'
const DIRS = ['作業指示書R8.6', '作業指示書R8.7']
const MEAL = { 朝食: 'breakfast', 昼食: 'lunch', おやつ: 'snack', 間食: 'snack', 夕食: 'dinner' }

// 1枚目シートから {breakfast,lunch,snack,dinner} の番号を抽出（列ずれに強いラベル駆動）
function parseFile(path) {
  const wb = xlsx.readFile(path)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
  // 上部数行から「朝食/昼食/おやつ/夕食」を3つ以上含む行＝サマリ ラベル行
  let li = -1
  for (let r = 0; r < Math.min(6, aoa.length); r++) {
    const hits = aoa[r].filter((v) => MEAL[String(v).trim()]).length
    if (hits >= 3) { li = r; break }
  }
  if (li < 0) return { error: 'ラベル行未検出' }
  const labelRow = aoa[li]
  const codeRow = aoa[li + 1] || []
  const out = { breakfast: null, lunch: null, snack: null, dinner: null, sheet: wb.SheetNames[0] }
  labelRow.forEach((v, c) => {
    const key = MEAL[String(v).trim()]
    if (key) { const code = String(codeRow[c] ?? '').trim(); if (code) out[key] = code }
  })
  return out
}

// ファイル名 "…（改良版）  M.D.xlsx" から ISO 日付
function dateFromName(name) {
  const m = name.match(/(\d{1,2})\.(\d{1,2})\.xlsx$/)
  if (!m) return null
  const mm = String(Number(m[1])).padStart(2, '0')
  const dd = String(Number(m[2])).padStart(2, '0')
  return `${YEAR}-${mm}-${dd}`
}

// --- 収集 ---
const records = []
for (const d of DIRS) {
  const dir = join(BASE, d)
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.xlsx') || name.startsWith('~$')) continue
    const date = dateFromName(name)
    if (!date) continue
    const parsed = parseFile(join(dir, name))
    records.push({ date, name, ...parsed })
  }
}
records.sort((a, b) => a.date.localeCompare(b.date))

// --- 番号解決（menu_sets / snack dishes） ---
const { data: sets } = await sb.from('menu_sets').select('id, code')
const setByCode = new Map((sets ?? []).map((s) => [s.code, s.id]))
const { data: snacks } = await sb.from('dishes').select('id, code, name').eq('dish_type', 'snack').not('code', 'is', null)
const snackByCode = new Map((snacks ?? []).map((s) => [s.code, { id: s.id, name: s.name }]))
const { data: existing } = await sb.from('daily_menus').select('menu_date')
const existingDates = new Set((existing ?? []).map((r) => r.menu_date))

const unresolved = { set: new Set(), snack: new Set() }
const rows = records.map((r) => {
  const rb = r.breakfast ? (setByCode.has(r.breakfast) ? r.breakfast : `✗${r.breakfast}`) : '—'
  const rl = r.lunch ? (setByCode.has(r.lunch) ? r.lunch : `✗${r.lunch}`) : '—'
  const rd = r.dinner ? (setByCode.has(r.dinner) ? r.dinner : `✗${r.dinner}`) : '—'
  const rs = r.snack ? (snackByCode.has(r.snack) ? `${r.snack}(${snackByCode.get(r.snack).name})` : `✗${r.snack}`) : '—'
  for (const [k, code] of [['set', r.breakfast], ['set', r.lunch], ['set', r.dinner]]) if (code && !setByCode.has(code)) unresolved.set.add(code)
  if (r.snack && !snackByCode.has(r.snack)) unresolved.snack.add(r.snack)
  return { ...r, view: `${r.date} ${existingDates.has(r.date) ? '※既存' : '    '} | 朝:${rb}  昼:${rl}  夕:${rd}  お:${rs}` }
})

console.log(`=== 解析: ${records.length}ファイル / menu_sets:${setByCode.size}種 / snack:${snackByCode.size}種 / 既存daily_menus:${existingDates.size}件 ===\n`)
for (const r of rows) {
  console.log(r.view + (r.error ? `  ⚠️${r.error}` : ''))
}
console.log('\n--- 未解決の献立番号(menu_setsに無い):', [...unresolved.set].join(' ') || 'なし')
console.log('--- 未解決のおやつ番号(snackに無い):', [...unresolved.snack].join(' ') || 'なし')
const errFiles = records.filter((r) => r.error)
if (errFiles.length) console.log('--- 解析失敗ファイル:', errFiles.map((r) => r.name).join(' / '))

if (!APPLY) {
  console.log('\n[ドライラン] --apply で投入します。未解決番号があれば先に確認してください。')
  process.exit(0)
}

// --- 投入（upsert onConflict=menu_date） ---
let okc = 0, skip = 0
for (const r of records) {
  const payload = {
    menu_date: r.date,
    meal_count: 30, // Excelに人数欄の数値が無いため施設標準=30で作成（後でアプリ調整可）
    breakfast_set_id: r.breakfast ? setByCode.get(r.breakfast) ?? null : null,
    lunch_set_id: r.lunch ? setByCode.get(r.lunch) ?? null : null,
    dinner_set_id: r.dinner ? setByCode.get(r.dinner) ?? null : null,
    snack_dish_id: r.snack ? snackByCode.get(r.snack)?.id ?? null : null,
  }
  const { error } = await sb.from('daily_menus').upsert(payload, { onConflict: 'menu_date' })
  if (error) { console.log('  ✗', r.date, error.message); skip++ } else okc++
}
console.log(`\n✅ 投入完了: ${okc}件 / 失敗: ${skip}件`)
