// 検食簿・給食日誌の職員マスタ（report_staff）の型と CRUD。
//
// マイグレーション 0007 未適用でもアプリが壊れないよう、テーブル未作成は「例外」ではなく
// null（＝マスタ無し）として扱い、呼び出し側を env フォールバックへ落とす。
// これは daily.ts の列欠落ガード（reportColsAvailable）と同じ方針。
//
// PII: 氏名を扱うため RLS は read/write とも authenticated 限定（0007 参照）。console へ出さない。
import { supabase } from './supabase'

export type ReportStaff = {
  id: number
  name: string
  is_cook: boolean
  is_inspector: boolean
  active: boolean
  sort_order: number
}

const COLS = 'id, name, is_cook, is_inspector, active, sort_order'

/** テーブル未作成（未マイグレーション）を表すエラーか。42P01=undefined_table / PGRST205=スキーマキャッシュに無い */
export function isMissingStaffTable(e: any): boolean {
  if (!e) return false
  const code = String(e.code ?? '')
  const msg = `${e.message ?? ''} ${e.details ?? ''}`
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || /report_staff/i.test(msg)
}

/**
 * マスタ全件（使用停止も含む＝管理画面用）。テーブル未作成なら null。
 * 並びは sort_order → id（登録順が保たれる）。
 */
export async function fetchAllReportStaff(): Promise<ReportStaff[] | null> {
  const { data, error } = await supabase.from('report_staff').select(COLS).order('sort_order').order('id')
  if (error) {
    if (isMissingStaffTable(error)) return null
    throw error
  }
  return (data ?? []) as ReportStaff[]
}

/**
 * 候補生成用（使用中のみ）。テーブル未作成なら null＝呼び出し側は env フォールバックへ。
 * ※空配列（テーブルはあるが0件）は null と区別する。0件のときも env へ落とすかは呼び出し側の判断。
 */
export async function fetchActiveReportStaff(): Promise<ReportStaff[] | null> {
  const { data, error } = await supabase
    .from('report_staff')
    .select(COLS)
    .eq('active', true)
    .order('sort_order')
    .order('id')
  if (error) {
    if (isMissingStaffTable(error)) return null
    throw error
  }
  return (data ?? []) as ReportStaff[]
}

export async function insertReportStaff(input: {
  name: string
  is_cook: boolean
  is_inspector: boolean
}): Promise<void> {
  const { error } = await supabase.from('report_staff').insert({
    name: input.name.trim(),
    is_cook: input.is_cook,
    is_inspector: input.is_inspector,
  })
  if (error) throw error
}

/** 部分更新（役割チェック・使用停止・氏名の修正・並び順）。渡した列だけ更新＝非破壊 */
export async function updateReportStaff(
  id: number,
  patch: Partial<Pick<ReportStaff, 'name' | 'is_cook' | 'is_inspector' | 'active' | 'sort_order'>>
): Promise<void> {
  const { error } = await supabase.from('report_staff').update(patch).eq('id', id)
  if (error) throw error
}

/** 完全削除。過去の帳票は氏名を文字列で保持しているため記録は消えない */
export async function deleteReportStaff(id: number): Promise<void> {
  const { error } = await supabase.from('report_staff').delete().eq('id', id)
  if (error) throw error
}
