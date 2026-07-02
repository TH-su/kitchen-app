import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchMenuSetDetail, fetchAllIngredientNames, type MenuSetDetail } from '../lib/queries'
import {
  updateDishName,
  saveDishRecipe,
  createSlotDish,
  clearSlot,
  deleteMenuSet,
  type SlotKey,
} from '../lib/mutations'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../hooks/useAuth'
import RecipeEditor, { type EditorRow } from '../components/RecipeEditor'

const SLOTS: { slot: SlotKey; label: string }[] = [
  { slot: 'staple', label: '主食' },
  { slot: 'main', label: 'メイン' },
  { slot: 'side1', label: '副菜①' },
  { slot: 'side2', label: '副菜②' },
  { slot: 'soup', label: '汁物' },
]

interface EditSlot {
  slot: SlotKey
  label: string
  dishId: number | null
  name: string
  rows: EditorRow[]
}

const toEditModel = (data: MenuSetDetail): EditSlot[] =>
  SLOTS.map(({ slot, label }) => {
    const found = data.slots.find((s) => s.slot === slot)
    return {
      slot,
      label,
      dishId: found?.dishId ?? null,
      name: found?.name ?? '',
      rows: found ? found.items.map((it, i) => ({ name: it.name, amount_g: it.amount_g, _k: `r${i}` })) : [],
    }
  })

export default function MenuSetDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { editable } = useAuth()
  const { data, loading, error, reload } = useLoader(
    () => (id ? fetchMenuSetDetail(Number(id)) : Promise.resolve(null)),
    [id]
  )
  useRealtime(['menu_sets', 'dishes', 'dish_ingredients'], reload)

  const [editing, setEditing] = useState(false)
  const [model, setModel] = useState<EditSlot[]>([])
  const [names, setNames] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const startEdit = () => {
    if (!data) return
    setModel(toEditModel(data))
    setSaveError(null)
    setEditing(true)
    fetchAllIngredientNames()
      .then(setNames)
      .catch((e) => console.error('食材名候補の読み込みに失敗:', e))
  }
  const setSlot = (i: number, patch: Partial<EditSlot>) =>
    setModel((m) => m.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const save = async () => {
    if (!data) return
    if (saving) return // 二重保存ガード（連打・遅延クリック対策）
    setSaving(true)
    setSaveError(null)
    try {
      for (let i = 0; i < model.length; i++) {
        const s = model[i]
        const name = s.name.trim()
        if (s.dishId) {
          if (!name) await clearSlot(data.id, s.slot, s.dishId)
          else {
            await updateDishName(s.dishId, name)
            await saveDishRecipe(s.dishId, s.rows)
          }
        } else if (name) {
          const newId = await createSlotDish(data.id, s.slot, name)
          setSlot(i, { dishId: newId }) // リトライ時の二重作成を防ぐ
          await saveDishRecipe(newId, s.rows)
        }
      }
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
    if (!window.confirm(`献立「${data.code}」を削除します。元に戻せません。よろしいですか？`)) return
    try {
      await deleteMenuSet(data.id)
      nav('/')
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    }
  }

  if (loading && !data) return <p className="text-slate-500">読み込み中…</p>
  if (error && !editing) return <p className="text-red-600">エラー: {error}</p>
  if (!data) return <p>見つかりません</p>

  if (editing) {
    return (
      <div>
        <datalist id="ing-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold">{data.code} を編集</h2>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-slate-500 text-sm px-3 min-h-[40px]">
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
        <div className="space-y-3">
          {model.map((s, i) => (
            <div key={s.slot} className="bg-white rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold w-16 shrink-0">{s.label}</span>
                <input
                  value={s.name}
                  onChange={(e) => setSlot(i, { name: e.target.value })}
                  placeholder="料理名（空欄=このスロット削除）"
                  className="flex-1 border rounded px-2 py-1.5 text-sm"
                />
              </div>
              {s.name.trim() && (
                <div className="sm:pl-16">
                  <RecipeEditor rows={s.rows} onChange={(rows) => setSlot(i, { rows })} />
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-6 border-t pt-3">
          <button onClick={onDelete} className="text-red-600 text-sm min-h-[40px]">
            この献立セットを削除
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 print:hidden">
        <button
          onClick={() => nav(-1)}
          className="inline-flex items-center min-h-[44px] px-2 -ml-2 text-emerald-700 text-sm"
        >
          ← 一覧へ戻る
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
      <div className="hidden print:block mb-3 text-sm text-slate-600">
        ラウレアハレ厨房　印刷日: {new Date().toLocaleDateString('ja-JP')}
      </div>
      <h2 className="text-xl font-bold mb-3">
        {data.code} <span className="text-sm font-normal text-slate-500">（{data.category}）</span>
      </h2>
      <div className="space-y-3">
        {data.slots.map((s) => (
          <div key={s.slot} className="bg-white rounded-lg border overflow-hidden break-inside-avoid">
            <div className="bg-slate-100 border-b border-slate-300 px-3 py-1.5 text-sm font-semibold flex justify-between items-baseline gap-2">
              <span>{s.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-emerald-700">{s.name}</span>
                {s.kcal > 0 && <span className="text-slate-600 whitespace-nowrap">{Math.round(s.kcal)} kcal</span>}
              </span>
            </div>
            {s.items.length > 0 ? (
              <table className="w-full text-sm">
                <tbody>
                  {s.items.map((it, i) => (
                    <tr key={i} className="border-t break-inside-avoid">
                      <td className="px-3 py-1">{it.name}</td>
                      <td className="px-3 py-1 text-right text-slate-600 w-24">
                        {it.amount_g != null ? `${it.amount_g} g` : '適量'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="px-3 py-2 text-slate-400 text-sm">材料データなし</div>
            )}
          </div>
        ))}
        {data.slots.length === 0 && (
          <p className="text-slate-400">
            まだ料理が登録されていません。{editable ? '「編集」から追加してください。' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
