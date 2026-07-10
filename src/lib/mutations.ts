import { supabase } from './supabase'

// 書き込み系（要ログイン: RLS の write_auth ポリシー）。
// エラーは throw し、呼び出し側で表示する。

export type SlotKey = 'staple' | 'main' | 'side1' | 'side2' | 'soup'

export const SLOT_TYPE: Record<SlotKey, string> = {
  staple: 'staple',
  main: 'main',
  side1: 'side',
  side2: 'side',
  soup: 'soup',
}
export const SLOT_COL: Record<SlotKey, string> = {
  staple: 'staple_dish_id',
  main: 'main_dish_id',
  side1: 'side1_dish_id',
  side2: 'side2_dish_id',
  soup: 'soup_dish_id',
}

export interface RecipeRowInput {
  name: string
  amount_g: number | null
}

// 食材を名前で upsert して id を返す（無ければ作成）
export async function ensureIngredient(name: string): Promise<number> {
  const n = name.trim()
  const { data, error } = await supabase
    .from('ingredients')
    .upsert({ name: n }, { onConflict: 'name' })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// 複数食材を1往復でまとめて upsert し、name→id の対応表を返す（N+1回避）
export async function ensureIngredients(names: string[]): Promise<Map<string, number>> {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  if (!uniq.length) return new Map()
  const { data, error } = await supabase
    .from('ingredients')
    .upsert(
      uniq.map((name) => ({ name })),
      { onConflict: 'name' }
    )
    .select('id, name')
  if (error) throw error
  return new Map((data ?? []).map((r: any) => [r.name as string, r.id as number]))
}

// 料理のレシピ明細を入れ替える。
// データ損失防止: 破壊的な「全削除」は、食材ID解決・挿入データの構築が
// すべて成功してから最後に実行する（失敗しやすい処理を DELETE より前へ寄せる）。
// 入れ替え本体は DB 関数 replace_dish_recipe（migration 0006）で1トランザクション化
// しており、DELETE 成功→INSERT 失敗（通信断・制約違反）で既存レシピだけが消える
// 窓は存在しない（失敗時は DELETE ごと巻き戻る）。
export async function saveDishRecipe(dishId: number, rows: RecipeRowInput[]) {
  // 1) 入力を正規化・重複排除（同名食材は先勝ちで1行に集約）。DBに触る前に確定させる
  const seen = new Set<string>()
  const clean = rows
    .map((r) => ({ name: r.name.trim(), amount_g: r.amount_g }))
    .filter((r) => {
      if (!r.name || seen.has(r.name)) return false
      seen.add(r.name)
      return true
    })

  // 2) 食材IDを1往復で一括解決し、挿入ペイロードを先に構築。
  //    ここで失敗しても既存レシピは無傷（入れ替え前のため）
  const idByName = await ensureIngredients(clean.map((r) => r.name))
  const payload = clean.map((r, i) => {
    const ingredient_id = idByName.get(r.name)
    if (ingredient_id == null) throw new Error(`食材「${r.name}」の登録に失敗しました`)
    return { ingredient_id, amount_g: r.amount_g, sort_order: i }
  })

  // 3) ここまで成功して初めて既存明細を入れ替える（空配列＝レシピを空にする意図・従来どおり）
  const { error } = await supabase.rpc('replace_dish_recipe', {
    p_dish_id: dishId,
    p_rows: payload,
  })
  if (error) throw error
}

export async function updateDishName(dishId: number, name: string) {
  const { error } = await supabase.from('dishes').update({ name: name.trim() }).eq('id', dishId)
  if (error) throw error
}

// 献立セットの空きスロットに料理を新規作成して FK を張る → dish_id を返す
export async function createSlotDish(menuSetId: number, slot: SlotKey, name: string): Promise<number> {
  const { data, error } = await supabase
    .from('dishes')
    .insert({ name: name.trim(), dish_type: SLOT_TYPE[slot], owner_menu_set_id: menuSetId })
    .select('id')
    .single()
  if (error) throw error
  const { error: e2 } = await supabase
    .from('menu_sets')
    .update({ [SLOT_COL[slot]]: data.id })
    .eq('id', menuSetId)
  if (e2) {
    // FK 更新に失敗したら作成した dish を破棄（スロット未接続の残骸を防ぐ）
    await supabase.from('dishes').delete().eq('id', data.id)
    throw e2
  }
  return data.id
}

// スロットを空にする（FK を null にして料理を削除＝レシピも cascade 削除）
export async function clearSlot(menuSetId: number, slot: SlotKey, dishId: number) {
  const { error } = await supabase
    .from('menu_sets')
    .update({ [SLOT_COL[slot]]: null })
    .eq('id', menuSetId)
  if (error) throw error
  const { error: e2 } = await supabase.from('dishes').delete().eq('id', dishId)
  if (e2) throw e2
}

export async function createMenuSet(input: { code: string; category: string; seq_no: number | null }) {
  const { data, error } = await supabase
    .from('menu_sets')
    .insert({ code: input.code.trim(), category: input.category.trim(), seq_no: input.seq_no })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error('この番号は既に登録されています')
    throw error
  }
  return data.id as number
}

export async function deleteMenuSet(id: number) {
  // owned dishes と dish_ingredients は FK cascade で消える
  const { error } = await supabase.from('menu_sets').delete().eq('id', id)
  if (error) throw error
}

// おやつ / 副菜（単品・code 付き）
export async function createSimpleDish(type: 'snack' | 'side', code: string, name: string) {
  const { error } = await supabase
    .from('dishes')
    .insert({ dish_type: type, code: code.trim() || null, name: name.trim() })
  if (error) throw error
}
export async function updateSimpleDish(id: number, code: string, name: string) {
  const { error } = await supabase
    .from('dishes')
    .update({ code: code.trim() || null, name: name.trim() })
    .eq('id', id)
  if (error) throw error
}
export async function deleteSimpleDish(id: number) {
  const { error } = await supabase.from('dishes').delete().eq('id', id)
  if (error) throw error
}
