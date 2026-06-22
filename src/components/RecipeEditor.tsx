import type { RecipeRowInput } from '../lib/mutations'

// 編集中の行は安定キー(_k)を持つ（index key による削除時のフォーカス/IME乱れを防ぐ）
export type EditorRow = RecipeRowInput & { _k: string }

export default function RecipeEditor({
  rows,
  onChange,
}: {
  rows: EditorRow[]
  onChange: (rows: EditorRow[]) => void
}) {
  const update = (i: number, patch: Partial<EditorRow>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i))
  const add = () => onChange([...rows, { name: '', amount_g: null, _k: crypto.randomUUID() }])

  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={r._k} className="flex gap-1 items-center">
          <input
            list="ing-names"
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder="食材"
            className="flex-1 border rounded px-2 py-1.5 text-sm"
          />
          <input
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={r.amount_g ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v === '') return update(i, { amount_g: null })
              const n = Number(v)
              update(i, { amount_g: Number.isFinite(n) && n >= 0 ? n : null })
            }}
            placeholder="g"
            className="w-20 border rounded px-2 py-1.5 text-sm text-right"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            aria-label="食材を削除"
            className="text-red-500 px-3 min-h-[44px] text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={add} className="text-emerald-700 text-sm min-h-[40px]">
        ＋ 食材を追加
      </button>
      <p className="text-xs text-slate-400">分量を空欄にすると「適量」になります（調味料など）。</p>
    </div>
  )
}
