// 期間内の「未記入の検食簿/給食日誌」をまとめて自動補完して保存する。
//
// 設計は useDailyReport の autoPersist と同じ原則:
//   - 基底は必ず DB の最新値（fetchReportColumn）。画面 state からは作らない。
//   - applyAuto は空欄のみ埋める（fillEmpty）ので、手入力済みの値・所見は絶対に上書きしない。
//   - 差分が無い日は書き込まない（冪等）。
//   - 未来日は絶対に書かない（まだ提供していない日を埋めない）。
import { fetchReportColumn, saveDailyReport } from './daily'
import { todayStr } from './date'

export type BackfillResult = { filled: number; skipped: number; failed: number }

export async function backfillReports<T extends object>(opts: {
  dates: string[]
  column: 'kenshoku' | 'nisshi'
  empty: () => T
  merge: (base: T, saved: any) => T
  applyAuto: (saved: T, menuDate: string, editable: boolean) => T
  onProgress?: (done: number, total: number) => void
}): Promise<BackfillResult> {
  const { dates, column, empty, merge, applyAuto, onProgress } = opts
  const today = todayStr()
  // 未来日はここで落とす（applyAuto 側の autoScope と二重で防御）
  const targets = dates.filter((d) => d <= today)
  const res: BackfillResult = { filled: 0, skipped: dates.length - targets.length, failed: 0 }

  let done = 0
  for (const d of targets) {
    try {
      const fresh = await fetchReportColumn(d, column)
      const base = merge(empty(), fresh)
      const auto = applyAuto(base, d, true)
      if (JSON.stringify(auto) !== JSON.stringify(base)) {
        await saveDailyReport(d, { [column]: auto } as any)
        res.filled++
      } else {
        res.skipped++ // 既に埋まっている＝書き込む必要なし
      }
    } catch {
      // 1日失敗しても全体は止めない（次の日へ）。値を壊す操作はしていない
      res.failed++
    }
    done++
    onProgress?.(done, targets.length)
  }
  return res
}
