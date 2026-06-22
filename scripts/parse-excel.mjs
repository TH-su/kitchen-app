// =====================================================================
// Excel（献立・作業指示書）→ 中間JSON 変換スクリプト
//   入力: 献立・作業指示書（改良版）.xlsx
//   出力: data/*.json （seed.mjs が Supabase へ投入）
//   実行: EXCEL_PATH=... node scripts/parse-excel.mjs
// =====================================================================
import xlsx from 'xlsx'
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const DATA_DIR = join(ROOT, 'data')

const SRC =
  process.env.EXCEL_PATH ||
  '/Volumes/【ラウレアハレ共有】/【厨房】/【10. 厨房】/作業指示書R8年度/献立・作業指示書（改良版） .xlsx'

// ---- ユーティリティ ----
const CIRCLED =
  '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛㉜㉝㉞㉟㊱㊲㊳㊴㊵㊶㊷㊸㊹㊺㊻㊼㊽㊾㊿'
// 番号文字（丸数字 + 半角/全角数字）の判定用
const NUM_CHARS = /[0-9０-９①-⑳㉑-㉟㊱-㊿]/

function seqFromCode(code) {
  let digits = ''
  for (const ch of code) {
    const idx = CIRCLED.indexOf(ch)
    if (idx >= 0) return idx + 1 // 丸数字は1文字で番号確定
    if (/[0-9]/.test(ch)) digits += ch
    else if (/[０-９]/.test(ch)) digits += String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  }
  return digits ? parseInt(digits, 10) : null
}

function categoryFromCode(code) {
  // 番号文字を除いた接頭辞（朝/魚/豚…）
  return [...code].filter((ch) => !NUM_CHARS.test(ch)).join('').trim()
}

// 都道府県名のメニューは「ご当地」カテゴリに束ねる
const PREFECTURES = [
  '北海道','青森','岩手','宮城','秋田','山形','福島','茨城','栃木','群馬','埼玉','千葉','東京','神奈川',
  '新潟','富山','石川','福井','山梨','長野','岐阜','静岡','愛知','三重','滋賀','京都','大阪','兵庫',
  '奈良','和歌山','鳥取','島根','岡山','広島','山口','徳島','香川','愛媛','高知','福岡','佐賀','長崎',
  '熊本','大分','宮崎','鹿児島','沖縄',
]
const isPrefecture = (code) => PREFECTURES.some((p) => code.startsWith(p))

function clean(v) {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/　/g, ' ').trim()
  return s === '' ? null : s
}

function num(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).replace(/　/g, '').trim()
  if (s === '') return null
  const n = Number(s)
  return Number.isNaN(n) ? null : n
}

// 文字集合のJaccard類似度（料理名の表記ゆれ判定用）
function charSet(s) {
  return new Set([...String(s).replace(/\s|　/g, '')])
}
function jaccard(a, b) {
  const A = charSet(a)
  const B = charSet(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const c of A) if (B.has(c)) inter++
  return inter / (A.size + B.size - inter)
}
const SIM_THRESHOLD = 0.34
const isSoupName = (n) => /汁|スープ|すまし/.test(n)

// ---- 読み込み ----
console.log('読込:', SRC)
const wb = xlsx.readFile(SRC)
const sheet = (name) =>
  xlsx.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null })

// ---- 1) all: 献立セット + スロット名称 ----
const allRows = sheet('all')
// H〜X列 = カテゴリラベル列。ヘッダ行(R1)に正式名(朝/豚/鶏/牛/魚/ミンチ/その他/めん/行事)、
// 各データ行は該当列にのみ値(略記)が入る → 「値が入っている列のヘッダ名」が正式カテゴリ
const CAT_COLS = [7, 9, 11, 13, 15, 17, 19, 21, 23] // H J L N P R T V X
const catName = {}
for (const c of CAT_COLS) catName[c] = clean(allRows[0][c])

const menuSets = [] // {code, category, seq_no, slots:{staple,main,side1,side2,soup}}
for (let i = 1; i < allRows.length; i++) {
  const r = allRows[i]
  const code = clean(r[0]) // A
  if (!code) continue
  const slots = {
    staple: clean(r[1]), // B 主食
    main: clean(r[2]), // C メイン
    side1: clean(r[3]), // D 副①
    side2: clean(r[4]), // E 副②
    soup: clean(r[5]), // F 汁
  }
  if (!Object.values(slots).some(Boolean)) continue
  // カテゴリ = 値の入った列のヘッダ名 / seq_no = その隣の番号列
  let category = null
  let seq_no = null
  for (const c of CAT_COLS) {
    if (clean(r[c]) !== null) {
      category = catName[c]
      seq_no = num(r[c + 1])
      break
    }
  }
  if (!category) category = isPrefecture(code) ? 'ご当地' : categoryFromCode(code) // フォールバック
  if (seq_no === null) seq_no = seqFromCode(code)
  menuSets.push({ code, category, seq_no, slots })
}

// ---- 2) all指示書: 各codeの料理行(食材分量) ----
const sansRows = sheet('all指示書')
const recipesByCode = {} // code -> [{name, ingredients:[{name,amount}]}]
const MAX_PAIR_COL = 21 // C(2)〜V(21) の10ペアまでを食材とみなす（W以降はメモ列）
for (let i = 0; i < sansRows.length; i++) {
  const r = sansRows[i]
  const code = clean(r[0]) // A
  const name = clean(r[1]) // B 料理名
  if (!code || !name) continue
  const ingredients = []
  for (let c = 2; c <= MAX_PAIR_COL && c < r.length; c += 2) {
    const ingName = clean(r[c])
    if (!ingName) continue
    ingredients.push({ name: ingName, amount: num(r[c + 1]) }) // amount null = 適量
  }
  ;(recipesByCode[code] ||= []).push({ name, ingredients })
}

// ---- 3) スロット ↔ レシピ のマッチング → dishes / dish_ingredients ----
const SLOT_TYPE = { staple: 'staple', main: 'main', side1: 'side', side2: 'side', soup: 'soup' }
const dishes = [] // {owner_code, slot, name, dish_type, code, notes, ingredients[]}
let unmatchedSlots = 0
let orderFallback = 0
const fbLog = [] // 順序フォールバックの記録（検証用）
const unmatchedLog = [] // レシピが見つからなかったスロット（検証用）

for (const ms of menuSets) {
  const recipes = recipesByCode[ms.code] || []
  const slotsOrder = ['staple', 'main', 'side1', 'side2', 'soup'].filter((s) => ms.slots[s])
  const assign = {} // slot -> recipeIndex
  const used = new Set()
  // pass1: 名称完全一致
  for (const slot of slotsOrder) {
    const ri = recipes.findIndex((rc, idx) => !used.has(idx) && rc.name === ms.slots[slot])
    if (ri >= 0) {
      assign[slot] = ri
      used.add(ri)
    }
  }
  // pass2: 残りスロットを「類似度最大の残レシピ」へ割当（表記ゆれ救済／別物は割当しない）
  const remainSlots = slotsOrder.filter((s) => assign[s] === undefined)
  for (const slot of remainSlots) {
    const slotName = ms.slots[slot]
    let best = -1
    let bestSim = 0
    recipes.forEach((rc, idx) => {
      if (used.has(idx)) return
      const sim = jaccard(slotName, rc.name)
      if (sim > bestSim) {
        bestSim = sim
        best = idx
      }
    })
    let chosen = -1
    if (best >= 0 && bestSim >= SIM_THRESHOLD) {
      chosen = best
    } else if (slot === 'soup') {
      // 汁物救済: 汁物名(みそ汁/すまし汁/スープ)の余りレシピがあれば割当
      const si = recipes.findIndex((rc, idx) => !used.has(idx) && isSoupName(rc.name))
      if (si >= 0) {
        chosen = si
        bestSim = jaccard(slotName, recipes[si].name)
      }
    }
    if (chosen >= 0) {
      assign[slot] = chosen
      used.add(chosen)
      orderFallback++
      fbLog.push({ code: ms.code, slot, slotName, recipeName: recipes[chosen].name, sim: bestSim.toFixed(2) })
    }
  }
  // dish 生成
  for (const slot of slotsOrder) {
    const ri = assign[slot]
    const ingredients = ri !== undefined ? recipes[ri].ingredients : []
    if (ri === undefined) {
      unmatchedSlots++
      unmatchedLog.push({ code: ms.code, slot, slotName: ms.slots[slot] })
    }
    dishes.push({
      owner_code: ms.code,
      slot,
      name: ms.slots[slot],
      dish_type: SLOT_TYPE[slot],
      code: null,
      notes: null,
      ingredients,
    })
  }
}

// ---- 4) おやつ / 副菜 マスタ（単品・再利用番号付き） ----
const snacks = []
for (const r of sheet('おやつ')) {
  const code = clean(r[0])
  const name = clean(r[1])
  if (!code || !name) continue
  snacks.push({ owner_code: null, slot: null, name, dish_type: 'snack', code, notes: null, ingredients: [] })
}
const sideMaster = []
for (const r of sheet('副菜')) {
  const code = clean(r[0])
  const name = clean(r[1])
  if (!code || !name) continue
  sideMaster.push({ owner_code: null, slot: null, name, dish_type: 'side', code, notes: null, ingredients: [] })
}

// ---- 5) 食材マスタ（全レシピの食材名ユニーク） ----
const ingSet = new Set()
for (const d of dishes) for (const ing of d.ingredients) ingSet.add(ing.name)
const ingredients = [...ingSet].sort((a, b) => a.localeCompare(b, 'ja')).map((name) => ({ name }))

// ---- 出力 ----
mkdirSync(DATA_DIR, { recursive: true })
const out = (f, obj) => writeFileSync(join(DATA_DIR, f), JSON.stringify(obj, null, 2))
out('menu_sets.json', menuSets)
out('dishes.json', dishes) // セット内料理
out('snacks.json', snacks)
out('side_dishes.json', sideMaster)
out('ingredients.json', ingredients)

// ---- 検証ログ ----
console.log('\n=== 件数 ===')
console.log('menu_sets      :', menuSets.length)
console.log('dishes(セット内):', dishes.length)
console.log('snacks         :', snacks.length)
console.log('side_master    :', sideMaster.length)
console.log('ingredients    :', ingredients.length)
console.log('未マッチスロット:', unmatchedSlots, '/ 順序フォールバック:', orderFallback)
console.log('\n=== 類似度フォールバック内訳（スロット名 ← 割当レシピ名 / 類似度）===')
for (const f of fbLog)
  console.log(`  ${f.code} [${f.slot}] "${f.slotName}" ← "${f.recipeName}" (類似${f.sim})`)
console.log('\n=== レシピ未発見スロット ===')
for (const u of unmatchedLog) console.log(`  ${u.code} [${u.slot}] "${u.slotName}"`)

// カテゴリ別 menu_set 数
const catCount = {}
for (const ms of menuSets) catCount[ms.category] = (catCount[ms.category] || 0) + 1
console.log('カテゴリ別:', catCount)

// 魚⑨ の中身を Excel と突合
console.log('\n=== 魚⑨ 検証 ===')
for (const d of dishes.filter((d) => d.owner_code === '魚⑨')) {
  const items = d.ingredients.map((i) => `${i.name}${i.amount ?? '(適量)'}`).join(' / ')
  console.log(`  [${d.slot}] ${d.name}: ${items || '(食材なし)'}`)
}

// 食材ペア上限チェック（10ペア超や記号混入の検出）
console.log('\n=== 警告チェック ===')
let suspNames = new Set()
for (const d of dishes) {
  for (const ing of d.ingredients) {
    if (/計って|※|参照|ｇ|人分/.test(ing.name)) suspNames.add(ing.name)
  }
}
console.log('注記混入の疑いがある食材名:', [...suspNames].slice(0, 20))
console.log('\n出力先:', DATA_DIR)
