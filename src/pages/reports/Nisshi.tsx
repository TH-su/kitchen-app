import type { ReportProps } from './types'
import { reiwaDate } from '../../lib/date'
import {
  N_LEFT,
  emptyNisshi,
  mergeNisshi,
  applyNisshiAuto,
  sealAt,
  type NisshiRecord,
  type NisshiMeal,
  type NisshiSnack,
} from '../../lib/reports'
import { useDailyReport } from '../../hooks/useDailyReport'
import { useStaffCandidates } from '../../hooks/useStaffCandidates'
import { RadioInline, FieldInput, ComboField, SealBox } from './ReportFields'

const B = 'border border-slate-400'

export default function Nisshi({ data, editable, reload, bulk = false }: ReportProps) {
  // 自動反映は当日その場で DB へ永続化される（useDailyReport）。手動編集は従来どおり保存ボタンで確定。
  const { v: nz, setV: setNz, dirty, saving, saveError, save } = useDailyReport<NisshiRecord>({
    data,
    editable,
    reload,
    column: 'nisshi',
    empty: emptyNisshi,
    merge: mergeNisshi,
    applyAuto: applyNisshiAuto,
  })
  // 検食者/調理担当者コンボの候補リスト（env既定＋シフト職員名簿）。既定値・自動反映は不変。
  const { inspectors, cooks } = useStaffCandidates()

  const setMeal = (m: 'breakfast' | 'lunch' | 'dinner', patch: Partial<NisshiMeal>) =>
    setNz((p) => ({ ...p, [m]: { ...p[m], ...patch } }))
  const setSnack = (patch: Partial<NisshiSnack>) => setNz((p) => ({ ...p, snack: { ...p.snack, ...patch } }))

  if (!data) return <p className="text-slate-500">この日の献立は未設定です。</p>
  const sealed = sealAt(data.menu_date) // 夕食提供(17:20)経過で施設長印表示（時刻計算・保存しない）

  return (
    <div className="text-base">
      <div className="flex items-end justify-between mb-2 border-b-2 border-slate-700 pb-1">
        <div>
          <h2 className="text-2xl font-bold">給食日誌</h2>
          <span className="text-sm">
            {reiwaDate(data.menu_date)}　予定 {data.meal_count} 人
          </span>
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

      {data.meals.map((m) => {
        const key = m.key as 'breakfast' | 'lunch' | 'dinner'
        const v = nz[key]
        return (
          <table key={m.key} className="w-full border-collapse mb-3 break-inside-avoid">
            <tbody>
              <tr className="bg-slate-100">
                <th className={`${B} px-2 py-1 text-left w-24`}>{m.label}</th>
                <th className={`${B} px-2 py-1 text-left`}>献立名</th>
                <th className={`${B} px-2 py-1 w-52`}>中心温度</th>
                <th className={`${B} px-2 py-1 w-28`}>残食</th>
              </tr>
              <tr>
                <td className={`${B} px-2 py-1 align-top text-sm`}>
                  調理担当者
                  <br />
                  {/* 調理担当者を変えると検食日誌記録者も連動（検食者は独立） */}
                  <ComboField value={v.cook} onChange={(x) => setMeal(key, { cook: x, recorder: x })} editable={editable} options={cooks} width="w-24" />
                </td>
                <td className={`${B} px-2 py-1`}>{m.slots.length ? m.slots.map((s) => s.name).join('／') : '未設定'}</td>
                <td className={`${B} px-2 py-1 text-sm whitespace-nowrap`}>
                  主菜 <FieldInput type="number" value={v.tempMain} onChange={(x) => setMeal(key, { tempMain: x })} editable={editable} width="w-16" suffix="℃" />
                  <br />
                  副菜 <FieldInput type="number" value={v.tempSide} onChange={(x) => setMeal(key, { tempSide: x })} editable={editable} width="w-16" suffix="℃" />
                </td>
                <td className={`${B} px-2 py-1`}>
                  <FieldInput type="number" value={v.leftover} onChange={(x) => setMeal(key, { leftover: x })} editable={editable} width="w-16" suffix="g" />
                </td>
              </tr>
              <tr>
                <td className={`${B} px-2 py-1 text-sm`} colSpan={2}>
                  <span className="inline-flex items-center gap-x-4 gap-y-1 flex-wrap">
                    <span>検食者 <ComboField value={v.inspector} onChange={(x) => setMeal(key, { inspector: x })} editable={editable} options={inspectors} width="w-24" /></span>
                    <span>出来上がり <FieldInput type="time" value={v.doneTime} onChange={(x) => setMeal(key, { doneTime: x })} editable={editable} width="w-28" /></span>
                  </span>
                </td>
                <td className={`${B} px-2 py-1 text-sm`} colSpan={2}>
                  <span className="inline-flex items-center gap-x-4 gap-y-1 flex-wrap">
                    <span>
                      予定 {data.meal_count} 人 ／ 実施{' '}
                      <FieldInput type="number" value={v.actualCount} onChange={(x) => setMeal(key, { actualCount: x })} editable={editable} width="w-16" suffix="人" />
                    </span>
                    <span>検食日誌記録者 <ComboField value={v.recorder} onChange={(x) => setMeal(key, { recorder: x })} editable={editable} options={cooks} width="w-24" /></span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        )
      })}

      {data.snack && (
        <table className="w-full border-collapse mb-3 break-inside-avoid">
          <tbody>
            <tr className="bg-amber-50">
              <th className={`${B} px-2 py-1 text-left w-24`}>おやつ</th>
              <th className={`${B} px-2 py-1 text-left`}>献立名</th>
              <th className={`${B} px-2 py-1 w-64`}>残食状況</th>
            </tr>
            <tr>
              <td className={`${B} px-2 py-1 text-sm`}>
                調理担当者 <ComboField value={nz.snack.cook} onChange={(x) => setSnack({ cook: x })} editable={editable} options={cooks} width="w-24" />
                <br />
                検食者 <ComboField value={nz.snack.inspector} onChange={(x) => setSnack({ inspector: x })} editable={editable} options={inspectors} width="w-24" />
              </td>
              <td className={`${B} px-2 py-1`}>{data.snack.name}</td>
              <td className={`${B} px-2 py-1 text-sm`}>
                <div className="flex items-center gap-2">
                  <span className="w-8">1F</span>
                  <RadioInline options={N_LEFT} value={nz.snack.left1F} onChange={(x) => setSnack({ left1F: x })} editable={editable} ariaLabel="おやつ残食1F" />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="w-8">2F</span>
                  <RadioInline options={N_LEFT} value={nz.snack.left2F} onChange={(x) => setSnack({ left2F: x })} editable={editable} ariaLabel="おやつ残食2F" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  )
}
