import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchDailyMenusRangeLite, type DailyMenuFull } from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'

// 職員確認用：月〜日の1週間分（朝食/昼食/おやつ/夕食）をA4横1枚の一覧表で印刷。
// 既存のA3献立掲示・作業指示書とは独立（固有クラス .staffweek-page ＋ @page staffweek-a4）。
const WD = ['日', '月', '火', '水', '木', '金', '土']

function toIso(dt: Date): string {
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${m}-${d}`
}
function todayStr(): string {
  return toIso(new Date())
}
// その日を含む週の月曜（月曜起点）
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(y, m - 1, d)
  const day = dt.getDay() // 0=日,1=月,…6=土
  dt.setDate(dt.getDate() + (day === 0 ? -6 : 1 - day))
  return toIso(dt)
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return toIso(new Date(y, m - 1, d + n))
}
function mdw(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const wd = WD[new Date(y, m - 1, d).getDay()]
  return `${m}/${d}（${wd}）`
}

const MEALS = [
  { key: 'breakfast', label: '朝食' },
  { key: 'lunch', label: '昼食' },
  { key: 'snack', label: 'おやつ' },
  { key: 'dinner', label: '夕食' },
] as const

// その日・その食区分の品名一覧（朝昼夕はスロット料理名、おやつは単品名）
function namesOf(d: DailyMenuFull | undefined, key: string): string[] {
  if (!d) return []
  if (key === 'snack') return d.snack?.name ? [d.snack.name] : []
  const meal = d.meals.find((m) => m.key === key)
  return meal ? meal.slots.map((s) => s.name) : []
}

export default function StaffWeekPage() {
  const nav = useNavigate()
  const [pick, setPick] = useState(mondayOf(todayStr()))
  const [weekStart, setWeekStart] = useState(mondayOf(todayStr()))
  const sunday = addDays(weekStart, 6)
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // 週間表は品名しか使わないため軽量フェッチ（食材ツリーを取得しない）
  const { data, loading, error, reload } = useLoader(
    () => fetchDailyMenusRangeLite(weekStart, sunday),
    [weekStart]
  )
  useRealtime(['daily_menus', 'menu_sets', 'dishes', 'dish_ingredients'], reload)
  const byDate = new Map((data ?? []).map((d) => [d.menu_date, d]))

  return (
    <div>
      {/* 操作パネル（印刷では非表示） */}
      <div className="bg-white border rounded p-3 mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <button onClick={() => nav('/kondate')} className="text-emerald-700 text-sm min-h-[40px] px-2 mr-2">
          ← 献立掲示へ
        </button>
        <label className="text-sm">
          週内の日付
          <input
            type="date"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="mt-1 block border rounded px-2 py-2 text-sm"
          />
        </label>
        <button
          onClick={() => setWeekStart(mondayOf(pick))}
          className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px]"
        >
          表示
        </button>
        <button
          onClick={() => window.print()}
          className="bg-amber-600 text-white text-sm rounded px-4 min-h-[40px]"
        >
          職員確認用 印刷（A4横）
        </button>
        <span className="text-sm text-slate-500">
          {weekStart} 〜 {sunday}（月〜日）
        </span>
      </div>

      {error && <p className="text-red-600 text-sm mb-2 print:hidden">エラー: {error}</p>}
      {loading && !data && <p className="text-slate-500 print:hidden">読み込み中…</p>}

      {/* 印刷対象：A4横 週間一覧表（縦7行×横4列＋日付列） */}
      <div className="staffweek-page bg-white">
        <div className="text-center mb-2">
          <h2 className="staffweek-title text-xl font-bold">週間献立表（職員確認用）</h2>
          <p className="text-sm text-slate-600">
            ラウレアハレ厨房　{weekStart} 〜 {sunday}
          </p>
        </div>
        <table className="staffweek-table w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-slate-500 bg-slate-100 px-2 py-1 w-28">日付</th>
              {MEALS.map((m) => (
                <th key={m.key} className="border border-slate-500 bg-slate-100 px-2 py-1">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => {
              const d = byDate.get(date)
              return (
                <tr key={date}>
                  <td className="border border-slate-500 px-2 py-1 text-center font-semibold whitespace-nowrap align-middle">
                    {mdw(date)}
                  </td>
                  {MEALS.map((m) => {
                    const names = namesOf(d, m.key)
                    return (
                      <td key={m.key} className="border border-slate-500 px-2 py-1 align-middle">
                        {names.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          names.map((n, i) => <div key={i}>{n}</div>)
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
