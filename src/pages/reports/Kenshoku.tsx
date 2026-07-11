import type { ReportProps } from './types'
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
import { useDailyReport } from '../../hooks/useDailyReport'
import { useStaffCandidates } from '../../hooks/useStaffCandidates'
import { RadioRow, RadioInline, FieldInput, SelectField, ComboField, MirrorField, NoteField, SealBox } from './ReportFields'

const B = 'border border-slate-400'

function KenshokuMealForm({
  label,
  dishes,
  v,
  set,
  editable,
  linkInspector = false,
}: {
  label: string
  dishes: string
  v: KenshokuMeal
  set: (patch: Partial<KenshokuMeal>) => void
  editable: boolean
  linkInspector?: boolean // true=朝夕: 調理担当者を変えると検食者も同名に連動 / false=昼: 独立
}) {
  // 候補リストのみシフト職員名簿を後置（未接続時は env 既定=従来と完全同一）。既定値・連動・保存は不変。
  const { inspectors, cooks } = useStaffCandidates()
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
              {/* 朝夕は調理担当者に連動する表示専用（プルダウン無し）。値は保存済み inspector を出す
                  ＝過去に inspector≠cook で保存された記録を画面/印刷/保存で改変しない */}
              <span>検食者 {linkInspector
                ? <MirrorField value={v.inspector} width="w-28" />
                : <ComboField value={v.inspector} onChange={(x) => set({ inspector: x })} editable={editable} options={inspectors} width="w-28" />}</span>
              <span>調理担当者 <ComboField value={v.cook} onChange={(x) => set(linkInspector ? { cook: x, inspector: x } : { cook: x })} editable={editable} options={cooks} width="w-28" /></span>
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
  // 自動反映は当日その場で DB へ永続化される（useDailyReport）。手動編集は従来どおり保存ボタンで確定。
  const { v: k, setV: setK, dirty, saving, saveError, save } = useDailyReport<KenshokuRecord>({
    data,
    editable,
    reload,
    column: 'kenshoku',
    empty: emptyKenshoku,
    merge: mergeKenshoku,
    applyAuto: applyKenshokuAuto,
  })
  // 間食コンボの候補リスト（未接続時は env 既定=従来と完全同一）
  const { inspectors, cooks } = useStaffCandidates()

  const setMeal = (m: 'breakfast' | 'lunch' | 'dinner', patch: Partial<KenshokuMeal>) =>
    setK((p) => ({ ...p, [m]: { ...p[m], ...patch } }))
  const setSnack = (patch: Partial<KenshokuSnack>) => setK((p) => ({ ...p, snack: { ...p.snack, ...patch } }))

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

      <KenshokuMealForm label="朝食" dishes={dishesOf('breakfast')} v={k.breakfast} set={(p) => setMeal('breakfast', p)} editable={editable} linkInspector />
      <KenshokuMealForm label="昼食" dishes={dishesOf('lunch')} v={k.lunch} set={(p) => setMeal('lunch', p)} editable={editable} />
      <KenshokuMealForm label="夕食" dishes={dishesOf('dinner')} v={k.dinner} set={(p) => setMeal('dinner', p)} editable={editable} linkInspector />

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
                  <span>検食者 <ComboField value={k.snack.inspector} onChange={(x) => setSnack({ inspector: x })} editable={editable} options={inspectors} width="w-28" /></span>
                  <span>担当者 <ComboField value={k.snack.cook} onChange={(x) => setSnack({ cook: x })} editable={editable} options={cooks} width="w-28" /></span>
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
