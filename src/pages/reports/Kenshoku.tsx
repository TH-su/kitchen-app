import { useEffect, useRef, useState } from 'react'
import type { ReportProps } from './types'
import { saveDailyReport } from '../../lib/daily'
import { reiwaDate } from '../../lib/date'
import {
  K_OPTS,
  emptyKenshoku,
  mergeKenshoku,
  applyKenshokuAuto,
  sealAt,
  type KenshokuRecord,
  type KenshokuMeal,
  type KenshokuSnack,
} from '../../lib/reports'
import { RadioRow, RadioInline, FieldInput, SelectField, NoteField, SealBox } from './ReportFields'

const B = 'border border-slate-400'

function KenshokuMealForm({
  label,
  dishes,
  v,
  set,
  editable,
}: {
  label: string
  dishes: string
  v: KenshokuMeal
  set: (patch: Partial<KenshokuMeal>) => void
  editable: boolean
}) {
  return (
    <table className="w-full border-collapse mb-3 break-inside-avoid">
      <tbody>
        <tr className="bg-slate-100">
          <th className={`${B} px-2 py-1 text-left`} colSpan={2}>
            <span className="mr-3">{label}</span>
            <span className="text-sm font-normal">
              天候 <SelectField value={v.weather} onChange={(x) => set({ weather: x })} editable={editable} options={K_OPTS.weather} width="w-28" />
            </span>
          </th>
        </tr>
        <tr>
          <td className={`${B} px-2 py-1 w-28 bg-slate-50`}>献立</td>
          <td className={`${B} px-2 py-1`}>{dishes || '未設定'}</td>
        </tr>
        <RadioRow label="主食" options={K_OPTS.staple} value={v.staple} onChange={(x) => set({ staple: x })} editable={editable} />
        <RadioRow label="味" options={K_OPTS.taste} value={v.taste} onChange={(x) => set({ taste: x })} editable={editable} />
        <RadioRow label="分量" options={K_OPTS.amount} value={v.amount} onChange={(x) => set({ amount: x })} editable={editable} />
        <RadioRow label="鮮度" options={K_OPTS.freshness} value={v.freshness} onChange={(x) => set({ freshness: x })} editable={editable} />
        <RadioRow label="温度" options={K_OPTS.temp} value={v.temp} onChange={(x) => set({ temp: x })} editable={editable} />
        <RadioRow label="盛り付け" options={K_OPTS.plating} value={v.plating} onChange={(x) => set({ plating: x })} editable={editable} />
        <tr>
          <td className={`${B} px-2 py-1 bg-slate-50`}>異物・異臭・異味</td>
          <td className={`${B} px-2 py-1`}>
            <span className="inline-flex items-center gap-2 flex-wrap">
              <RadioInline options={K_OPTS.foreign} value={v.foreign} onChange={(x) => set({ foreign: x })} editable={editable} ariaLabel="異物異臭異味" />
              <span>
                あり（<FieldInput value={v.foreignNote} onChange={(x) => set({ foreignNote: x })} editable={editable} width="w-48" />）
              </span>
            </span>
          </td>
        </tr>
        <tr>
          <td className={`${B} px-2 py-1 bg-slate-50`}>検食者/担当者/時刻</td>
          <td className={`${B} px-2 py-1`}>
            <span className="inline-flex items-center gap-x-4 gap-y-1 flex-wrap">
              <span>検食者 <SelectField value={v.inspector} onChange={(x) => set({ inspector: x })} editable={editable} options={K_OPTS.inspector} width="w-28" /></span>
              <span>調理担当者 <SelectField value={v.cook} onChange={(x) => set({ cook: x })} editable={editable} options={K_OPTS.cook} width="w-28" /></span>
              <span>検食時間 <FieldInput type="time" value={v.time} onChange={(x) => set({ time: x })} editable={editable} width="w-32" /></span>
            </span>
          </td>
        </tr>
        <tr>
          <td className={`${B} px-2 py-1 bg-slate-50`}>所見</td>
          <td className={`${B} px-2 py-1`}>
            <NoteField value={v.note} onChange={(x) => set({ note: x })} editable={editable} />
          </td>
        </tr>
      </tbody>
    </table>
  )
}

export default function Kenshoku({ data, editable, reload, bulk = false }: ReportProps) {
  const [k, setK] = useState<KenshokuRecord>(emptyKenshoku)
  const loaded = useRef('') // 保存済みスナップショット（dirty 判定用）
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // data → state 同期＋時間経過の自動反映（当日・空欄のみ）。基準は保存済み saved＝先祖返り不可・冪等。
  useEffect(() => {
    const saved = mergeKenshoku(emptyKenshoku(), data?.kenshoku ?? null)
    setK(applyKenshokuAuto(saved, data?.menu_date ?? '', editable))
    loaded.current = JSON.stringify(saved) // 自動反映分は dirty として「未保存」点灯→保存で確定（案B）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.menu_date, data?.id, editable])

  const setMeal = (m: 'breakfast' | 'lunch' | 'dinner', patch: Partial<KenshokuMeal>) =>
    setK((p) => ({ ...p, [m]: { ...p[m], ...patch } }))
  const setSnack = (patch: Partial<KenshokuSnack>) => setK((p) => ({ ...p, snack: { ...p.snack, ...patch } }))

  const dirty = editable && JSON.stringify(k) !== loaded.current
  const save = async () => {
    if (saving || !data) return
    setSaving(true)
    setSaveError(null)
    try {
      await saveDailyReport(data.menu_date, { kenshoku: k })
      loaded.current = JSON.stringify(k)
      reload()
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  if (!data) return <p className="text-slate-500">この日の献立は未設定です。</p>
  const dishesOf = (key: string) => {
    const m = data.meals.find((x) => x.key === key)
    return m ? m.slots.map((s) => s.name).join('　') : ''
  }
  const sealed = sealAt(data.menu_date) // 夕食提供(17:20)経過で施設長印表示（時刻計算・保存しない）

  return (
    <div className="text-base">
      <div className="flex items-end justify-between mb-2 border-b-2 border-slate-700 pb-1">
        <div>
          <h2 className="text-2xl font-bold">検食簿</h2>
          <span className="text-sm">{reiwaDate(data.menu_date)}</span>
        </div>
        <div className="flex gap-3">
          <SealBox label="施設長" stamped={sealed} />
          <SealBox label="調理員" />
        </div>
      </div>

      {!bulk && (
        <>
          <div className="flex items-center justify-end gap-2 mb-2 print:hidden">
            {dirty && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded px-2 py-1">未保存・印刷前に保存を</span>
            )}
            {editable && (
              <button onClick={save} disabled={saving} className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px] disabled:opacity-50">
                {saving ? '保存中…' : '保存'}
              </button>
            )}
            <button onClick={() => window.print()} className="bg-slate-600 text-white text-sm rounded px-4 min-h-[40px]">
              印刷
            </button>
          </div>
          {saveError && <p className="text-red-600 text-sm mb-2 print:hidden">エラー: {saveError}</p>}
        </>
      )}

      <KenshokuMealForm label="朝食" dishes={dishesOf('breakfast')} v={k.breakfast} set={(p) => setMeal('breakfast', p)} editable={editable} />
      <KenshokuMealForm label="昼食" dishes={dishesOf('lunch')} v={k.lunch} set={(p) => setMeal('lunch', p)} editable={editable} />
      <KenshokuMealForm label="夕食" dishes={dishesOf('dinner')} v={k.dinner} set={(p) => setMeal('dinner', p)} editable={editable} />

      {data.snack && (
        <table className="w-full border-collapse mb-3 break-inside-avoid">
          <tbody>
            <tr className="bg-amber-50">
              <th className={`${B} px-2 py-1 text-left`} colSpan={2}>間食</th>
            </tr>
            <tr>
              <td className={`${B} px-2 py-1 w-28 bg-slate-50`}>献立</td>
              <td className={`${B} px-2 py-1`}>{data.snack.name}</td>
            </tr>
            <tr>
              <td className={`${B} px-2 py-1 bg-slate-50`}>検食者/担当者/時刻</td>
              <td className={`${B} px-2 py-1`}>
                <span className="inline-flex items-center gap-x-4 gap-y-1 flex-wrap">
                  <span>検食者 <SelectField value={k.snack.inspector} onChange={(x) => setSnack({ inspector: x })} editable={editable} options={K_OPTS.inspector} width="w-28" /></span>
                  <span>担当者 <SelectField value={k.snack.cook} onChange={(x) => setSnack({ cook: x })} editable={editable} options={K_OPTS.cook} width="w-28" /></span>
                  <span>時刻 <FieldInput type="time" value={k.snack.time} onChange={(x) => setSnack({ time: x })} editable={editable} width="w-32" /></span>
                </span>
              </td>
            </tr>
            <tr>
              <td className={`${B} px-2 py-1 bg-slate-50`}>所見</td>
              <td className={`${B} px-2 py-1`}>
                <NoteField value={k.snack.note} onChange={(x) => setSnack({ note: x })} editable={editable} />
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
