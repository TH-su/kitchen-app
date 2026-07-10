import { useState } from 'react'
import { fetchDailyReportsRange } from '../lib/daily'
import { todayStr } from '../lib/date'
import { useLoader } from '../hooks/useLoader'
import { useAuth } from '../hooks/useAuth'
import Kenshoku from './reports/Kenshoku'

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
const ARROW = 'min-h-[40px] px-2 rounded border bg-white text-slate-700 text-sm hover:bg-slate-50'

// 検食簿: 当日既定＝編集フォーム / 期間指定＝1日=1様式の読み取り専用一括印刷（複合）
export default function KenshokuBulkPage() {
  const { editable } = useAuth()
  const [start, setStart] = useState(todayStr())
  const [end, setEnd] = useState(todayStr())
  const [range, setRange] = useState({ s: start, e: end })
  const shiftStart = (delta: number) => {
    const ns = addDays(start, delta)
    setStart(ns)
    setRange({ s: ns, e: end })
  }
  const shiftEnd = (delta: number) => {
    const ne = addDays(end, delta)
    setEnd(ne)
    setRange({ s: start, e: ne })
  }

  const { data, loading, error, reload } = useLoader(() => fetchDailyReportsRange(range.s, range.e), [range.s, range.e])
  const items = data ?? []
  const allDates = enumerateDates(range.s, range.e)
  const present = new Set(items.map((d) => d.menu_date))
  const missing = allDates.filter((d) => !present.has(d))
  const rangeDays = allDates.length
  const single = range.s === range.e // 単日＝当日編集モード

  return (
    <div>
      <div className="bg-white border rounded p-3 mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">
          開始日（当日=記入）
          <div className="mt-1 flex items-center gap-1">
            <button type="button" onClick={() => shiftStart(-1)} className={ARROW} aria-label="開始日 前日">←</button>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="block border rounded px-2 py-2 text-sm" />
            <button type="button" onClick={() => shiftStart(1)} className={ARROW} aria-label="開始日 翌日">→</button>
          </div>
        </label>
        <label className="text-sm">
          終了日（期間印刷）
          <div className="mt-1 flex items-center gap-1">
            <button type="button" onClick={() => shiftEnd(-1)} className={ARROW} aria-label="終了日 前日">←</button>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="block border rounded px-2 py-2 text-sm" />
            <button type="button" onClick={() => shiftEnd(1)} className={ARROW} aria-label="終了日 翌日">→</button>
          </div>
        </label>
        <button onClick={() => setRange({ s: start, e: end })} disabled={start > end} className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px] disabled:opacity-50">
          表示
        </button>
        {!single && (
          <button onClick={() => window.print()} className="bg-amber-600 text-white text-sm rounded px-4 min-h-[40px]">
            検食簿印刷（期間）
          </button>
        )}
        {start > end ? (
          <span className="text-sm text-red-600">開始日は終了日以前にしてください</span>
        ) : (
          <span className="text-sm text-slate-500">{single ? `${range.s}（当日記入）` : `${range.s} 〜 ${range.e}（${items.length}日分）`}</span>
        )}
      </div>

      {rangeDays > 31 && (
        <p className="text-amber-700 text-sm mb-3 print:hidden bg-amber-50 border border-amber-200 rounded px-3 py-2">
          ⚠ {rangeDays}日分を一度に表示・印刷します。動作が重くなる場合は期間を分けてください。
        </p>
      )}
      {error && <p className="text-red-600 text-sm">エラー: {error}</p>}
      {!single && missing.length > 0 && (
        <p className="text-amber-600 text-sm mb-3 print:hidden">未設定の日（印刷されません）: {missing.join('、')}</p>
      )}

      {loading && items.length === 0 ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : items.length === 0 ? (
        error ? null : <p className="text-slate-400">{single ? 'この日の献立は未設定です（作業指示書で登録してください）。' : 'この期間に登録された献立はありません。'}</p>
      ) : (
        <div>
          {/* report-lazy(遅延描画)は複数日一括のみ。単日=編集モードに付けると
              コンボのドロップダウンが paint containment で切れるため付けない */}
          {items.map((d) => (
            <div key={d.id} className={`kenshoku-page${single ? '' : ' report-lazy'}`}>
              <Kenshoku data={d} editable={single && editable} reload={reload} bulk={!single} date={d.menu_date} pickSets={[]} pickSnacks={[]} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
