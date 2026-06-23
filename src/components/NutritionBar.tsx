import { KCAL_TARGET, OKAZU_RMAX, type DailyNutritionEx } from '../lib/daily'

const r0 = (n: number) => Math.round(n)
const r1 = (n: number) => Math.round(n * 10) / 10

function band(nut: DailyNutritionEx) {
  if (!nut.reachable)
    return { label: '目標未達', cls: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-400' }
  return { label: `${KCAL_TARGET.toLocaleString()}kcal 達成`, cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-400' }
}

function warnText(nut: DailyNutritionEx): string | null {
  if (nut.reachable) return null
  if (nut.reason === 'no_okazu_kcal')
    return `おかずに栄養データが無く自動調整できません（約${r0(nut.total)}kcal）。`
  return `おかずを最大${OKAZU_RMAX}倍にしても${KCAL_TARGET.toLocaleString()}kcalに届きません（約${r0(nut.total)}kcal）。主食量を増やすか献立の見直しを。`
}

// 作業指示書用の栄養バー（主食可変・おかず自動増量R・達成/未達）。純表示（状態はWorkInstruction側）
export default function NutritionBar({ nut }: { nut: DailyNutritionEx }) {
  const b = band(nut)
  const warn = warnText(nut)
  const coverage = nut.itemsWithAmount > 0 ? Math.round((nut.itemsLinked / nut.itemsWithAmount) * 100) : 100
  const okazuShown = nut.okazuKcal * nut.scaleFactor
  const scaled = nut.scaleFactor > 1

  return (
    <div className="mb-4 border-2 border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-slate-50 border-b border-slate-300">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-slate-600">1日の目安エネルギー（1人分）</span>
          <span className="text-3xl font-bold text-slate-800">{r0(nut.total)}</span>
          <span className="text-sm text-slate-600">kcal</span>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${b.cls}`}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${b.dot}`} aria-hidden />
          {b.label}
        </span>
      </div>

      <div className="px-3 py-2 text-sm text-slate-700 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span>
          主食 <span className="font-semibold">{nut.grainG}</span>g × {nut.stapleMeals}食 ={' '}
          <span className="font-semibold">{r0(nut.stapleKcal)}</span> kcal
        </span>
        <span>
          ＋おかず <span className="font-semibold">{r0(okazuShown)}</span> kcal
          {scaled && <span className="text-emerald-700 text-xs font-bold">（×{nut.scaleFactor.toFixed(2)}倍 調整）</span>}
        </span>
        {nut.snackKcal > 0 && (
          <span>
            ＋おやつ <span className="font-semibold">{r0(nut.snackKcal)}</span> kcal
          </span>
        )}
        <span className="text-slate-500">
          P {r1(nut.protein)}g・F {r1(nut.fat)}g・C {r1(nut.carb)}g・塩 {r1(nut.salt)}g
          <span className="text-slate-400 text-xs">（おかず分・主食/適量は除く）</span>
        </span>
      </div>

      {warn && (
        <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border-t border-amber-200 font-medium">⚠ {warn}</div>
      )}
      {scaled && (
        <div className="px-3 py-2 text-xs text-rose-800 bg-rose-50 border-t border-rose-200 font-medium">
          ⚠ おかずを×{nut.scaleFactor.toFixed(2)}倍に増量＝<span className="font-bold">食塩相当量も約{nut.scaleFactor.toFixed(2)}倍</span>に増えます（おかず塩分 約{r1(nut.salt)}g・減塩が必要な方は要確認）
        </div>
      )}
      {(coverage < 100 || nut.missingNames.length > 0) && (
        <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-200">
          栄養データ未登録の食材は計算に含まれません（分量入力済みの紐付け {coverage}%）
          {nut.missingNames.length > 0 && <>：{nut.missingNames.join('、')}</>}
        </div>
      )}
      {/* 印刷物にも残す恒久注記 */}
      <div className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-200">
        ※主食 {nut.grainG}g×{nut.stapleMeals}食＝{r0(nut.stapleKcal)}kcal を含む概算。調味料（適量）・未登録食材は未計上のため、表示の塩分は実際より少なく出ます。
      </div>
    </div>
  )
}
