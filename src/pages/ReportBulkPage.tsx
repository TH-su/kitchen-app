import { useState, type ReactNode } from 'react'
import { fetchDailyReportsRange, type DailyMenuFull } from '../lib/daily'
import { todayStr } from '../lib/date'
import { useLoader } from '../hooks/useLoader'
import { useAuth } from '../hooks/useAuth'
import { backfillReports } from '../lib/backfill'

// 検食簿・給食日誌に共通の画面枠（両者は操作・レイアウトが同一のため1本化して食い違いを防ぐ）。
//   記入モード（既定）… 単日のみ表示。前日/当日/翌日ボタン＋カレンダーで移動し、その場で編集・自動保存。
//   印刷モード        … 開始日〜終了日の期間を読み取り専用で表示し、まとめて印刷／未記入を一括補完。

function addDays(iso: string, n: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}
function enumerateDates(s: string, e: string): string[] {
  const out: string[] = []
  let cur = s
  for (let i = 0; i < 366 && cur <= e; i++) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

const BTN = 'min-h-[44px] px-3 rounded border bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50'
const ARROW = 'min-h-[44px] px-2 rounded border bg-white text-slate-700 text-sm hover:bg-slate-50'
const DATE_INPUT = 'block border rounded px-2 min-h-[44px] text-sm'

export type ReportBulkPageProps = {
  title: string
  pageClass: string // .kenshoku-page / .nisshi-page（印刷の改ページ用・index.css 側の定義に対応）
  column: 'kenshoku' | 'nisshi'
  empty: () => any
  merge: (base: any, saved: any) => any
  applyAuto: (saved: any, menuDate: string, editable: boolean) => any
  renderForm: (d: DailyMenuFull, editable: boolean, bulk: boolean, reload: () => void) => ReactNode
}

export default function ReportBulkPage({
  title,
  pageClass,
  column,
  empty,
  merge,
  applyAuto,
  renderForm,
}: ReportBulkPageProps) {
  const { editable: authEditable } = useAuth()
  const [mode, setMode] = useState<'edit' | 'print'>('edit')

  // 記入モード＝単日
  const [day, setDay] = useState(todayStr())
  // 印刷モード＝期間（表示ボタンで確定＝1文字打つたびに再取得しない）
  const [start, setStart] = useState(todayStr())
  const [end, setEnd] = useState(todayStr())
  const [printRange, setPrintRange] = useState({ s: todayStr(), e: todayStr() })

  const range = mode === 'edit' ? { s: day, e: day } : printRange
  const { data, loading, error, reload } = useLoader(() => fetchDailyReportsRange(range.s, range.e), [range.s, range.e])
  const items = data ?? []

  const isEdit = mode === 'edit'
  const editable = isEdit && authEditable
  const today = todayStr()
  const futureDay = isEdit && day > today

  const allDates = enumerateDates(range.s, range.e)
  const present = new Set(items.map((d) => d.menu_date))
  const missing = allDates.filter((d) => !present.has(d))
  const rangeDays = allDates.length

  // ---- 未記入の一括補完（印刷モード）----
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const runBackfill = async () => {
    const targets = items.map((d) => d.menu_date).filter((d) => d <= today) // 未来日は対象外
    if (targets.length === 0) {
      setResult('補完できる日がありません（未来日のみ、または該当する献立がありません）')
      return
    }
    const ok = window.confirm(
      `${targets.length}日分の未記入欄を自動補完して保存します。よろしいですか？\n※すでに手入力されている値・所見は変更されません。`
    )
    if (!ok) return
    setBusy(true)
    setResult(null)
    setProgress({ done: 0, total: targets.length })
    try {
      const r = await backfillReports({
        dates: targets,
        column,
        empty,
        merge,
        applyAuto,
        onProgress: (done, total) => setProgress({ done, total }),
      })
      setResult(`補完 ${r.filled}日 ／ 変更なし ${r.skipped}日${r.failed ? ` ／ 失敗 ${r.failed}日` : ''}`)
      reload()
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div>
      <div className="bg-white border rounded p-3 mb-4 print:hidden">
        {/* モード切替 */}
        <div className="inline-flex rounded border overflow-hidden mb-3" role="group" aria-label="表示モード">
          <button
            type="button"
            aria-pressed={isEdit}
            onClick={() => setMode('edit')}
            className={`min-h-[44px] px-4 text-sm ${isEdit ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700'}`}
          >
            記入（1日）
          </button>
          <button
            type="button"
            aria-pressed={!isEdit}
            onClick={() => setMode('print')}
            className={`min-h-[44px] px-4 text-sm border-l ${!isEdit ? 'bg-amber-600 text-white' : 'bg-white text-slate-700'}`}
          >
            印刷（期間）
          </button>
        </div>

        {isEdit ? (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              日付
              <div className="mt-1 flex items-center gap-1">
                <button type="button" onClick={() => setDay(addDays(day, -1))} className={ARROW} aria-label="前日へ">
                  ← 前日
                </button>
                <button type="button" onClick={() => setDay(today)} className={BTN} aria-label="当日へ">
                  当日
                </button>
                <button type="button" onClick={() => setDay(addDays(day, 1))} className={ARROW} aria-label="翌日へ">
                  翌日 →
                </button>
                <input
                  type="date"
                  value={day}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                  className={`${DATE_INPUT} ml-1`}
                  aria-label="日付を選択"
                />
              </div>
            </label>
            <span className="text-sm text-slate-500">
              {day === today ? '当日（記入）' : futureDay ? '未来日' : '過去日（記入）'}
            </span>
            {futureDay && (
              <span className="text-sm text-slate-500">※未来日は自動補完されません（提供後に記入されます）</span>
            )}
            {!authEditable && <span className="text-sm text-slate-500">※編集にはログインが必要です</span>}
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              開始日
              <div className="mt-1 flex items-center gap-1">
                <button type="button" onClick={() => setStart(addDays(start, -1))} className={ARROW} aria-label="開始日 前日">
                  ←
                </button>
                <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={DATE_INPUT} />
                <button type="button" onClick={() => setStart(addDays(start, 1))} className={ARROW} aria-label="開始日 翌日">
                  →
                </button>
              </div>
            </label>
            <label className="text-sm">
              終了日
              <div className="mt-1 flex items-center gap-1">
                <button type="button" onClick={() => setEnd(addDays(end, -1))} className={ARROW} aria-label="終了日 前日">
                  ←
                </button>
                <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={DATE_INPUT} />
                <button type="button" onClick={() => setEnd(addDays(end, 1))} className={ARROW} aria-label="終了日 翌日">
                  →
                </button>
              </div>
            </label>
            <button
              onClick={() => setPrintRange({ s: start, e: end })}
              disabled={start > end}
              className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[44px] disabled:opacity-50"
            >
              表示
            </button>
            <button onClick={() => window.print()} className="bg-amber-600 text-white text-sm rounded px-4 min-h-[44px]">
              {title}印刷（期間）
            </button>
            {authEditable && (
              <button onClick={runBackfill} disabled={busy || items.length === 0} className={BTN}>
                {busy ? `補完中… ${progress ? `${progress.done}/${progress.total}` : ''}` : '未記入を一括補完'}
              </button>
            )}
            {start > end ? (
              <span className="text-sm text-red-600">開始日は終了日以前にしてください</span>
            ) : (
              <span className="text-sm text-slate-500">
                {printRange.s} 〜 {printRange.e}（{items.length}日分）
              </span>
            )}
          </div>
        )}

        {result && <p className="text-sm text-emerald-700 mt-2">{result}</p>}
      </div>

      {rangeDays > 31 && (
        <p className="text-amber-700 text-sm mb-3 print:hidden bg-amber-50 border border-amber-200 rounded px-3 py-2">
          ⚠ {rangeDays}日分を一度に表示・印刷します。動作が重くなる場合は期間を分けてください。
        </p>
      )}
      {error && <p className="text-red-600 text-sm">エラー: {error}</p>}
      {!isEdit && missing.length > 0 && (
        <p className="text-amber-600 text-sm mb-3 print:hidden">未設定の日（印刷されません）: {missing.join('、')}</p>
      )}

      {loading && items.length === 0 ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : items.length === 0 ? (
        error ? null : (
          <p className="text-slate-400">
            {isEdit ? 'この日の献立は未設定です（作業指示書で登録してください）。' : 'この期間に登録された献立はありません。'}
          </p>
        )
      ) : (
        <div>
          {/* report-lazy(遅延描画)は期間表示のみ。単日=記入モードに付けると
              コンボのドロップダウンが paint containment で切れるため付けない */}
          {items.map((d) => (
            <div key={d.id} className={`${pageClass}${isEdit ? '' : ' report-lazy'}`}>
              {renderForm(d, editable, !isEdit, reload)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
