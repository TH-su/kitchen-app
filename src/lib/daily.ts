import { supabase } from './supabase'
import type { KenshokuRecord, NisshiRecord } from './reports'

const one = (v: unknown): any => (Array.isArray(v) ? v[0] ?? null : v ?? null)

// food_composition はエネルギー(energy_kcal)のみ取得。P/F/C/塩は現在どの画面にも表示されず
// （NutritionBar は未使用）、一括取得(最大370日×5スロット)で無駄な転送になるため外している。
// ※将来 NutritionBar 等でマクロ表示を再有効化する際は protein_g, fat_g, carbohydrate_g, salt_g を戻すこと。
const RECIPE_SEL =
  'dish_ingredients(amount_g, sort_order, ingredients(name, food_code, food_composition(energy_kcal)))'
const SET_SEL = `code, category,
  staple:staple_dish_id(name, notes, ${RECIPE_SEL}),
  main:main_dish_id(name, notes, ${RECIPE_SEL}),
  side1:side1_dish_id(name, notes, ${RECIPE_SEL}),
  side2:side2_dish_id(name, notes, ${RECIPE_SEL}),
  soup:soup_dish_id(name, notes, ${RECIPE_SEL})`

// 軽量版: 皿名のみ（dish_ingredients を取得しない）。献立掲示/職員週間表は品名しか使わないため、
// 食材ツリー全体の取得・保持を省いてメモリ/転送を大幅に削減する（items は空配列になる）。
const SET_SEL_LITE = `code, category,
  staple:staple_dish_id(name),
  main:main_dish_id(name),
  side1:side1_dish_id(name),
  side2:side2_dish_id(name),
  soup:soup_dish_id(name)`

// ---------- 一覧 ----------
export interface DailyMenuListItem {
  id: number
  menu_date: string
  meal_count: number
  breakfast: string | null
  lunch: string | null
  dinner: string | null
  snack: string | null
}

export async function fetchDailyMenus(): Promise<DailyMenuListItem[]> {
  const { data, error } = await supabase
    .from('daily_menus')
    .select(
      `id, menu_date, meal_count,
       breakfast:breakfast_set_id(code), lunch:lunch_set_id(code),
       dinner:dinner_set_id(code), snack:snack_dish_id(name)`
    )
    .order('menu_date', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id,
    menu_date: r.menu_date,
    meal_count: r.meal_count,
    breakfast: one(r.breakfast)?.code ?? null,
    lunch: one(r.lunch)?.code ?? null,
    dinner: one(r.dinner)?.code ?? null,
    snack: one(r.snack)?.name ?? null,
  }))
}

// ---------- 詳細（作業指示書） ----------
export interface DayDishItem {
  name: string
  perPerson: number | null
  // 1人前の栄養（成分表紐付け済みかつ分量入力済みのときのみ算出。それ以外は null）
  kcal: number | null
  protein: number | null
  fat: number | null
  carb: number | null
  salt: number | null
  hasData: boolean // 成分表に紐付け済みか（食材マスタに food_code あり）
}
export interface DaySlot {
  slot: string
  label: string
  name: string
  notes: string | null
  items: DayDishItem[]
}
export interface DayMeal {
  key: string
  label: string
  code: string | null
  slots: DaySlot[]
}
export interface DailyMenuFull {
  id: number
  menu_date: string
  meal_count: number
  note: string | null
  stapleGrainG: number // 主食1食あたりのグラム（既定160）。Phase C
  meals: DayMeal[]
  snack: { name: string; items: DayDishItem[] } | null
  breakfastCode: string | null
  lunchCode: string | null
  dinnerCode: string | null
  snackCode: string | null
  breakfastSetId: number | null
  lunchSetId: number | null
  dinnerSetId: number | null
  snackDishId: number | null
  kenshoku: KenshokuRecord | null // 検食簿の入力値（単日ページのみ取得）
  nisshi: NisshiRecord | null // 給食日誌の入力値（単日ページのみ取得）
}

const itemsOf = (dish: any): DayDishItem[] =>
  (dish?.dish_ingredients ?? [])
    .slice()
    .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((di: any): DayDishItem => {
      const ing = one(di.ingredients)
      const fc = one(ing?.food_composition)
      const amt = di.amount_g
      const f = amt != null ? amt / 100 : null
      const v = (x: number | null | undefined) => (f != null && x != null ? f * x : null)
      return {
        name: ing?.name ?? '?',
        perPerson: amt,
        kcal: v(fc?.energy_kcal),
        protein: v(fc?.protein_g),
        fat: v(fc?.fat_g),
        carb: v(fc?.carbohydrate_g),
        salt: v(fc?.salt_g),
        hasData: !!fc,
      }
    })

const SLOT_LABELS: [string, string][] = [
  ['staple', '主食'],
  ['main', 'メイン'],
  ['side1', '副菜①'],
  ['side2', '副菜②'],
  ['soup', '汁物'],
]
function setToSlots(setObj: any): DaySlot[] {
  if (!setObj) return []
  const out: DaySlot[] = []
  for (const [slot, label] of SLOT_LABELS) {
    const d = one(setObj[slot])
    if (!d) continue
    out.push({ slot, label, name: d.name, notes: d.notes ?? null, items: itemsOf(d) })
  }
  return out
}

// staple_grain_g 列の有無（0004マイグレーション未適用の環境でも取得が壊れないよう保護）。
// 稼働中にマイグレーションを適用するケースに備え、欠落判定はTTLで失効させ再挑戦を許す。
let stapleColMissingAt = 0 // 0 = 列ありとみなす
const STAPLE_RECHECK_MS = 60_000
function stapleColAvailable(): boolean {
  return stapleColMissingAt === 0 || Date.now() - stapleColMissingAt > STAPLE_RECHECK_MS
}
export function isStapleColAvailable(): boolean {
  return stapleColAvailable()
}
function markStapleMissing(): void {
  stapleColMissingAt = Date.now()
}
// 列欠落エラーの判定: select は Postgres 42703 / upsert は PostgREST PGRST204。message・details も見る
const isMissingStapleCol = (e: any): boolean =>
  stapleColAvailable() &&
  !!e &&
  (e.code === '42703' || e.code === 'PGRST204' || /staple_grain_g/i.test(`${e.message ?? ''} ${e.details ?? ''}`))

// kenshoku/nisshi 列（0005マイグレーション）の有無。staple と同方式で未適用環境でも取得が壊れないよう保護。
let reportColMissingAt = 0
function reportColsAvailable(): boolean {
  return reportColMissingAt === 0 || Date.now() - reportColMissingAt > STAPLE_RECHECK_MS
}
function markReportMissing(): void {
  reportColMissingAt = Date.now()
}
const isMissingReportCol = (e: any): boolean =>
  reportColsAvailable() &&
  !!e &&
  (e.code === '42703' || e.code === 'PGRST204' || /\b(kenshoku|nisshi)\b/i.test(`${e.message ?? ''} ${e.details ?? ''}`))

// withReports=true のときのみ kenshoku/nisshi を含める（単日ページ専用。一括取得には載せない＝転送削減）
function dailyCols(withReports = false): string {
  const reports = withReports && reportColsAvailable() ? ' kenshoku, nisshi,' : ''
  return `id, menu_date, meal_count, note,${stapleColAvailable() ? ' staple_grain_g,' : ''}${reports}
    breakfast_set_id, lunch_set_id, dinner_set_id, snack_dish_id,
    breakfast:breakfast_set_id(${SET_SEL}),
    lunch:lunch_set_id(${SET_SEL}),
    dinner:dinner_set_id(${SET_SEL}),
    snack:snack_dish_id(name, code, ${RECIPE_SEL})`
}

export async function fetchDailyMenuByDate(date: string): Promise<DailyMenuFull | null> {
  const run = () => supabase.from('daily_menus').select(dailyCols(true)).eq('menu_date', date).maybeSingle()
  let res = await run()
  if (res.error) {
    // 任意列(staple_grain_g / kenshoku / nisshi)が未適用環境で欠落したら、該当フラグを落として再取得
    const sMiss = isMissingStapleCol(res.error)
    const rMiss = isMissingReportCol(res.error)
    if (sMiss || rMiss) {
      if (sMiss) markStapleMissing()
      if (rMiss) markReportMissing()
      res = await run()
    }
  }
  if (res.error) throw res.error
  return res.data ? rowToFull(res.data) : null
}

function rowToFull(row: any): DailyMenuFull {
  const bf = one(row.breakfast)
  const ln = one(row.lunch)
  const dn = one(row.dinner)
  const sn = one(row.snack)
  return {
    id: row.id,
    menu_date: row.menu_date,
    meal_count: row.meal_count,
    note: row.note,
    stapleGrainG: normalizeGrainG(row.staple_grain_g ?? STAPLE_DEFAULT_G),
    meals: [
      { key: 'breakfast', label: '朝食', code: bf?.code ?? null, slots: setToSlots(bf) },
      { key: 'lunch', label: '昼食', code: ln?.code ?? null, slots: setToSlots(ln) },
      { key: 'dinner', label: '夕食', code: dn?.code ?? null, slots: setToSlots(dn) },
    ],
    snack: sn ? { name: sn.name, items: itemsOf(sn) } : null,
    breakfastCode: bf?.code ?? null,
    lunchCode: ln?.code ?? null,
    dinnerCode: dn?.code ?? null,
    snackCode: sn?.code ?? null,
    breakfastSetId: row.breakfast_set_id ?? null,
    lunchSetId: row.lunch_set_id ?? null,
    dinnerSetId: row.dinner_set_id ?? null,
    snackDishId: row.snack_dish_id ?? null,
    kenshoku: (row.kenshoku ?? null) as KenshokuRecord | null,
    nisshi: (row.nisshi ?? null) as NisshiRecord | null,
  }
}

// 期間内の日々の献立をまとめて取得（一括印刷用）
export async function fetchDailyMenusRange(start: string, end: string): Promise<DailyMenuFull[]> {
  const run = () =>
    supabase
      .from('daily_menus')
      .select(dailyCols())
      .gte('menu_date', start)
      .lte('menu_date', end)
      .order('menu_date', { ascending: true })
      .limit(370) // 一括ビューの最大列挙(約1年)と整合
  let res = await run()
  if (isMissingStapleCol(res.error)) { markStapleMissing(); res = await run() }
  if (res.error) throw res.error
  return (res.data ?? []).map(rowToFull)
}

// 期間内の献立を「皿名のみ」で取得（献立掲示 KondateBulkPage / 職員週間表 StaffWeekPage 用）。
// dish_ingredients も staple_grain_g も取得しない＝列欠落リトライも不要。
// items は空配列で rowToFull を再利用（両消費者は品名・おやつ名しか使わないため出力は不変）。
function dailyColsLite(): string {
  return `id, menu_date, meal_count, note,
    breakfast_set_id, lunch_set_id, dinner_set_id, snack_dish_id,
    breakfast:breakfast_set_id(${SET_SEL_LITE}),
    lunch:lunch_set_id(${SET_SEL_LITE}),
    dinner:dinner_set_id(${SET_SEL_LITE}),
    snack:snack_dish_id(name, code)`
}
export async function fetchDailyMenusRangeLite(start: string, end: string): Promise<DailyMenuFull[]> {
  const { data, error } = await supabase
    .from('daily_menus')
    .select(dailyColsLite())
    .gte('menu_date', start)
    .lte('menu_date', end)
    .order('menu_date', { ascending: true })
    .limit(370)
  if (error) throw error
  return (data ?? []).map(rowToFull)
}

// 検食簿/給食日誌の一括印刷用: 皿名(Lite)＋ kenshoku/nisshi 入力値のみ取得（食材ツリーは引かない）。
function dailyColsLiteReports(): string {
  const reports = reportColsAvailable() ? ' kenshoku, nisshi,' : ''
  return `id, menu_date, meal_count, note,${reports}
    breakfast_set_id, lunch_set_id, dinner_set_id, snack_dish_id,
    breakfast:breakfast_set_id(${SET_SEL_LITE}),
    lunch:lunch_set_id(${SET_SEL_LITE}),
    dinner:dinner_set_id(${SET_SEL_LITE}),
    snack:snack_dish_id(name, code)`
}
export async function fetchDailyReportsRange(start: string, end: string): Promise<DailyMenuFull[]> {
  const run = () =>
    supabase
      .from('daily_menus')
      .select(dailyColsLiteReports())
      .gte('menu_date', start)
      .lte('menu_date', end)
      .order('menu_date', { ascending: true })
      .limit(370)
  let res = await run()
  if (isMissingReportCol(res.error)) { markReportMissing(); res = await run() }
  if (res.error) throw res.error
  return (res.data ?? []).map(rowToFull)
}

// 食材ごとの総使用量を集計（全食事＋おやつ横断）
export interface IngredientTotal {
  name: string
  per: number
  tekiryo: boolean
}
export function aggregateTotals(data: DailyMenuFull): IngredientTotal[] {
  const sum = new Map<string, { per: number; tekiryo: boolean }>()
  const push = (items: DayDishItem[]) => {
    for (const it of items) {
      const cur = sum.get(it.name) ?? { per: 0, tekiryo: false }
      if (it.perPerson == null) cur.tekiryo = true
      else cur.per += it.perPerson
      sum.set(it.name, cur)
    }
  }
  for (const m of data.meals) for (const s of m.slots) push(s.items)
  if (data.snack) push(data.snack.items)
  return [...sum.entries()]
    .map(([name, v]) => ({ name, per: v.per, tekiryo: v.tekiryo }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

// ========== Phase C: 主食可変 ＋ 1,600kcal おかず自動増量 ==========
export const STAPLE_KCAL_PER_100G = 156 // 炊飯後ご飯（八訂 01088）
export const STAPLE_KCAL_PER_G = STAPLE_KCAL_PER_100G / 100 // 1.56
export const STAPLE_DEFAULT_G = 160
export const STAPLE_MAX_G = 220
export const KCAL_TARGET = 1600 // 1日下限目標
export const OKAZU_RMAX = 1.5 // おかず均一増量の上限倍率（暴走防止）
const KCAL_EPS = 0.5

if (!(OKAZU_RMAX >= 1)) throw new Error('OKAZU_RMAX は 1 以上で設定すること')

// 自動増量（1,600kcalへのおかず自動スケール）の有効/無効スイッチ。
// false = 一時無効化（倍率R=1固定＝素の材料量・素の栄養を表示）。ロジックは残置、true で即復活。
export const AUTO_SCALE_ENABLED = false

const isStaple = (slot: string) => slot === 'staple'
export const ceilG = (x: number) => Math.ceil(x)

// 主食量(g)の正規化: 非数/負は既定160、上限220でクランプ
export function normalizeGrainG(v: number | null | undefined): number {
  const n = Number(v)
  const g = Number.isFinite(n) && n >= 0 ? n : STAPLE_DEFAULT_G
  return Math.min(g, STAPLE_MAX_G)
}

// 表示用: 1人前のスケール後グラム（主食・適量・R=1 は原量のまま＝ceilしない）
export function scaledPerPerson(perPerson: number | null, slot: string, R: number): number | null {
  if (perPerson == null) return null
  if (isStaple(slot) || R <= 1) return perPerson
  return ceilG(perPerson * R)
}

export interface DailyNutritionEx {
  grainG: number // 1食あたり主食量（正規化後）
  stapleMeals: number // 主食スロットのある食事数（朝昼夕）
  stapleKcal: number // 1日の主食エネルギー
  okazuKcal: number // おかず（主食以外の食事）の1人前kcal（倍率適用前）
  snackKcal: number // おやつの1人前kcal（倍率非適用）
  scaleFactor: number // おかず均一倍率 R
  total: number // 1日合計（主食 + おかず×R + おやつ）
  reachable: boolean // 目標1,600に到達できるか
  reason: 'ok' | 'already_met' | 'cap_limited' | 'no_okazu_kcal'
  // 表示用マクロ（倍率適用後: おかず×R + おやつ。主食は未計上）
  protein: number
  fat: number
  carb: number
  salt: number
  itemsWithAmount: number
  itemsLinked: number
  missingNames: string[]
}

// 1日(1人前)の栄養＋1,600kcalへ届かせるおかず均一倍率Rを算出（要件1〜3）
export function dailyNutritionEx(data: DailyMenuFull, grainGin?: number): DailyNutritionEx {
  const grainG = normalizeGrainG(grainGin ?? data.stapleGrainG)
  const okazu = { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 }
  const snack = { kcal: 0, protein: 0, fat: 0, carb: 0, salt: 0 }
  let stapleMeals = 0
  let itemsWithAmount = 0
  let itemsLinked = 0
  const missing = new Set<string>()
  const add = (items: DayDishItem[], acc: typeof okazu) => {
    for (const it of items) {
      if (it.perPerson == null) continue // 適量は対象外
      itemsWithAmount++
      if (it.hasData) {
        itemsLinked++
        acc.kcal += it.kcal ?? 0
        acc.protein += it.protein ?? 0
        acc.fat += it.fat ?? 0
        acc.carb += it.carb ?? 0
        acc.salt += it.salt ?? 0
      } else missing.add(it.name)
    }
  }
  for (const m of data.meals) {
    let mealHasStaple = false
    for (const s of m.slots) {
      if (isStaple(s.slot)) { mealHasStaple = true; continue } // 主食はkcal/倍率の対象外（grainGで別計上）
      add(s.items, okazu)
    }
    if (mealHasStaple) stapleMeals++
  }
  if (data.snack) add(data.snack.items, snack) // おやつは合計に含むが倍率非適用

  const stapleKcal = grainG * STAPLE_KCAL_PER_G * stapleMeals
  const fixedKcal = stapleKcal + snack.kcal // 倍率がかからない固定分
  const total0 = fixedKcal + okazu.kcal

  let R = 1
  let reachable = true
  let reason: DailyNutritionEx['reason'] = 'ok'
  if (!AUTO_SCALE_ENABLED) {
    // 自動増量 一時無効化: 倍率1固定（素の材料量・素の栄養）。R/reachable/reason は既定のまま
  } else if (okazu.kcal <= KCAL_EPS) {
    // 増量する土台が無い（おかず未紐付け/0/負）
    reachable = total0 >= KCAL_TARGET
    reason = reachable ? 'ok' : 'no_okazu_kcal'
  } else if (total0 >= KCAL_TARGET) {
    reason = 'already_met' // 既達は減らさない（下限のみ）
  } else {
    const Rraw = (KCAL_TARGET - fixedKcal) / okazu.kcal // 必ず > 1
    R = Math.min(Math.max(Rraw, 1), OKAZU_RMAX)
    reachable = fixedKcal + okazu.kcal * OKAZU_RMAX >= KCAL_TARGET - KCAL_EPS
    reason = reachable ? 'ok' : 'cap_limited'
  }

  return {
    grainG,
    stapleMeals,
    stapleKcal,
    okazuKcal: okazu.kcal,
    snackKcal: snack.kcal,
    scaleFactor: R,
    total: fixedKcal + okazu.kcal * R,
    reachable,
    reason,
    protein: okazu.protein * R + snack.protein,
    fat: okazu.fat * R + snack.fat,
    carb: okazu.carb * R + snack.carb,
    salt: okazu.salt * R + snack.salt,
    itemsWithAmount,
    itemsLinked,
    missingNames: [...missing],
  }
}

// 1食分のエネルギー(kcal・1人分概算)。主食スロットがあれば grainG×STAPLE_KCAL_PER_G を加算し、
// おかず（主食以外・成分紐付け済み）の kcal を合算。おやつは主食スロットが無いためおやつkcalのみ。
// dailyNutritionEx と同一基準（自動増量OFF＝R=1）＝各食の合計は1日合計に一致。
export function mealKcal(slots: DaySlot[], grainG: number): number {
  let k = 0
  let hasStaple = false
  for (const s of slots) {
    if (isStaple(s.slot)) { hasStaple = true; continue }
    for (const it of s.items) if (it.hasData && it.perPerson != null) k += it.kcal ?? 0
  }
  if (hasStaple) k += normalizeGrainG(grainG) * STAPLE_KCAL_PER_G
  return k
}

// 食材別総使用量（倍率適用版）: おかず（食事・主食以外）は×R、主食・おやつは原量
export function aggregateTotalsScaled(data: DailyMenuFull, R: number): IngredientTotal[] {
  const sum = new Map<string, { per: number; tekiryo: boolean }>()
  const push = (items: DayDishItem[], slot: string, r: number) => {
    for (const it of items) {
      const cur = sum.get(it.name) ?? { per: 0, tekiryo: false }
      const sp = scaledPerPerson(it.perPerson, slot, r)
      if (sp == null) cur.tekiryo = true
      else cur.per += sp
      sum.set(it.name, cur)
    }
  }
  for (const m of data.meals) for (const s of m.slots) push(s.items, s.slot, R)
  if (data.snack) push(data.snack.items, 'snack', 1) // おやつは倍率非適用
  return [...sum.entries()]
    .map(([name, v]) => ({ name, per: v.per, tekiryo: v.tekiryo }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

// ========== Phase E: カロリー・材料量シミュレーション（主食160g固定・目標から逆算） ==========
export const SIM_STAPLE_G = 160 // 1食の標準主食量（固定値）
export const SIM_RMAX = 3 // 理想量倍率の上限（非現実値の暴走防止）
// 食事区分ごとの初期目標kcal（朝400-500/昼600前後/夕600弱/おやつ100-150の目安）
export const SIM_TARGET_DEFAULTS: Record<string, number> = {
  breakfast: 450,
  lunch: 600,
  dinner: 580,
  snack: 120,
}

export interface SimItem {
  name: string
  isStaple: boolean
  current: number | null // 現在の1人前g（適量=null）
  ideal: number | null // 理想の1人前g（おかず=現在×R、主食=160固定、適量=null）
}
export interface MealSim {
  key: string
  label: string
  hasStaple: boolean
  stapleKcal: number // 主食160g分のkcal（主食スロットがある食事のみ）
  okazuCurrentKcal: number // おかずの現在kcal（1人前）
  actualKcal: number // 実カロリー = 主食kcal + おかず現在kcal
  targetKcal: number
  scaleFactor: number // R（おかず理想量の倍率）
  reason: 'ok' | 'no_okazu' | 'staple_exceeds' | 'capped' | 'no_target'
  partialMissing: boolean // おかずに未紐付け(成分データ無し)食材が混在
  missingOkazuNames: string[]
  items: SimItem[]
}

// 1食分の逆算シミュレーション（表示専用・DBは一切変更しない）。
// 主食160g固定でそのkcalを差し引き、残りを「おかずの倍率R」で満たす理想量を算出。
export function simulateMeal(key: string, label: string, slots: DaySlot[], targetKcal: number): MealSim {
  const stapleSlot = slots.find((s) => isStaple(s.slot))
  const hasStaple = !!stapleSlot
  const stapleKcal = hasStaple ? SIM_STAPLE_G * STAPLE_KCAL_PER_G : 0

  // おかず（主食以外）の現在量・kcal。kcalは成分紐付け済み(hasData)のみ積算
  const okazu: { name: string; current: number | null; hasData: boolean }[] = []
  let okazuCurrentKcal = 0
  const missing = new Set<string>()
  for (const s of slots) {
    if (isStaple(s.slot)) continue
    for (const it of s.items) {
      okazu.push({ name: it.name, current: it.perPerson, hasData: it.hasData })
      if (it.perPerson != null) {
        if (it.hasData) okazuCurrentKcal += it.kcal ?? 0
        else missing.add(it.name) // 分量はあるが成分未紐付け＝kcal不明
      }
    }
  }

  const actualKcal = stapleKcal + okazuCurrentKcal
  const okazuTarget = targetKcal - stapleKcal
  let R = 1
  let reason: MealSim['reason'] = 'ok'
  if (targetKcal <= 0) {
    reason = 'no_target' // 目標未入力 → 倍率なし（現状維持）
  } else if (okazuCurrentKcal <= 0.5) {
    reason = 'no_okazu' // 増減の土台が無い（おかず未紐付け/0）
  } else if (okazuTarget <= 0) {
    R = 0
    reason = 'staple_exceeds' // 主食160gだけで目標到達/超過 → おかず不要
  } else {
    const raw = okazuTarget / okazuCurrentKcal
    R = Math.min(raw, SIM_RMAX)
    if (raw > SIM_RMAX) reason = 'capped' // 上限クランプ＝非現実的
  }

  // 倍率を実際に適用するのは ok / capped のときのみ。未紐付け食材は根拠が無いのでスケールしない
  const scaleOkazu = reason === 'ok' || reason === 'capped'
  const items: SimItem[] = []
  if (stapleSlot) items.push({ name: stapleSlot.name, isStaple: true, current: SIM_STAPLE_G, ideal: SIM_STAPLE_G })
  for (const it of okazu) {
    let ideal: number | null
    if (it.current == null) ideal = null
    else if (reason === 'staple_exceeds') ideal = 0
    else if (!scaleOkazu || !it.hasData) ideal = it.current // no_target/no_okazu/未紐付けは現状維持
    else ideal = Math.max(0, Math.round(it.current * R))
    items.push({ name: it.name, isStaple: false, current: it.current, ideal })
  }
  return {
    key, label, hasStaple, stapleKcal, okazuCurrentKcal, actualKcal, targetKcal, scaleFactor: R, reason,
    partialMissing: missing.size > 0, missingOkazuNames: [...missing], items,
  }
}

// ---------- 番号ピッカー用 ----------
export interface PickItem {
  id: number
  code: string
  category: string
  seq_no: number | null
  label: string
}
export async function fetchMenuSetPickList(): Promise<PickItem[]> {
  const { data, error } = await supabase
    .from('menu_sets')
    .select('id, code, category, seq_no, staple:staple_dish_id(name), main:main_dish_id(name)')
    .order('seq_no', { ascending: true, nullsFirst: false })
    .limit(2000)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    category: r.category,
    seq_no: r.seq_no,
    label: `${r.code}　${[one(r.staple)?.name, one(r.main)?.name].filter(Boolean).join(' / ')}`,
  }))
}
export async function fetchSnackPickList(): Promise<PickItem[]> {
  const { data, error } = await supabase
    .from('dishes')
    .select('id, code, name')
    .eq('dish_type', 'snack')
    .not('code', 'is', null)
    .order('id', { ascending: true })
    .limit(2000)
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    category: 'おやつ',
    seq_no: null,
    label: `${r.code}　${r.name}`,
  }))
}

// ---------- 更新（要ログイン） ----------
export interface DailyMenuInput {
  menu_date: string
  meal_count: number
  breakfast_set_id: number | null
  lunch_set_id: number | null
  dinner_set_id: number | null
  snack_dish_id: number | null
  note: string | null
  staple_grain_g: number // 主食1食あたりg（Phase C）
}
export async function upsertDailyMenu(input: DailyMenuInput): Promise<number> {
  const run = (payload: any) =>
    supabase.from('daily_menus').upsert(payload, { onConflict: 'menu_date' }).select('id').single()
  const { staple_grain_g, ...rest } = input
  let res = await run(stapleColAvailable() ? input : rest)
  if (isMissingStapleCol(res.error)) { markStapleMissing(); res = await run(rest) }
  if (res.error) throw res.error
  if (!res.data) throw new Error('献立の保存に失敗しました（サーバーから予期しない応答）')
  return res.data.id as number
}

// 検食簿/給食日誌の入力を保存。渡した jsonb 列のみ更新＝献立選択・他レポート列は非破壊（列単位 upsert）。
// menu_date キーの単一 upsert＝原子的（途中失敗で既存を失う窓が無い）。行が無い日は INSERT で作られる。
export async function saveDailyReport(
  menu_date: string,
  patch: { kenshoku: KenshokuRecord } | { nisshi: NisshiRecord }
): Promise<void> {
  const { error } = await supabase
    .from('daily_menus')
    .upsert({ menu_date, ...patch }, { onConflict: 'menu_date' })
    .select('id')
    .single()
  if (error) throw error
}

export async function deleteDailyMenu(id: number) {
  const { error } = await supabase.from('daily_menus').delete().eq('id', id)
  if (error) throw error
}

// 番号→id を保存時に DB で直接解決（ピッカー未読込・追加直後でも正しく解決する）
export async function resolveSetId(code: string, label: string): Promise<number | null> {
  const c = code.trim()
  if (!c) return null
  const { data, error } = await supabase.from('menu_sets').select('id').eq('code', c).maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`${label}の番号「${c}」が見つかりません`)
  return data.id as number
}
export async function resolveSnackId(code: string): Promise<number | null> {
  const c = code.trim()
  if (!c) return null
  const { data, error } = await supabase
    .from('dishes')
    .select('id')
    .eq('dish_type', 'snack')
    .eq('code', c)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error(`おやつの番号「${c}」が見つかりません`)
  return data.id as number
}
