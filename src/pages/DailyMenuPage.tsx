import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchDailyMenuByDate, fetchMenuSetPickList, fetchSnackPickList, type PickItem } from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../hooks/useAuth'
import WorkInstruction from './reports/WorkInstruction'
import Kenshoku from './reports/Kenshoku'
import Nisshi from './reports/Nisshi'
import Kondate from './reports/Kondate'

const TABS = [
  { key: 'work', label: '作業指示書' },
  { key: 'kenshoku', label: '検食簿' },
  { key: 'nisshi', label: '給食日誌' },
  { key: 'kondate', label: '今日の献立' },
] as const
type TabKey = (typeof TABS)[number]['key']

const WD = ['日', '月', '火', '水', '木', '金', '土']
// 'YYYY-MM-DD' を ±n 日（ローカル日付・月跨ぎ対応）
function shiftDate(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso // 不正・空の日付はそのまま返す（前後ナビの破綻を防ぐ）
  const dt = new Date(y, m - 1, d + n)
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}
function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const wd = WD[new Date(y, m - 1, d).getDay()]
  return `${y}/${m}/${d}（${wd}）`
}

// /day/:date — 1日分の4帳票をサブタブで表示（同一 daily_menus データを共通利用）
export default function DayLayout() {
  const { date = '' } = useParams()
  const nav = useNavigate()
  const { editable } = useAuth()
  const { data, loading, error, reload } = useLoader(() => fetchDailyMenuByDate(date), [date])
  useRealtime(['daily_menus', 'menu_sets', 'dishes', 'dish_ingredients'], reload)

  const [pickSets, setPickSets] = useState<PickItem[]>([])
  const [pickSnacks, setPickSnacks] = useState<PickItem[]>([])
  const [pickError, setPickError] = useState<string | null>(null)
  useEffect(() => {
    if (!editable) return
    setPickError(null)
    const onErr = (e: unknown) => {
      console.error('献立ピッカーの読み込みに失敗:', e)
      setPickError('献立リストの読み込みに失敗しました。通信状態を確認のうえ画面を再読込してください。')
    }
    fetchMenuSetPickList().then(setPickSets).catch(onErr)
    fetchSnackPickList().then(setPickSnacks).catch(onErr)
  }, [editable])

  const [tab, setTab] = useState<TabKey>('work')

  if (loading && !data) return <p className="text-slate-500">読み込み中…</p>
  if (error) return <p className="text-red-600">エラー: {error}</p>

  const props = { date, data, reload, editable, pickSets, pickSnacks, pickError }

  return (
    <div>
      <div className="flex items-center gap-1 mb-3 print:hidden flex-wrap">
        <button onClick={() => nav('/days')} className="text-emerald-700 text-sm min-h-[40px] px-2 mr-2">
          ← 一覧
        </button>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`min-h-[40px] px-3 rounded text-sm font-medium ${
              tab === t.key ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 日付の前後移動（前日◀ / ▶翌日）。印刷時は非表示 */}
      <div className="flex items-center justify-center gap-3 mb-3 print:hidden">
        <button
          onClick={() => nav(`/day/${shiftDate(date, -1)}`)}
          className="min-h-[40px] min-w-[44px] px-3 rounded border bg-white text-slate-700 text-lg font-bold hover:bg-slate-50"
          aria-label="前日"
        >
          ◀
        </button>
        <span className="text-base font-bold text-slate-800 min-w-[8rem] text-center">{dateLabel(date)}</span>
        <button
          onClick={() => nav(`/day/${shiftDate(date, 1)}`)}
          className="min-h-[40px] min-w-[44px] px-3 rounded border bg-white text-slate-700 text-lg font-bold hover:bg-slate-50"
          aria-label="翌日"
        >
          ▶
        </button>
      </div>
      {/* 作業指示書はマウント維持（タブ切替で選択パネルの未保存入力を失わない） */}
      <div className={tab === 'work' ? '' : 'hidden'}>
        <WorkInstruction {...props} />
      </div>
      {tab === 'kenshoku' && <Kenshoku {...props} />}
      {tab === 'nisshi' && <Nisshi {...props} />}
      {tab === 'kondate' && <Kondate {...props} />}
    </div>
  )
}
