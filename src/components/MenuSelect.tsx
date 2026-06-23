import type { PickItem } from '../lib/daily'

// 昼食・夕食で「朝以外」を並べる順（左カテゴリの指定順）
const NON_BREAKFAST_ORDER = ['豚', '鶏', '牛', '魚', 'ミンチ', 'めん', '行事', 'その他', 'ご当地']
const bySeq = (a: PickItem, b: PickItem) => (a.seq_no ?? 1e9) - (b.seq_no ?? 1e9)

// native <select>。選択済みからでも直接開いて上書きできる（datalist の「クリア必須」問題を解消）。
// value はメニューID（文字列）。'' = 未選択。
export default function MenuSelect({
  value,
  onChange,
  items,
  kind,
  className,
}: {
  value: string
  onChange: (v: string) => void
  items: PickItem[]
  kind: 'breakfast' | 'main' | 'snack'
  className?: string
}) {
  let groups: { label: string; opts: PickItem[] }[]
  if (kind === 'snack') {
    groups = [{ label: '', opts: items }]
  } else if (kind === 'breakfast') {
    groups = [{ label: '', opts: items.filter((i) => i.category === '朝').sort(bySeq) }]
  } else {
    const others = items.filter((i) => i.category !== '朝')
    const known = NON_BREAKFAST_ORDER.map((cat) => ({
      label: cat,
      opts: others.filter((i) => i.category === cat).sort(bySeq),
    }))
    const knownSet = new Set(NON_BREAKFAST_ORDER)
    const restCats = [...new Set(others.filter((i) => !knownSet.has(i.category)).map((i) => i.category))]
    const rest = restCats.map((cat) => ({
      label: cat,
      opts: others.filter((i) => i.category === cat).sort(bySeq),
    }))
    groups = [...known, ...rest].filter((g) => g.opts.length)
  }

  // 現在の選択がフィルタ結果に含まれない場合のフォールバック（value/option 不一致による desync 防止）
  const presentIds = new Set(groups.flatMap((g) => g.opts.map((o) => String(o.id))))
  if (value && !presentIds.has(value)) {
    const cur = items.find((i) => String(i.id) === value)
    if (cur) groups = [{ label: '現在の選択', opts: [cur] }, ...groups]
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className ?? 'mt-1 block w-full border rounded px-2 py-2 text-base bg-white'}
    >
      <option value="">（未選択）</option>
      {groups.map((g, gi) =>
        g.label ? (
          <optgroup key={gi} label={g.label}>
            {g.opts.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          g.opts.map((o) => (
            <option key={o.id} value={String(o.id)}>
              {o.label}
            </option>
          ))
        )
      )}
    </select>
  )
}
