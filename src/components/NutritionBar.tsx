import { useState } from 'react'
import type { DailyNutrition } from '../lib/daily'

// 高齢者向け1日エネルギー目標（要件1）
const TARGET_MIN = 1400
const TARGET_MAX = 1600

// 主食(ご飯/パン)のグラム数は元データ未登録のため、目安エネルギーを定数で加算（編集可・端末保存）
const STAPLE_KEY = 'kitchen.stapleKcalPerDay'
const DEFAULT_STAPLE = 600 // ご飯 少なめ ≒200kcal × 3食

function readStaple(): number {
  try {
    const raw = localStorage.getItem(STAPLE_KEY)
    if (raw == null || raw === '') return DEFAULT_STAPLE // 未設定は既定値（Number(null)=0 の罠を回避）
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_STAPLE
  } catch {
    return DEFAULT_STAPLE
  }
}

function band(total: number) {
  if (total < TARGET_MIN) return { label: 'やや少なめ', cls: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-400' }
  if (total > TARGET_MAX) return { label: 'やや多め', cls: 'bg-orange-100 text-orange-800 border-orange-300', dot: 'bg-orange-400' }
  return { label: '適正', cls: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-400' }
}

const r0 = (n: number) => Math.round(n)
const r1 = (n: number) => Math.round(n * 10) / 10
const coverageOf = (nut: DailyNutrition) =>
  nut.itemsWithAmount > 0 ? Math.round((nut.itemsLinked / nut.itemsWithAmount) * 100) : 100

// 柔らかい掲示カード用（読み取り専用・小さめフッター）
export function NutritionFooter({ nut }: { nut: DailyNutrition }) {
  const total = nut.kcal + readStaple()
  const b = band(total)
  const ref = coverageOf(nut) < 100 // 未紐付けがある日は参考値扱い
  return (
    <div className="mt-6 flex flex-col items-center gap-1">
      <div className={`inline-flex items-center gap-2 rounded-full border px-5 py-2 text-base ${b.cls}`}>
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${b.dot}`} aria-hidden />
        本日の目安エネルギー　約 <span className="font-bold text-xl">{r0(total)}</span> kcal
        {ref && <span className="text-sm font-normal">（参考値）</span>}
      </div>
      <p className="text-[11px] text-slate-400">※主食の目安を含む概算です（調味料・未登録食材は計上していません）</p>
    </div>
  )
}

// 作業指示書用（詳細・主食目安は編集可）
export default function NutritionBar({ nut }: { nut: DailyNutrition }) {
  const [staple, setStaple] = useState(readStaple)
  const total = nut.kcal + staple
  const b = band(total)
  const coverage = coverageOf(nut)

  const onStaple = (v: string) => {
    if (v.trim() === '') {
      // 空欄＝未設定。0として保存せず既定値へ戻す（0永続化の罠を回避）
      try {
        localStorage.removeItem(STAPLE_KEY)
      } catch {
        /* noop */
      }
      setStaple(DEFAULT_STAPLE)
      return
    }
    const n = Number(v)
    const val = Number.isFinite(n) && n >= 0 ? n : 0
    setStaple(val)
    try {
      localStorage.setItem(STAPLE_KEY, String(val))
    } catch {
      /* 保存できなくても表示は継続 */
    }
  }

  return (
    <div className="mb-4 border-2 border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 bg-slate-50 border-b border-slate-300">
        <div className="flex items-baseline gap-2">
          <span className="text-sm text-slate-600">1日の目安エネルギー（1人分）</span>
          <span className="text-3xl font-bold text-slate-800">{r0(total)}</span>
          <span className="text-sm text-slate-600">kcal</span>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${b.cls}`}>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${b.dot}`} aria-hidden />
          {b.label}（目標 {TARGET_MIN.toLocaleString()}〜{TARGET_MAX.toLocaleString()}kcal）
        </span>
      </div>

      <div className="px-3 py-2 text-sm text-slate-700 flex flex-wrap items-center gap-x-5 gap-y-2">
        <span>
          おかず <span className="font-semibold">{r0(nut.kcal)}</span> kcal
          <span className="text-slate-400 text-xs">（成分表より自動）</span>
        </span>
        <span className="flex items-center gap-1">
          ＋主食(目安)
          <input
            type="number"
            min="0"
            step="50"
            value={staple}
            onChange={(e) => onStaple(e.target.value)}
            className="w-20 border rounded px-2 py-1 text-right print:border-none"
            aria-label="主食の目安エネルギー(1日)"
          />
          kcal
        </span>
        <span className="text-slate-500">
          P {r1(nut.protein)}g・F {r1(nut.fat)}g・C {r1(nut.carb)}g・塩 {r1(nut.salt)}g
          <span className="text-slate-400 text-xs">（おかず分・主食/適量は除く）</span>
        </span>
      </div>

      {(coverage < 100 || nut.missingNames.length > 0) && (
        <div className="px-3 py-2 text-xs text-amber-700 bg-amber-50 border-t border-amber-200">
          ⚠ 栄養データ未登録の食材は合計に含まれません（分量入力済みの紐付け {coverage}%）
          {nut.missingNames.length > 0 && <>：{nut.missingNames.join('、')}</>}
        </div>
      )}
      {/* 印刷物にも残す恒久注記（一人歩きするため print で消さない） */}
      <div className="px-3 py-1.5 text-[11px] text-slate-500 border-t border-slate-200">
        ※エネルギーは主食の目安（{r0(staple)}kcal）を含む概算です。調味料（適量）・未登録食材は未計上のため、塩分も実際より少なく出ます。
        <span className="print:hidden">主食の値は実際の盛り付けに合わせて上で調整できます（端末に保存）。</span>
      </div>
    </div>
  )
}
