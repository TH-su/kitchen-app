import { useCallback, useMemo, useState } from 'react'
import { fetchDailyMenuByDate, simulateMeal, SIM_TARGET_DEFAULTS, type MealSim } from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import MealSimCard from '../components/MealSimCard'

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
const r0 = (n: number) => Math.round(n)

// カロリー・材料量 左右比較シミュレーション（表示専用・DB非改変）
export default function SimulatePage() {
  const [date, setDate] = useState(todayStr())
  const [applied, setApplied] = useState(date)
  const [targets, setTargets] = useState<Record<string, string>>({
    breakfast: String(SIM_TARGET_DEFAULTS.breakfast),
    lunch: String(SIM_TARGET_DEFAULTS.lunch),
    dinner: String(SIM_TARGET_DEFAULTS.dinner),
    snack: String(SIM_TARGET_DEFAULTS.snack),
  })

  const { data, loading, error } = useLoader(() => fetchDailyMenuByDate(applied), [applied])

  // 日付欄入力など targets/data に無関係な再レンダーで全食事を再計算しないようメモ化
  const sims = useMemo<MealSim[]>(() => {
    const arr: MealSim[] = []
    if (data) {
      for (const m of data.meals) arr.push(simulateMeal(m.key, m.label, m.slots, Number(targets[m.key]) || 0))
      if (data.snack) {
        arr.push(
          simulateMeal(
            'snack',
            'おやつ',
            [{ slot: 'snack', label: 'おやつ', name: data.snack.name, notes: null, items: data.snack.items }],
            Number(targets.snack) || 0
          )
        )
      }
    }
    return arr
  }, [data, targets])
  const totalActual = sims.reduce((a, s) => a + s.actualKcal, 0)
  const totalTarget = sims.reduce((a, s) => a + s.targetKcal, 0)

  // 安定参照にして MealCard の React.memo を有効化（編集中以外のカード再レンダーを抑止）
  const setTarget = useCallback((key: string, v: string) => setTargets((t) => ({ ...t, [key]: v })), [])

  return (
    <div>
      <div className="bg-white border rounded p-3 mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          日付
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 block border rounded px-2 py-2 text-sm"
          />
        </label>
        <button onClick={() => setApplied(date)} className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px]">
          表示
        </button>
        <p className="text-xs text-slate-500 max-w-md">
          主食160g（ご飯換算）固定で、各食事の目標カロリーに合わせた「理想の材料量」を逆算表示します。
          <span className="font-medium">画面表示のみで、献立データは変更しません。</span>
        </p>
      </div>

      {error && <p className="text-red-600 text-sm">エラー: {error}</p>}
      {loading && !data ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : !data ? (
        <p className="text-slate-400">{applied} の献立は未設定です（作業指示書で登録してください）。</p>
      ) : (
        <>
          <div className="bg-slate-800 text-white rounded-lg px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">{applied} の1日合計</span>
            <div className="flex items-center gap-4">
              <span className="text-sm">
                目標 <span className="text-xl font-bold">{r0(totalTarget)}</span> kcal
              </span>
              <span className="text-slate-400">｜</span>
              <span className="text-sm">
                実際 <span className="text-xl font-bold">{r0(totalActual)}</span> kcal
              </span>
            </div>
          </div>
          {sims.map((s) => (
            <MealSimCard key={s.key} sim={s} targetStr={targets[s.key] ?? ''} onTarget={setTarget} />
          ))}
        </>
      )}
    </div>
  )
}
