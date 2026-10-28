import type { DailyMenuFull, PickItem } from '../../lib/daily'
import type { ReloadBatch } from '../../lib/reloadBatch'

// 4帳票（作業指示書/検食簿/給食日誌/今日の献立）の共通props
export interface ReportProps {
  date: string
  data: DailyMenuFull | null
  reload: () => void
  editable: boolean
  pickSets: PickItem[]
  pickSnacks: PickItem[]
  pickError?: string | null // 献立ピッカーの取得失敗メッセージ（作業指示書の編集パネルで表示）
  bulk?: boolean // 一括印刷ページからの読み取り専用レンダー時 true（保存/印刷ボタンを出さない）
  afterSave?: ReloadBatch // 日別の画面が検食簿・給食日誌で共有する「保存の後の取り直し」のまとめ役（2026-10-28）
}
