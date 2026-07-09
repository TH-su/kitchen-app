// 検食簿・給食日誌 共通のデュアルレンダー部品。
// 画面=入力コントロール / 印刷=紙様式どおりの確定値（選択は丸＋太字・未入力は空欄）。
// 全て Tailwind の print: ユーティリティで完結＝index.css は変更しない。
const B = 'border border-slate-400'

// 画面=トグルボタン群 / 印刷=全選択肢を「・」区切りで並べ選択値のみ丸＋太字。
// button+role=radio 採用＝type=radio の name 衝突（3食同時マウント）を原理的に回避し、同値クリックで解除できる。
function Segment({
  options,
  value,
  onChange,
  editable,
  ariaLabel,
}: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  editable: boolean
  ariaLabel: string
}) {
  return (
    <>
      <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1 print:hidden">
        {options.map((o) => {
          const on = value === o
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!editable}
              onClick={() => onChange(on ? '' : o)}
              className={`rounded px-3 min-h-[40px] inline-flex items-center text-sm border ${
                on ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300'
              } ${editable ? '' : 'opacity-60 pointer-events-none'}`}
            >
              {o}
            </button>
          )
        })}
      </div>
      <div className="hidden print:block">
        {options.map((o, i) => (
          <span key={o}>
            {i > 0 && <span className="mx-1">・</span>}
            <span className={value === o ? 'font-bold rounded-full border border-black px-2 py-0.5' : ''}>{o}</span>
          </span>
        ))}
      </div>
    </>
  )
}

// 表の1行（ラベル + セグメント選択）
export function RadioRow({
  label,
  options,
  value,
  onChange,
  editable,
}: {
  label: string
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  editable: boolean
}) {
  return (
    <tr>
      <td className={`${B} px-2 py-1 w-28 bg-slate-50`}>{label}</td>
      <td className={`${B} px-2 py-1`}>
        <Segment options={options} value={value} onChange={onChange} editable={editable} ariaLabel={label} />
      </td>
    </tr>
  )
}

// セル内インライン用（tr を作らない）
export function RadioInline(props: {
  options: readonly string[]
  value: string
  onChange: (v: string) => void
  editable: boolean
  ariaLabel: string
}) {
  return <Segment {...props} />
}

// text/number/time。画面=入力 / 印刷=下線付き確定値（空は下線のみ）。suffix(℃/g/人)は画面・印刷とも入力の後に表示。
// number/time もテキスト差替＝スピナー/時計アイコンで様式が崩れるのを回避。
export function FieldInput({
  type = 'text',
  value,
  onChange,
  editable,
  width = 'w-40',
  suffix,
}: {
  type?: 'text' | 'number' | 'time'
  value: string
  onChange: (v: string) => void
  editable: boolean
  width?: string
  suffix?: string
}) {
  return (
    <>
      <input
        type={type}
        value={value}
        disabled={!editable}
        inputMode={type === 'number' ? 'decimal' : undefined}
        min={type === 'number' ? '0' : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`print:hidden border rounded px-2 py-1 text-base ${width} disabled:bg-slate-100`}
      />
      <span className="hidden print:inline-block align-bottom border-b border-black text-center px-1 min-w-[3rem]">
        {value || ' '}
      </span>
      {suffix && <span className="ml-0.5">{suffix}</span>}
    </>
  )
}

// 所見（textarea）。画面=入力 / 印刷=改行保持のブロック
export function FieldArea({
  value,
  onChange,
  editable,
}: {
  value: string
  onChange: (v: string) => void
  editable: boolean
}) {
  return (
    <>
      <textarea
        value={value}
        disabled={!editable}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        className="print:hidden w-full border rounded px-2 py-1 text-sm disabled:bg-slate-100"
      />
      <span className="hidden print:block min-h-[3em] whitespace-pre-wrap">{value || ' '}</span>
    </>
  )
}

// 施設長/調理員の押印枠（入力対象外・画面/印刷共通の静的ボックス）
export function SealBox({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-slate-600">{label}</span>
      <div className="w-16 h-16 border border-slate-500 rounded" />
    </div>
  )
}
