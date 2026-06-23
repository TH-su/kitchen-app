import { supabase } from './supabase'

const one = (v: unknown): any => (Array.isArray(v) ? v[0] ?? null : v ?? null)

const RECIPE_SEL = 'dish_ingredients(amount_g, sort_order, ingredients(name))'
const SET_SEL = `code, category,
  staple:staple_dish_id(name, notes, ${RECIPE_SEL}),
  main:main_dish_id(name, notes, ${RECIPE_SEL}),
  side1:side1_dish_id(name, notes, ${RECIPE_SEL}),
  side2:side2_dish_id(name, notes, ${RECIPE_SEL}),
  soup:soup_dish_id(name, notes, ${RECIPE_SEL})`

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
}

const itemsOf = (dish: any): DayDishItem[] =>
  (dish?.dish_ingredients ?? [])
    .slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((di: any) => ({ name: one(di.ingredients)?.name ?? '?', perPerson: di.amount_g }))

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

export async function fetchDailyMenuByDate(date: string): Promise<DailyMenuFull | null> {
  const { data, error } = await supabase
    .from('daily_menus')
    .select(
      `id, menu_date, meal_count, note,
       breakfast_set_id, lunch_set_id, dinner_set_id, snack_dish_id,
       breakfast:breakfast_set_id(${SET_SEL}),
       lunch:lunch_set_id(${SET_SEL}),
       dinner:dinner_set_id(${SET_SEL}),
       snack:snack_dish_id(name, code, ${RECIPE_SEL})`
    )
    .eq('menu_date', date)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row: any = data
  const bf = one(row.breakfast)
  const ln = one(row.lunch)
  const dn = one(row.dinner)
  const sn = one(row.snack)
  return {
    id: row.id,
    menu_date: row.menu_date,
    meal_count: row.meal_count,
    note: row.note,
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
  }
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
  }
}

// 期間内の日々の献立をまとめて取得（一括印刷用）
export async function fetchDailyMenusRange(start: string, end: string): Promise<DailyMenuFull[]> {
  const { data, error } = await supabase
    .from('daily_menus')
    .select(
      `id, menu_date, meal_count, note,
       breakfast_set_id, lunch_set_id, dinner_set_id, snack_dish_id,
       breakfast:breakfast_set_id(${SET_SEL}),
       lunch:lunch_set_id(${SET_SEL}),
       dinner:dinner_set_id(${SET_SEL}),
       snack:snack_dish_id(name, code, ${RECIPE_SEL})`
    )
    .gte('menu_date', start)
    .lte('menu_date', end)
    .order('menu_date', { ascending: true })
    .limit(370) // 一括ビューの最大列挙(約1年)と整合
  if (error) throw error
  return (data ?? []).map(rowToFull)
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
}
export async function upsertDailyMenu(input: DailyMenuInput): Promise<number> {
  const { data, error } = await supabase
    .from('daily_menus')
    .upsert(input, { onConflict: 'menu_date' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as number
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
