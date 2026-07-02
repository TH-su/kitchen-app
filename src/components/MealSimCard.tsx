import { memo } from 'react'
import { SIM_STAPLE_G, SIM_RMAX, type MealSim } from '../lib/daily'

// 「シミュ」タブと共通のカロリー・材料量シミュカード（表示専用・DB非改変）。
// SimulatePage / MenuSetDetailPage の両方から利用（見た目・計算ロジックを一元化）。
const r0 = (n: number) => Math.round(n)

const REASON_TEXT: Record<MealSim['reason'], string | null> = {
  ok: null,
  no_target: '目標カロリーを入力してください。',
  no_okazu: 'おかずに栄養データが無いため理想量を計算できません（食材の成分紐付けが必要）。',
  staple_exceeds: `主食${SIM_STAPLE_G}gだけで目標カロリーに達しています（おかずは控えめでOK）。`,
  capped: `おかずを上限${SIM_RMAX}倍にしても目標に届きません。メニューの見直しを推奨します。`,
}

const MealSimCard = memo(function MealSimCard({
  sim,
  targetStr,
  onTarget,
}: {
  sim: MealSim
  targetStr: string
  onTarget: (key: string, v: string) => void
}) {
  const diff = sim.actualKcal - sim.targetKcal
  const warn = REASON_TEXT[sim.reason]
  return (
    <div className="border rounded-lg overflow-hidden mb-4 break-inside-avoid">
      <div className="bg-slate-100 px-3 py-2 flex flex-wrap items-center justify-between gap-3 border-b">
        <h3 className="text-lg font-bold">{sim.label}</h3>
        <div className="flex items-center gap-4 text-sm">
          {/* 左=目標 / 右=実際 */}
          <span className="flex items-center gap-1">
            目標
            <input
              type="number"
              min="0"
              step="10"
              value={targetStr}
              onChange={(e) => onTarget(sim.key, e.target.value)}
              className="w-20 border rounded px-2 py-1 text-right"
              aria-label={`${sim.label}の目標カロリー`}
            />
            kcal
          </span>
          <span className="text-slate-400">｜</span>
          <span>
            実際 <span className="font-bold text-lg">{r0(sim.actualKcal)}</span> kcal
          </span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-bold ${
              Math.abs(diff) <= 20
                ? 'bg-emerald-100 text-emerald-800'
                : diff < 0
                ? 'bg-amber-100 text-amber-800'
                : 'bg-orange-100 text-orange-800'
            }`}
          >
            差 {diff >= 0 ? '+' : ''}
            {r0(diff)}
          </span>
        </div>
      </div>

      {sim.items.length === 0 ? (
        <p className="px-3 py-2 text-slate-400 text-sm">食材データがありません。</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="border px-2 py-1 text-left">食材</th>
              <th className="border px-2 py-1 text-right w-28 bg-emerald-50">目標（理想量）</th>
              <th className="border px-2 py-1 text-right w-28">実際（現在量）</th>
            </tr>
          </thead>
          <tbody>
            {sim.items.map((it, i) => {
              const changed = !it.isStaple && it.current != null && it.ideal != null && it.ideal !== it.current
              return (
                <tr key={i} className={it.isStaple ? 'bg-amber-50/40' : ''}>
                  <td className="border px-2 py-1">
                    {it.name}
                    {it.isStaple && <span className="text-xs text-amber-700">（主食・160g固定）</span>}
                  </td>
                  <td className={`border px-2 py-1 text-right bg-emerald-50/60 font-medium ${changed ? 'text-emerald-800' : ''}`}>
                    {it.ideal == null
                      ? '適量'
                      : !it.isStaple && sim.reason === 'staple_exceeds'
                      ? <span className="text-slate-400">—（主食で充足）</span>
                      : `${it.ideal} g`}
                  </td>
                  <td className="border px-2 py-1 text-right text-slate-600">
                    {it.current != null ? `${it.current} g` : '適量'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {warn && <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border-t">⚠ {warn}</div>}
      {sim.partialMissing && (
        <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-t">
          ※栄養データ未登録（{sim.missingOkazuNames.join('、')}）は実カロリー・理想量に反映されません（理想量は現状維持・参考値）。
        </div>
      )}
      {sim.reason === 'ok' && sim.scaleFactor !== 1 && (
        <div className="px-3 py-1.5 text-xs text-slate-500 border-t">
          おかずを <span className="font-bold text-emerald-700">×{sim.scaleFactor.toFixed(2)}倍</span> で目標に一致（主食は160g固定）
        </div>
      )}
    </div>
  )
})

export default MealSimCard
