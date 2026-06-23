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

// /day/:date — 1日分の4帳票をサブタブで表示（同一 daily_menus データを共通利用）
export default function DayLayout() {
  const { date = '' } = useParams()
  const nav = useNavigate()
  const { editable } = useAuth()
  const { data, loading, error, reload } = useLoader(() => fetchDailyMenuByDate(date), [date])
  useRealtime(['daily_menus', 'menu_sets', 'dishes', 'dish_ingredients'], reload)

  const [pickSets, setPickSets] = useState<PickItem[]>([])
  const [pickSnacks, setPickSnacks] = useState<PickItem[]>([])
  useEffect(() => {
    if (!editable) return
    fetchMenuSetPickList().then(setPickSets).catch(() => {})
    fetchSnackPickList().then(setPickSnacks).catch(() => {})
  }, [editable])

  const [tab, setTab] = useState<TabKey>('work')

  if (loading && !data) return <p className="text-slate-500">読み込み中…</p>
  if (error) return <p className="text-red-600">エラー: {error}</p>

  const props = { date, data, reload, editable, pickSets, pickSnacks }

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
