import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDailyMenusRangeLite } from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import KondateCard from './reports/KondateCard'

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
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

// 期間選択 → 複数日の「今日の献立」を一括表示＆A3横で印刷
export default function KondateBulkPage() {
  const nav = useNavigate()
  const [start, setStart] = useState(todayStr())
  const [end, setEnd] = useState(addDays(todayStr(), 7)) // 既定8日分
  const [range, setRange] = useState({ s: start, e: end })

  // 献立掲示は品名しか使わないため軽量フェッチ（食材ツリーを取得しない＝メモリ削減）
  const { data, loading, error } = useLoader(() => fetchDailyMenusRangeLite(range.s, range.e), [range.s, range.e])
  const items = data ?? []
  const allDates = enumerateDates(range.s, range.e)
  const present = new Set(items.map((d) => d.menu_date))
  const missing = allDates.filter((d) => !present.has(d))
  const rangeDays = allDates.length

  return (
    <div>
      <div className="bg-white border rounded p-3 mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <label className="text-sm">
          開始日
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="mt-1 block border rounded px-2 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          終了日
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="mt-1 block border rounded px-2 py-2 text-sm"
          />
        </label>
        <button
          onClick={() => setRange({ s: start, e: end })}
          disabled={start > end}
          className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px] disabled:opacity-50"
        >
          表示
        </button>
        <button onClick={() => window.print()} className="bg-amber-600 text-white text-sm rounded px-4 min-h-[40px]">
          一括印刷（A3横）
        </button>
        <button
          onClick={() => nav('/staff-week')}
          className="bg-white border border-emerald-600 text-emerald-700 text-sm rounded px-4 min-h-[40px] hover:bg-emerald-50"
        >
          職員確認用（週間A4横）
        </button>
        {start > end ? (
          <span className="text-sm text-red-600">開始日は終了日以前にしてください</span>
        ) : (
          <span className="text-sm text-slate-500">
            {range.s} 〜 {range.e}（{items.length}日分）
          </span>
        )}
      </div>

      {rangeDays > 31 && (
        <p className="text-amber-700 text-sm mb-3 print:hidden bg-amber-50 border border-amber-200 rounded px-3 py-2">
          ⚠ {rangeDays}日分を一度に表示・印刷します。動作が重くなる場合は期間を分けて印刷してください。
        </p>
      )}
      {error && <p className="text-red-600 text-sm">エラー: {error}</p>}
      {missing.length > 0 && (
        <p className="text-amber-600 text-sm mb-3 print:hidden">未設定の日（印刷されません）: {missing.join('、')}</p>
      )}

      {loading && items.length === 0 ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : items.length === 0 ? (
        error ? null : <p className="text-slate-400">この期間に登録された献立はありません。</p>
      ) : (
        <div className="space-y-6">
          {items.map((d) => (
            <KondateCard key={d.id} data={d} />
          ))}
        </div>
      )}
    </div>
  )
}
