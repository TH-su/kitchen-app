import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  fetchDailyMenuByDate,
  fetchMenuSetPickList,
  fetchSnackPickList,
  upsertDailyMenu,
  deleteDailyMenu,
  resolveSetId,
  resolveSnackId,
  type DayDishItem,
  type PickItem,
} from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../hooks/useAuth'

const round1 = (n: number) => Math.round(n * 10) / 10

function ItemTable({ items, n }: { items: DayDishItem[]; n: number }) {
  if (!items.length) return null
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-slate-400 text-xs">
          <th className="text-left font-normal px-2">食材</th>
          <th className="text-right font-normal px-2 w-20">1人分</th>
          <th className="text-right font-normal px-2 w-24">総量(×{n})</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i} className="border-t">
            <td className="px-2 py-0.5">{it.name}</td>
            <td className="px-2 py-0.5 text-right text-slate-600">
              {it.perPerson != null ? `${it.perPerson} g` : '適量'}
            </td>
            <td className="px-2 py-0.5 text-right font-medium">
              {it.perPerson != null ? `${round1(it.perPerson * n)} g` : '適量'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Field({
  label,
  value,
  onChange,
  list,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  list: string
  placeholder?: string
}) {
  return (
    <label className="block text-sm">
      {label}
      <input
        list={list}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border rounded px-2 py-2 text-sm"
      />
    </label>
  )
}

export default function DailyMenuPage() {
  const { date = '' } = useParams()
  const nav = useNavigate()
  const { editable } = useAuth()
  const { data, loading, error, reload } = useLoader(() => fetchDailyMenuByDate(date), [date])
  useRealtime(['daily_menus', 'menu_sets', 'dishes', 'dish_ingredients'], reload)

  const [setPick, setSetPick] = useState<PickItem[]>([])
  const [snackPick, setSnackPick] = useState<PickItem[]>([])
  useEffect(() => {
    if (!editable) return
    fetchMenuSetPickList().then(setSetPick).catch(() => {})
    fetchSnackPickList().then(setSnackPick).catch(() => {})
  }, [editable])
  const [editing, setEditing] = useState(false)
  const [mealCount, setMealCount] = useState('30')
  const [bf, setBf] = useState('')
  const [ln, setLn] = useState('')
  const [dn, setDn] = useState('')
  const [snack, setSnack] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // 日付が変わったらフォームを初期化（realtime による data 変化では触らない）
  useEffect(() => {
    setEditing(false)
    setMealCount('30')
    setBf('')
    setLn('')
    setDn('')
    setSnack('')
    setNote('')
  }, [date])

  const startEdit = () => {
    if (data) {
      setMealCount(String(data.meal_count))
      setBf(data.breakfastCode ?? '')
      setLn(data.lunchCode ?? '')
      setDn(data.dinnerCode ?? '')
      setSnack(data.snackCode ?? '')
      setNote(data.note ?? '')
    }
    setSaveError(null)
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const n = Number(mealCount)
      if (!Number.isInteger(n) || n < 1 || n > 100000)
        throw new Error('食数は1以上の整数で入力してください')
      await upsertDailyMenu({
        menu_date: date,
        meal_count: n,
        breakfast_set_id: await resolveSetId(bf, '朝食'),
        lunch_set_id: await resolveSetId(ln, '昼食'),
        dinner_set_id: await resolveSetId(dn, '夕食'),
        snack_dish_id: await resolveSnackId(snack),
        note: note.trim() || null,
      })
      setEditing(false)
      reload()
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async () => {
    if (!data) return
    if (!window.confirm(`${date} の献立を削除しますか？`)) return
    try {
      await deleteDailyMenu(data.id)
      reload()
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    }
  }

  // 食材ごとの総使用量を集計
  const totals = useMemo(() => {
    if (!data) return []
    const sum = new Map<string, { per: number; tekiryo: boolean }>()
    const push = (items: DayDishItem[]) => {
      for (const it of items) {
        const cur = sum.get(it.name) ?? { per: 0, tekiryo: false }
        if (it.perPerson == null) cur.tekiryo = true
        else cur.per += it.perPerson
        sum.set(it.name, cur)
      }
    }
    for (const m of data.meals) for (const s of m.slots) push(s.items)
    if (data.snack) push(data.snack.items)
    return [...sum.entries()]
      .map(([name, v]) => ({ name, per: v.per, tekiryo: v.tekiryo }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [data])

  if (loading && !data) return <p className="text-slate-500">読み込み中…</p>
  if (error && !editing) return <p className="text-red-600">エラー: {error}</p>

  const showForm = editable && (editing || !data)

  if (showForm) {
    return (
      <div className="max-w-lg">
        <datalist id="menuset-codes">
          {setPick.map((p) => (
            <option key={p.id} value={p.code}>
              {p.label}
            </option>
          ))}
        </datalist>
        <datalist id="snack-codes">
          {snackPick.map((p) => (
            <option key={p.id} value={p.code}>
              {p.label}
            </option>
          ))}
        </datalist>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{date} の献立</h2>
          <div className="flex gap-2">
            <button
              onClick={() => (data ? setEditing(false) : nav('/days'))}
              className="text-slate-500 text-sm px-3 min-h-[40px]"
            >
              取消
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="bg-emerald-600 text-white text-sm px-4 rounded min-h-[40px] disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
        {saveError && <p className="text-red-600 text-sm mb-2">エラー: {saveError}</p>}
        <div className="space-y-3 bg-white border rounded p-3">
          <label className="block text-sm">
            食数（人）
            <input
              type="number"
              min="1"
              step="1"
              value={mealCount}
              onChange={(e) => setMealCount(e.target.value)}
              className="mt-1 block w-32 border rounded px-2 py-2 text-sm"
            />
          </label>
          <Field label="朝食 番号" value={bf} onChange={setBf} list="menuset-codes" placeholder="例 魚⑨（空欄可）" />
          <Field label="昼食 番号" value={ln} onChange={setLn} list="menuset-codes" placeholder="例 牛⑨" />
          <Field label="夕食 番号" value={dn} onChange={setDn} list="menuset-codes" placeholder="例 そ⑭" />
          <Field label="おやつ 番号" value={snack} onChange={setSnack} list="snack-codes" placeholder="例 お56" />
          <label className="block text-sm">
            メモ
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full border rounded px-2 py-2 text-sm"
            />
          </label>
        </div>
        {data && (
          <div className="mt-4 border-t pt-3">
            <button onClick={onDelete} className="text-red-600 text-sm min-h-[40px]">
              この日の献立を削除
            </button>
          </div>
        )}
      </div>
    )
  }

  if (!data) {
    return (
      <div>
        <button onClick={() => nav('/days')} className="text-emerald-700 text-sm mb-3 inline-block min-h-[40px]">
          ← 一覧へ
        </button>
        <p className="text-slate-500">{date} の献立は未設定です。{editable ? '' : '（編集にはログインが必要です）'}</p>
      </div>
    )
  }

  const N = data.meal_count
  return (
    <div>
      <div className="flex items-center justify-between mb-3 print:hidden">
        <button
          onClick={() => nav('/days')}
          className="inline-flex items-center min-h-[44px] px-2 -ml-2 text-emerald-700 text-sm"
        >
          ← 一覧へ
        </button>
        <div className="flex gap-2">
          {editable && (
            <button
              onClick={startEdit}
              className="inline-flex items-center min-h-[44px] px-4 border border-emerald-600 text-emerald-700 text-sm rounded"
            >
              編集
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="inline-flex items-center min-h-[44px] px-4 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700"
          >
            印刷
          </button>
        </div>
      </div>

      <div className="mb-3">
        <h2 className="text-xl font-bold">{data.menu_date}　作業指示書</h2>
        <p className="text-sm text-slate-600">
          食数: <span className="font-bold">{N}</span> 人{data.note ? `　/　${data.note}` : ''}
        </p>
        <p className="hidden print:block text-xs text-slate-500">ラウレアハレ厨房</p>
      </div>

      {data.meals.map((m) => (
        <div key={m.key} className="mb-4 break-inside-avoid">
          <h3 className="font-bold text-emerald-700 border-b border-emerald-200 mb-1">
            {m.label}
            {m.code ? `（${m.code}）` : '（未設定）'}
          </h3>
          {m.slots.length === 0 ? (
            <p className="text-slate-400 text-sm">未設定</p>
          ) : (
            m.slots.map((s) => (
              <div key={s.slot} className="mb-2">
                <div className="text-sm font-semibold">
                  {s.label}: {s.name}
                </div>
                <ItemTable items={s.items} n={N} />
              </div>
            ))
          )}
        </div>
      ))}

      {data.snack && (
        <div className="mb-4 break-inside-avoid">
          <h3 className="font-bold text-emerald-700 border-b border-emerald-200 mb-1">
            おやつ{data.snackCode ? `（${data.snackCode}）` : ''}
          </h3>
          <div className="text-sm font-semibold">{data.snack.name}</div>
          <ItemTable items={data.snack.items} n={N} />
        </div>
      )}

      <div className="mt-6 break-inside-avoid">
        <h3 className="font-bold border-b border-slate-300 mb-1">食材 総使用量（{N}人分）</h3>
        {totals.length === 0 ? (
          <p className="text-slate-400 text-sm">食材データなし</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {totals.map((t) => (
                <tr key={t.name} className="border-t">
                  <td className="px-2 py-0.5">{t.name}</td>
                  <td className="px-2 py-0.5 text-right text-slate-500 text-xs">
                    {t.per > 0 ? `${round1(t.per)} g/人` : ''}
                    {t.tekiryo ? '（適量含）' : ''}
                  </td>
                  <td className="px-2 py-0.5 text-right font-medium w-24">
                    {t.per > 0 ? `${round1(t.per * N)} g` : t.tekiryo ? '適量' : ''}
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
