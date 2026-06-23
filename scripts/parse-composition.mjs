// =====================================================================
// 文科省・日本食品標準成分表2020年版(八訂) 第2章本表(_012.xlsx)
//   入手元: https://www.mext.go.jp/a_menu/syokuhinseibun/mext_01110.html
//          「第2章（データ）」 = .../content/20201225-mxt_kagsei-mext_01110_012.xlsx
//   → data/food_composition.json （100gあたり）
//   列(1-index): 2=食品番号 4=食品名 7=ENERC_KCAL 10=PROT- 13=FAT- 21=CHOCDF- 61=NACL_EQ
//   実行: node scripts/parse-composition.mjs <xlsx-path>
//   依存: xlsx (SheetJS) — 既存の parse-excel.mjs と同じ
// =====================================================================
import xlsx from 'xlsx'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const src = process.argv[2]
if (!src) {
  console.error('usage: node scripts/parse-composition.mjs <honpyo.xlsx>')
  process.exit(1)
}

// 成分値の正規化: Tr→0, (n)→n, -/空→null, * →null
function num(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '' || s === '-' || s === '*') return null
  if (s === 'Tr' || s === '(Tr)' || s === '微量') return 0
  const m = s.replace(/[()（）]/g, '').replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  const n = Number(m)
  return Number.isFinite(n) ? n : null
}
function code5(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (!/^\d+$/.test(s)) return null
  if (s.length < 4 || s.length > 5) return null // 食品番号は5桁（数値化で先頭0が落ちた4桁も許容）。見出しの列番号等を除外
  return s.padStart(5, '0')
}
function cleanName(v) {
  if (v == null) return ''
  // 全角スペースは区切りとして半角に、前後trim
  let s = String(v).replace(/　/g, ' ').replace(/\s+/g, ' ').trim()
  // 先頭の食品群見出し ＜穀類＞ ＜調味料類＞ ＜魚介類＞ のみ除去（純粋なノイズ）。
  // 副分類 （まぐろ類）（しょうゆ類）等は魚種・種別情報を含むため残す（マッチング精度のため）。
  s = s.replace(/^＜[^＞]*＞\s*/, '')
  return s.trim()
}

const wb = xlsx.readFile(src)
const ws = wb.Sheets['表全体']
// セル参照で直接読む（A1形式）。データは13行目から。
const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false })

const COL = { code: 1, name: 3, kcal: 6, prot: 9, fat: 12, carb: 20, salt: 60 } // 0-index
const out = []
// 見出し行の高さを決め打ちせず全行走査。code5()＋食品名ガードでデータ行のみ採用
// （旧実装は i=12 開始で先頭3食品 01001-01003 を取りこぼしていた）
for (let i = 0; i < rows.length; i++) {
  const r = rows[i]
  const food_code = code5(r[COL.code])
  if (!food_code) continue
  const food_name = cleanName(r[COL.name])
  if (!food_name) continue
  out.push({
    food_code,
    food_name,
    energy_kcal: num(r[COL.kcal]),
    protein_g: num(r[COL.prot]),
    fat_g: num(r[COL.fat]),
    carbohydrate_g: num(r[COL.carb]),
    salt_g: num(r[COL.salt]),
  })
}

writeFileSync(join(ROOT, 'data', 'food_composition.json'), JSON.stringify(out, null, 2))
console.log(`food_composition: ${out.length} 件`)
// サニティチェック: 既知食品
const find = (q) => out.find((x) => x.food_name.includes(q))
for (const q of ['アマランサス', 'こいくちしょうゆ', 'にんじん 根 皮つき 生', '上白糖', '木綿豆腐']) {
  const f = find(q)
  console.log(' ', q, '→', f ? `${f.food_code} ${f.food_name} kcal=${f.energy_kcal} P=${f.protein_g} F=${f.fat_g} C=${f.carbohydrate_g} 塩=${f.salt_g}` : 'NOT FOUND')
}
