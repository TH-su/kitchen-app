import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDailyMenus } from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'

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
const ARROW = 'min-h-[40px] px-2 rounded border bg-white text-slate-700 text-sm hover:bg-slate-50'

export default function DailyMenuListPage() {
  const nav = useNavigate()
  const [date, setDate] = useState(todayStr())
  const { data, loading, error, reload } = useLoader(() => fetchDailyMenus(), [])
  useRealtime(['daily_menus'], reload)
  const items = data ?? []

  return (
    <div>
      <div className="bg-white border rounded p-3 mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          日付を選んで開く
          <div className="mt-1 flex items-center gap-1">
            <button type="button" onClick={() => setDate((d) => addDays(d, -1))} className={ARROW} aria-label="前日">←</button>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="block border rounded px-2 py-2 text-sm"
            />
            <button type="button" onClick={() => setDate((d) => addDays(d, 1))} className={ARROW} aria-label="翌日">→</button>
          </div>
        </label>
        <button
          onClick={() => date && nav(`/day/${date}`)}
          className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px]"
        >
          作業指示書を開く
        </button>
        <button
          onClick={() => nav(`/day/${todayStr()}`)}
          className="text-emerald-700 text-sm min-h-[40px] px-2"
        >
          今日
        </button>
      </div>

      <h2 className="text-lg font-bold mb-2">登録済みの日</h2>
      {error && <p className="text-red-600 text-sm mb-2">エラー: {error}</p>}
      {loading && items.length === 0 ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400">まだ登録がありません。上の日付から作成してください。</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((d) => (
            <button
              key={d.id}
              onClick={() => nav(`/day/${d.menu_date}`)}
              className="text-left bg-white rounded-lg border p-3 hover:border-emerald-400 hover:shadow transition"
            >
              <div className="font-bold text-emerald-700">
                {d.menu_date} <span className="text-xs font-normal text-slate-500">食数 {d.meal_count}</span>
              </div>
              <div className="text-sm text-slate-600 mt-1">
                朝 {d.breakfast ?? '—'} / 昼 {d.lunch ?? '—'} / 夕 {d.dinner ?? '—'}
                {d.snack ? ` / お:${d.snack}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
