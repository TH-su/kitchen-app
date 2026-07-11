import { useEffect, useState, useSyncExternalStore } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchDailyMenuByDate, fetchMenuSetPickList, fetchSnackPickList, type PickItem } from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { getSnapshot, resolveCounts, subscribe } from '../lib/staffStore'
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

  // 在籍者数（週間計画由来・読み取り専用）。ストアを購読し counts の変化時のみ再描画する。
  // 連携未設定・取得失敗はストア側で握り潰され counts は null のまま＝表示せず従来と同一挙動。
  const storeSnapshot = useSyncExternalStore(subscribe, getSnapshot)
  const counts = storeSnapshot.counts
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applyDone, setApplyDone] = useState(false) // 反映成功後の注意喚起表示

  // ログイン時のみ取得を促す（表示・書込とも編集者向け。単一飛行/TTL/失敗握り潰しはストア側）。
  useEffect(() => {
    if (!editable) return
    void resolveCounts()
  }, [editable])

  // 日付が変わったら反映後の注意喚起/エラーをリセット（前の日付の文脈を持ち越さない）。
  useEffect(() => {
    setApplyDone(false)
    setApplyError(null)
  }, [date])

  // ボタン押下時のみ実行。既存行の meal_count のみを更新（upsert しない＝献立未設定日に幽霊行を作らない）。
  const applyCounts = async () => {
    if (applying || !data || !counts) return // 行が無い日は無効化しているが二重ガード
    setApplying(true)
    setApplyError(null)
    setApplyDone(false)
    try {
      const { error: e } = await supabase
        .from('daily_menus')
        .update({ meal_count: counts.residents - counts.hospitalized })
        .eq('menu_date', date)
      if (e) throw e
      reload()
      setApplyDone(true)
    } catch (err: any) {
      setApplyError(String(err?.message ?? err))
    } finally {
      setApplying(false)
    }
  }

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

      {/* 在籍者数（週間計画由来）＝食数への手動反映。連携未設定/未取得なら描画しない。印刷時は非表示 */}
      {editable && counts && (
        <div className="flex items-center flex-wrap gap-2 mb-3 print:hidden text-sm">
          <span className="text-slate-600">
            在籍者数: {counts.residents}名（うち入院 {counts.hospitalized}名）
          </span>
          <button
            onClick={applyCounts}
            disabled={!data || applying}
            className="min-h-[40px] px-3 rounded border border-emerald-300 bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            食数へ反映 ({counts.residents - counts.hospitalized})
          </button>
          {!data && <span className="text-slate-400 text-xs">先に献立を設定</span>}
          {applyError && <span className="text-red-600 text-xs">{applyError}</span>}
          {applyDone && (
            <span className="basis-full text-amber-700 text-xs bg-amber-50 border border-amber-300 rounded px-2 py-1">
              食数を反映しました。作業指示書タブの食数表示を最新にするには画面を再読込してください（再読込せず作業指示書を保存し直すと、反映前の食数に戻ります）。
            </span>
          )}
        </div>
      )}

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
      {/* 検食簿・給食日誌は入力を持つためマウント維持（タブ切替で未保存入力を失わない） */}
      <div className={tab === 'kenshoku' ? '' : 'hidden'}>
        <Kenshoku {...props} />
      </div>
      <div className={tab === 'nisshi' ? '' : 'hidden'}>
        <Nisshi {...props} />
      </div>
      {tab === 'kondate' && <Kondate {...props} />}
    </div>
  )
}
