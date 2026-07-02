import { supabase } from './supabase'

// to-one 埋め込みは object、稀に配列で返るため正規化
const one = (v: unknown): any => (Array.isArray(v) ? v[0] ?? null : v ?? null)
const nameOf = (v: unknown): string | null => one(v)?.name ?? null

const CATEGORY_ORDER = ['朝', '豚', '鶏', '牛', '魚', 'ミンチ', 'めん', '行事', 'その他', 'ご当地']

export async function fetchCategories(): Promise<string[]> {
  // 注: PostgREST のデフォルト上限は1000行。menu_sets が1000件を超えたら
  // DB側 distinct（RPC/ビュー）へ移行する想定（現状249件で問題なし）。
  const { data, error } = await supabase.from('menu_sets').select('category').limit(2000)
  if (error) throw error
  const cats = [...new Set((data ?? []).map((r: any) => r.category as string))]
  cats.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a)
    const ib = CATEGORY_ORDER.indexOf(b)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  return cats
}

export interface MenuSetListItem {
  id: number
  code: string
  category: string
  seq_no: number | null
  staple: string | null
  main: string | null
  side1: string | null
  side2: string | null
  soup: string | null
}

export async function fetchMenuSets(category: string): Promise<MenuSetListItem[]> {
  const { data, error } = await supabase
    .from('menu_sets')
    .select(
      `id, code, category, seq_no,
       staple:staple_dish_id(name),
       main:main_dish_id(name),
       side1:side1_dish_id(name),
       side2:side2_dish_id(name),
       soup:soup_dish_id(name)`
    )
    .eq('category', category)
    .order('seq_no', { ascending: true, nullsFirst: false })
    .order('code', { ascending: true })
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    id: r.id,
    code: r.code,
    category: r.category,
    seq_no: r.seq_no,
    staple: nameOf(r.staple),
    main: nameOf(r.main),
    side1: nameOf(r.side1),
    side2: nameOf(r.side2),
    soup: nameOf(r.soup),
  }))
}

export interface RecipeItem {
  name: string
  amount_g: number | null
  sort_order: number
}
export interface SlotDish {
  slot: string
  label: string
  dishId: number
  name: string
  items: RecipeItem[]
  kcal: number // 1人分の合計エネルギー(概算・成分紐付け済み＆分量入力済みのみ)
}
export interface MenuSetDetail {
  id: number
  code: string
  category: string
  seq_no: number | null
  slots: SlotDish[]
}

const SLOT_LABELS: [string, string][] = [
  ['staple', '主食'],
  ['main', 'メイン'],
  ['side1', '副菜①'],
  ['side2', '副菜②'],
  ['soup', '汁物'],
]

function toSlotDish(slot: string, label: string, v: unknown): SlotDish | null {
  const d = one(v)
  if (!d) return null
  const raw = d.dish_ingredients ?? []
  const items: RecipeItem[] = raw
    .map((di: any) => ({
      name: one(di.ingredients)?.name ?? '?',
      amount_g: di.amount_g,
      sort_order: di.sort_order,
    }))
    .sort((a: RecipeItem, b: RecipeItem) => a.sort_order - b.sort_order)
  // 1人分の合計エネルギー(概算・成分紐付け済み＆分量入力済みのみ計上)
  let kcal = 0
  for (const di of raw) {
    const fc = one(one(di.ingredients)?.food_composition)
    if (di.amount_g != null && fc?.energy_kcal != null) kcal += (di.amount_g / 100) * fc.energy_kcal
  }
  return { slot, label, dishId: d.id, name: d.name, items, kcal }
}

export async function fetchMenuSetDetail(id: number): Promise<MenuSetDetail | null> {
  const recipe = 'dish_ingredients(amount_g, sort_order, ingredients(name, food_code, food_composition(energy_kcal)))'
  const { data, error } = await supabase
    .from('menu_sets')
    .select(
      `id, code, category, seq_no,
       staple:staple_dish_id(id, name, ${recipe}),
       main:main_dish_id(id, name, ${recipe}),
       side1:side1_dish_id(id, name, ${recipe}),
       side2:side2_dish_id(id, name, ${recipe}),
       soup:soup_dish_id(id, name, ${recipe})`
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as any
  const slots = SLOT_LABELS.map(([slot, label]) => toSlotDish(slot, label, row[slot])).filter(
    (x): x is SlotDish => x !== null
  )
  return { id: row.id, code: row.code, category: row.category, seq_no: row.seq_no, slots }
}

// おやつ / 副菜（単品・code付きの再利用マスタ）
export interface SimpleDish {
  id: number
  code: string | null
  name: string
}
export async function fetchDishesByType(type: 'snack' | 'side'): Promise<SimpleDish[]> {
  const { data, error } = await supabase
    .from('dishes')
    .select('id, code, name')
    .eq('dish_type', type)
    .not('code', 'is', null)
    .order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as SimpleDish[]
}

// 食材名の一覧（レシピ編集の入力補完用）
export async function fetchAllIngredientNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('ingredients')
    .select('name')
    .order('name', { ascending: true })
    .limit(5000)
  if (error) throw error
  return (data ?? []).map((r: any) => r.name as string)
}
