import { useMemo, useState } from 'react'
import { fetchDailyMenusRange, dailyNutritionEx } from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import { WorkSheet } from './reports/WorkInstruction'

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

// 期間選択 → 複数日の作業指示書を一括表示＆A4縦で印刷（1日=1ページ）
export default function WorkBulkPage() {
  const [start, setStart] = useState(todayStr())
  const [end, setEnd] = useState(addDays(todayStr(), 6)) // 既定7日分
  const [range, setRange] = useState({ s: start, e: end })

  const { data, loading, error } = useLoader(() => fetchDailyMenusRange(range.s, range.e), [range.s, range.e])
  const items = data ?? []
  const present = new Set(items.map((d) => d.menu_date))
  const missing = enumerateDates(range.s, range.e).filter((d) => !present.has(d))
  // 各日の栄養計算は data 変化時のみ（日付欄入力などの再レンダーでは再計算しない）
  const sheets = useMemo(() => (data ?? []).map((d) => ({ d, nx: dailyNutritionEx(d, d.stapleGrainG) })), [data])

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
          一括印刷（A4縦）
        </button>
        {start > end ? (
          <span className="text-sm text-red-600">開始日は終了日以前にしてください</span>
        ) : (
          <span className="text-sm text-slate-500">
            {range.s} 〜 {range.e}（{items.length}日分）
          </span>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">エラー: {error}</p>}
      {missing.length > 0 && (
        <p className="text-amber-600 text-sm mb-3 print:hidden">未設定の日（印刷されません）: {missing.join('、')}</p>
      )}

      {loading && items.length === 0 ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : items.length === 0 ? (
        error ? null : <p className="text-slate-400">この期間に登録された献立はありません。</p>
      ) : (
        <div>
          {sheets.map(({ d, nx }) => (
            <div key={d.id} className="workinstr-page">
              <WorkSheet data={d} n={d.meal_count} nx={nx} bulk />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
