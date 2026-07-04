import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fetchMenuSetDetail, fetchAllIngredientNames, fetchIngredientKcalMap, fetchMenuSets, type MenuSetDetail } from '../lib/queries'
import {
  updateDishName,
  saveDishRecipe,
  createSlotDish,
  clearSlot,
  deleteMenuSet,
  type SlotKey,
} from '../lib/mutations'
import { simulateMeal, SIM_TARGET_DEFAULTS, type DaySlot, type DayDishItem, type MealSim } from '../lib/daily'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../hooks/useAuth'
import RecipeEditor, { type EditorRow } from '../components/RecipeEditor'
import MealSimCard from '../components/MealSimCard'

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
  const savingRef = useRef(false) // state のバッチ更新に依存しない同期的な再入ガード
  const [saveError, setSaveError] = useState<string | null>(null)
  const [kcalMap, setKcalMap] = useState<Record<string, number>>({}) // 食材名→kcal/100g（シミュのライブ計算用）
  const [targetStr, setTargetStr] = useState('') // 目標kcal（カテゴリ別初期値・編集可・保存しない）

  // 前後メニュー移動: 同カテゴリの一覧(seq_no順)。カテゴリ不変なら再取得されない
  const { data: siblings } = useLoader(
    () => (data?.category ? fetchMenuSets(data.category) : Promise.resolve([])),
    [data?.category]
  )
  const sibIds = (siblings ?? []).map((s) => s.id)
  const curIdx = sibIds.indexOf(Number(id))
  const prevId = curIdx > 0 ? sibIds[curIdx - 1] : null
  const nextId = curIdx >= 0 && curIdx < sibIds.length - 1 ? sibIds[curIdx + 1] : null

  // 食材名→kcal/100g はマウント時に取得（表示・編集の両モードでシミュに使用）
  useEffect(() => {
    fetchIngredientKcalMap()
      .then(setKcalMap)
      .catch((e) => console.error('カロリー表の読み込みに失敗:', e))
  }, [])

  // セット切替時にカテゴリ別の初期目標へ（朝食は軽め）
  useEffect(() => {
    if (data) setTargetStr(String(data.category === '朝' ? SIM_TARGET_DEFAULTS.breakfast : SIM_TARGET_DEFAULTS.lunch))
  }, [data?.id, data?.category])

  // 「シミュ」タブと同一ロジック: セットのスロットを DaySlot[] に変換し simulateMeal で理想量を逆算。
  // 表示=保存データ / 編集=編集中モデル（kcalMapで食材kcalを付与）＝編集中もリアルタイム再計算。
  const sim = useMemo<MealSim | null>(() => {
    if (!data) return null
    const src = editing
      ? model.map((s) => ({ slot: s.slot, label: s.label, name: s.name, items: s.rows }))
      : data.slots.map((s) => ({ slot: s.slot, label: s.label, name: s.name, items: s.items }))
    const daySlots: DaySlot[] = src
      .filter((s) => (s.name || '').trim())
      .map((s) => ({
        slot: s.slot,
        label: s.label,
        name: s.name,
        notes: null,
        items: (s.items || [])
          .filter((it) => (it.name || '').trim())
          .map((it): DayDishItem => {
            const per100 = kcalMap[(it.name || '').trim()]
            const has = per100 != null
            return {
              name: it.name,
              perPerson: it.amount_g ?? null,
              kcal: has && it.amount_g != null ? (it.amount_g / 100) * per100 : null,
              protein: null,
              fat: null,
              carb: null,
              salt: null,
              hasData: has,
            }
          }),
      }))
    return simulateMeal('set', data.code, daySlots, Number(targetStr) || 0)
  }, [editing, model, data, kcalMap, targetStr])

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
    // 二重保存ガード（連打・遅延クリック対策）。React18のバッチング下でも確実に弾けるよう
    // state ではなく ref で同期的に判定する（disabled/saving と二重の保険）
    if (savingRef.current) return
    savingRef.current = true
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
      savingRef.current = false
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
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4">
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
          {sim && (
            <div className="print:hidden">
              <MealSimCard sim={sim} targetStr={targetStr} onTarget={(_k, v) => setTargetStr(v)} />
            </div>
          )}
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
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          disabled={prevId == null}
          onClick={() => prevId != null && nav(`/set/${prevId}`)}
          className="print:hidden min-h-[40px] min-w-[44px] px-2 rounded border bg-white text-slate-700 text-lg font-bold hover:bg-slate-50 disabled:opacity-30"
          aria-label="前のメニュー"
        >
          ←
        </button>
        <h2 className="text-xl font-bold">
          {data.code} <span className="text-sm font-normal text-slate-500">（{data.category}）</span>
        </h2>
        <button
          type="button"
          disabled={nextId == null}
          onClick={() => nextId != null && nav(`/set/${nextId}`)}
          className="print:hidden min-h-[40px] min-w-[44px] px-2 rounded border bg-white text-slate-700 text-lg font-bold hover:bg-slate-50 disabled:opacity-30"
          aria-label="次のメニュー"
        >
          →
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-4 print:block">
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
        {sim && (
          <div className="print:hidden">
            <MealSimCard sim={sim} targetStr={targetStr} onTarget={(_k, v) => setTargetStr(v)} />
          </div>
        )}
      </div>
    </div>
  )
}
