import { useEffect, useMemo, useState } from 'react'
import {
  upsertDailyMenu,
  dailyNutritionEx,
  mealKcal,
  scaledPerPerson,
  normalizeGrainG,
  isStapleColAvailable,
  STAPLE_DEFAULT_G,
  type DailyMenuFull,
  type DailyNutritionEx,
  type DaySlot,
} from '../../lib/daily'
import MenuSelect from '../../components/MenuSelect'
import type { ReportProps } from './types'

const round1 = (n: number) => Math.round(n * 10) / 10
const numOrNull = (s: string) => (s ? Number(s) : null)
const BORDER = 'border border-slate-400'

// R=おかず増量倍率。主食・適量・おやつ(R=1渡し)は据置。kcal=その食の1人分エネルギー
function MealBlock({ label, code, slots, n, R, kcal }: { label: string; code: string | null; slots: DaySlot[]; n: number; R: number; kcal: number }) {
  // 倍率Rが万一 NaN/Infinity でも表に NaN g を出さないよう防御（自動増量再有効化時の保険。現状R=1固定）
  const safeR = Number.isFinite(R) ? R : 1
  return (
    <div className="mb-4 break-inside-avoid">
      <h3 className="text-lg font-bold bg-slate-100 border border-slate-400 px-2 py-1 flex items-baseline justify-between gap-2">
        <span>
          {label}
          {code ? `（${code}）` : '（未設定）'}
        </span>
        {kcal > 0 && <span className="text-base font-semibold text-slate-700 whitespace-nowrap">{Math.round(kcal)} kcal</span>}
      </h3>
      {slots.length === 0 ? (
        <div className="border border-t-0 border-slate-400 px-2 py-1 text-slate-400">未設定</div>
      ) : (
        <table className="w-full border-collapse text-base">
          <thead>
            <tr className="bg-slate-50">
              <th className={`${BORDER} px-2 py-1 text-left w-44`}>料理</th>
              <th className={`${BORDER} px-2 py-1 text-left`}>食材</th>
              <th className={`${BORDER} px-2 py-1 text-right w-20`}>1人分</th>
              <th className={`${BORDER} px-2 py-1 text-right w-28`}>総量(×{n})</th>
              <th className={`${BORDER} px-2 py-1 text-left w-44`}>調理メモ</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s) =>
              s.items.length ? (
                s.items.map((it, i) => {
                  const sp = scaledPerPerson(it.perPerson, s.slot, safeR)
                  return (
                  <tr key={s.slot + i}>
                    {i === 0 && (
                      <td rowSpan={s.items.length} className={`${BORDER} px-2 py-1 align-top font-semibold`}>
                        {s.name}
                      </td>
                    )}
                    <td className={`${BORDER} px-2 py-1`}>{it.name}</td>
                    <td className={`${BORDER} px-2 py-1 text-right text-slate-600`}>
                      {sp != null ? `${round1(sp)} g` : '適量'}
                    </td>
                    <td className={`${BORDER} px-2 py-1 text-right font-medium`}>
                      {sp != null ? `${round1(sp * n)} g` : '適量'}
                    </td>
                    {i === 0 && (
                      <td rowSpan={s.items.length} className={`${BORDER} px-2 py-1 align-top text-sm text-slate-600`}>
                        {s.notes ?? ''}
                      </td>
                    )}
                  </tr>
                  )
                })
              ) : (
                <tr key={s.slot}>
                  <td className={`${BORDER} px-2 py-1 font-semibold`}>{s.name}</td>
                  <td className={`${BORDER} px-2 py-1 text-slate-400`} colSpan={3}>
                    （材料データなし）
                  </td>
                  <td className={`${BORDER} px-2 py-1 text-sm text-slate-600`}>{s.notes ?? ''}</td>
                </tr>
              )
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

// bulk=true: 一括印刷ページ用（個別の印刷ボタン・未保存バッジを出さない）
export function WorkSheet({ data, n, nx, dirty = false, bulk = false }: { data: DailyMenuFull; n: number; nx: DailyNutritionEx; dirty?: boolean; bulk?: boolean }) {
  const R = nx.scaleFactor
  const scaled = R > 1
  const snackSlots: DaySlot[] | null = data.snack
    ? [{ slot: 'snack', label: 'おやつ', name: data.snack.name, notes: null, items: data.snack.items }]
    : null
  return (
    <div className="text-base">
      <div className="flex items-end justify-between mb-2 border-b-2 border-slate-700 pb-1">
        <h2 className="text-2xl font-bold">作業指示書</h2>
        <div className="text-base">
          <span className="mr-4">{data.menu_date}</span>
          <span className="font-bold">食数 {n} 人</span>
        </div>
      </div>
      <div className="flex items-center justify-between mb-2 gap-3">
        <p className="text-sm text-slate-600">ラウレアハレ厨房{data.note ? `　/　${data.note}` : ''}</p>
        {!bulk && (
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1 print:hidden">
                未保存の主食量で表示中・印刷前に「保存して反映」を
              </span>
            )}
            <button
              onClick={() => window.print()}
              className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px] print:hidden"
            >
              印刷
            </button>
          </div>
        )}
      </div>

      {scaled && (
        <div className="mb-3 px-3 py-2 rounded border-2 border-emerald-300 bg-emerald-50 text-emerald-900 text-sm font-bold break-inside-avoid">
          ★ おかずの材料を1,600kcal確保のため <span className="text-lg">×{R.toFixed(2)}倍</span> に自動増量しています
          <span className="font-normal">（主食・おやつ・適量は据置。下表の「1人分・総量」は増量後の量です）</span>
        </div>
      )}

      {data.meals.map((m) => (
        <MealBlock key={m.key} label={m.label} code={m.code} slots={m.slots} n={n} R={R} kcal={mealKcal(m.slots, nx.grainG)} />
      ))}
      {snackSlots && (
        <MealBlock label="おやつ" code={data.snackCode} slots={snackSlots} n={n} R={1} kcal={mealKcal(snackSlots, nx.grainG)} />
      )}
    </div>
  )
}

export default function WorkInstruction({ date, data, reload, editable, pickSets, pickSnacks, pickError }: ReportProps) {
  const [mealCount, setMealCount] = useState('30')
  const [bf, setBf] = useState('')
  const [ln, setLn] = useState('')
  const [dn, setDn] = useState('')
  const [snack, setSnack] = useState('')
  const [note, setNote] = useState('')
  const [grainG, setGrainG] = useState(String(STAPLE_DEFAULT_G)) // 主食量(g/食)・既定160
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [grainNotPersisted, setGrainNotPersisted] = useState(false)

  // data → 選択パネル同期（日付 or レコード変化時のみ。編集中の realtime では極力触らない）
  useEffect(() => {
    setMealCount(data ? String(data.meal_count) : '30')
    setBf(data?.breakfastSetId ? String(data.breakfastSetId) : '')
    setLn(data?.lunchSetId ? String(data.lunchSetId) : '')
    setDn(data?.dinnerSetId ? String(data.dinnerSetId) : '')
    setSnack(data?.snackDishId ? String(data.snackDishId) : '')
    setNote(data?.note ?? '')
    setGrainG(String(data?.stapleGrainG ?? STAPLE_DEFAULT_G))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, data?.id])

  const save = async () => {
    if (saving) return // 二重保存ガード（連打・遅延クリック対策）
    setSaving(true)
    setSaveError(null)
    try {
      const n = Number(mealCount)
      if (!Number.isInteger(n) || n < 1 || n > 100000) throw new Error('食数は1以上の整数で入力してください')
      await upsertDailyMenu({
        menu_date: date,
        meal_count: n,
        breakfast_set_id: numOrNull(bf),
        lunch_set_id: numOrNull(ln),
        dinner_set_id: numOrNull(dn),
        snack_dish_id: numOrNull(snack),
        note: note.trim() || null,
        staple_grain_g: grainG.trim() === '' ? data?.stapleGrainG ?? STAPLE_DEFAULT_G : normalizeGrainG(Number(grainG)),
      })
      setGrainNotPersisted(!isStapleColAvailable()) // 列欠落フォールバック時は主食量が保存されていない
      reload()
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  // 食数は最低1で下限クランプ（DB異常で0/負でも総使用量が全0の不正な作業指示書を出さない）
  const N = Math.max(1, data?.meal_count ?? (Number(mealCount) || 1))
  // 主食量はライブ入力値で再計算（提供量によるエネルギー変動をその場で確認）。保存でDBへ。
  // 空欄は undefined を渡し、保存済み値(なければ既定160)へフォールバックさせる（Number('')=0 の罠を回避）
  const grainEmpty = grainG.trim() === ''
  const grainNum = grainEmpty ? undefined : Number(grainG)
  // メモ/食数/選択変更など栄養に無関係な再レンダーで再計算しないよう data / grainNum 依存でメモ化
  const nx = useMemo(() => (data ? dailyNutritionEx(data, grainNum) : null), [data, grainNum])
  const dirty = !!data && editable && !grainEmpty && normalizeGrainG(grainNum!) !== data.stapleGrainG

  return (
    <div>
      {editable && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 mb-4 print:hidden">
          {pickError && (
            <p className="text-red-600 text-sm mb-2 bg-red-50 border border-red-200 rounded px-2 py-1">{pickError}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-sm font-medium">
              朝食
              <MenuSelect kind="breakfast" items={pickSets} value={bf} onChange={setBf} />
            </label>
            <label className="text-sm font-medium">
              昼食
              <MenuSelect kind="main" items={pickSets} value={ln} onChange={setLn} />
            </label>
            <label className="text-sm font-medium">
              夕食
              <MenuSelect kind="main" items={pickSets} value={dn} onChange={setDn} />
            </label>
            <label className="text-sm font-medium">
              おやつ
              <MenuSelect kind="snack" items={pickSnacks} value={snack} onChange={setSnack} />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-3 mt-3">
            <label className="text-sm font-medium">
              食数(人)
              <input
                type="number"
                min="1"
                step="1"
                value={mealCount}
                onChange={(e) => setMealCount(e.target.value)}
                className="mt-1 block w-24 border rounded px-2 py-2 text-base"
              />
            </label>
            <label className="text-sm font-medium">
              主食量(g/食)
              <input
                type="number"
                min="0"
                step="10"
                value={grainG}
                onChange={(e) => setGrainG(e.target.value)}
                className="mt-1 block w-24 border rounded px-2 py-2 text-base"
              />
              <span className="block text-[11px] text-slate-500 font-normal">ご飯1膳の目安。変更でエネルギー再計算</span>
            </label>
            <label className="text-sm font-medium flex-1 min-w-[12rem]">
              メモ
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 block w-full border rounded px-2 py-2 text-sm"
              />
            </label>
            <button
              onClick={save}
              disabled={saving}
              className="bg-emerald-600 text-white rounded px-5 min-h-[44px] disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存して反映'}
            </button>
          </div>
          {saveError && <p className="text-red-600 text-sm mt-2">エラー: {saveError}</p>}
          {grainNotPersisted && (
            <p className="text-amber-700 text-sm mt-2">
              ※この環境では主食量がDBに保存されません（daily_menus への 0004 マイグレーション未適用）。主食量は160g固定で表示されます。
            </p>
          )}
        </div>
      )}

      {!data ? (
        <p className="text-slate-500">
          {date} の献立は未設定です。
          {editable ? '上の欄で選んで「保存して反映」してください。' : '（編集にはログインが必要です）'}
        </p>
      ) : (
        <WorkSheet data={data} n={N} nx={nx!} dirty={dirty} />
      )}
    </div>
  )
}
