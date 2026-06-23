import { useEffect, useState } from 'react'
import {
  upsertDailyMenu,
  aggregateTotals,
  type DailyMenuFull,
  type DaySlot,
} from '../../lib/daily'
import MenuSelect from '../../components/MenuSelect'
import type { ReportProps } from './types'

const round1 = (n: number) => Math.round(n * 10) / 10
const numOrNull = (s: string) => (s ? Number(s) : null)
const BORDER = 'border border-slate-400'

function MealBlock({ label, code, slots, n }: { label: string; code: string | null; slots: DaySlot[]; n: number }) {
  return (
    <div className="mb-4 break-inside-avoid">
      <h3 className="text-lg font-bold bg-slate-100 border border-slate-400 px-2 py-1">
        {label}
        {code ? `（${code}）` : '（未設定）'}
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
                s.items.map((it, i) => (
                  <tr key={s.slot + i}>
                    {i === 0 && (
                      <td rowSpan={s.items.length} className={`${BORDER} px-2 py-1 align-top font-semibold`}>
                        {s.name}
                      </td>
                    )}
                    <td className={`${BORDER} px-2 py-1`}>{it.name}</td>
                    <td className={`${BORDER} px-2 py-1 text-right text-slate-600`}>
                      {it.perPerson != null ? `${it.perPerson} g` : '適量'}
                    </td>
                    <td className={`${BORDER} px-2 py-1 text-right font-medium`}>
                      {it.perPerson != null ? `${round1(it.perPerson * n)} g` : '適量'}
                    </td>
                    {i === 0 && (
                      <td rowSpan={s.items.length} className={`${BORDER} px-2 py-1 align-top text-sm text-slate-600`}>
                        {s.notes ?? ''}
                      </td>
                    )}
                  </tr>
                ))
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

function WorkSheet({ data, n }: { data: DailyMenuFull; n: number }) {
  const totals = aggregateTotals(data)
  return (
    <div className="text-base">
      <div className="flex items-end justify-between mb-2 border-b-2 border-slate-700 pb-1">
        <h2 className="text-2xl font-bold">作業指示書</h2>
        <div className="text-base">
          <span className="mr-4">{data.menu_date}</span>
          <span className="font-bold">食数 {n} 人</span>
        </div>
      </div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-600">ラウレアハレ厨房{data.note ? `　/　${data.note}` : ''}</p>
        <button
          onClick={() => window.print()}
          className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px] print:hidden"
        >
          印刷
        </button>
      </div>

      {data.meals.map((m) => (
        <MealBlock key={m.key} label={m.label} code={m.code} slots={m.slots} n={n} />
      ))}
      {data.snack && (
        <MealBlock
          label="おやつ"
          code={data.snackCode}
          slots={[{ slot: 'snack', label: 'おやつ', name: data.snack.name, notes: null, items: data.snack.items }]}
          n={n}
        />
      )}

      <div className="mb-2 break-inside-avoid">
        <h3 className="text-lg font-bold bg-slate-100 border border-slate-400 px-2 py-1">食材 総使用量（{n}人分）</h3>
        {totals.length === 0 ? (
          <div className="border border-t-0 border-slate-400 px-2 py-1 text-slate-400">食材データなし</div>
        ) : (
          <table className="w-full border-collapse text-base">
            <tbody>
              {totals.map((t) => (
                <tr key={t.name}>
                  <td className={`${BORDER} px-2 py-1`}>{t.name}</td>
                  <td className={`${BORDER} px-2 py-1 text-right text-slate-500 text-sm w-28`}>
                    {t.per > 0 ? `${round1(t.per)} g/人` : ''}
                    {t.tekiryo ? '（適量含）' : ''}
                  </td>
                  <td className={`${BORDER} px-2 py-1 text-right font-medium w-28`}>
                    {t.per > 0 ? `${round1(t.per * n)} g` : t.tekiryo ? '適量' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export default function WorkInstruction({ date, data, reload, editable, pickSets, pickSnacks }: ReportProps) {
  const [mealCount, setMealCount] = useState('30')
  const [bf, setBf] = useState('')
  const [ln, setLn] = useState('')
  const [dn, setDn] = useState('')
  const [snack, setSnack] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // data → 選択パネル同期（日付 or レコード変化時のみ。編集中の realtime では極力触らない）
  useEffect(() => {
    setMealCount(data ? String(data.meal_count) : '30')
    setBf(data?.breakfastSetId ? String(data.breakfastSetId) : '')
    setLn(data?.lunchSetId ? String(data.lunchSetId) : '')
    setDn(data?.dinnerSetId ? String(data.dinnerSetId) : '')
    setSnack(data?.snackDishId ? String(data.snackDishId) : '')
    setNote(data?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, data?.id])

  const save = async () => {
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
      })
      reload()
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  const N = data?.meal_count ?? (Number(mealCount) || 1)

  return (
    <div>
      {editable && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 mb-4 print:hidden">
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
        </div>
      )}

      {!data ? (
        <p className="text-slate-500">
          {date} の献立は未設定です。
          {editable ? '上の欄で選んで「保存して反映」してください。' : '（編集にはログインが必要です）'}
        </p>
      ) : (
        <WorkSheet data={data} n={N} />
      )}
    </div>
  )
}
