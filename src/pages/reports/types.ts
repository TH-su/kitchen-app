import type { DailyMenuFull, PickItem } from '../../lib/daily'

// 4帳票（作業指示書/検食簿/給食日誌/今日の献立）の共通props
export interface ReportProps {
  date: string
  data: DailyMenuFull | null
  reload: () => void
  editable: boolean
  pickSets: PickItem[]
  pickSnacks: PickItem[]
}
