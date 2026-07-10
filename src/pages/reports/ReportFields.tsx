// 検食簿・給食日誌 共通のデュアルレンダー部品。
// 画面=入力コントロール / 印刷=紙様式どおりの確定値（選択は丸＋太字・未入力は空欄）。
// 全て Tailwind の print: ユーティリティで完結＝index.css は変更しない。
import { useEffect, useId, useRef, useState } from 'react'
import sealHashizume from '../../assets/seal-hashizume.png'

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

// プルダウン。画面=<select> / 印刷=確定値（FieldInput と同じ下線スパン）。既定値は空値ファクトリで種付け済み
export function SelectField({
  value,
  onChange,
  editable,
  options,
  width = 'w-40',
}: {
  value: string
  onChange: (v: string) => void
  editable: boolean
  options: readonly string[]
  width?: string
}) {
  return (
    <>
      <select
        value={value}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value)}
        className={`print:hidden border rounded px-2 py-1 text-base ${width} disabled:bg-slate-100`}
      >
        {!options.includes(value) && <option value={value}>{value || '（未選択）'}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <span className="hidden print:inline-block align-bottom border-b border-black text-center px-1 min-w-[3rem]">
        {value || ' '}
      </span>
    </>
  )
}

// 職員名など「プルダウン候補＋自由記載」を両立する欄（検食者/調理担当者/記録者）。
// 画面=text入力＋▼トグル＋常時全候補の listbox。datalist と違い入力値で候補を絞り込まない
// （＝一度入力してもプルダウンが失われない）。候補外の名前は input へ自由記載できる。
// 印刷=SelectField と同一の確定値スパン。※確定値スパンは print:hidden ラッパの「兄弟」に置くこと
//   （内側に入れると印刷で値ごと消える）。外形幅は width のまま＝表のセル幅・折返しは不変。
export function ComboField({
  value,
  onChange,
  editable,
  options,
  width = 'w-40',
}: {
  value: string
  onChange: (v: string) => void
  editable: boolean
  options: readonly string[]
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const listId = useId()

  // 外側クリック/タップで閉じる（open 中のみ購読）
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDocPointerDown)
    return () => document.removeEventListener('pointerdown', onDocPointerDown)
  }, [open])

  return (
    <>
      <span
        ref={rootRef}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false)
        }}
        className={`print:hidden relative inline-block ${width}`}
      >
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="none"
          value={value}
          disabled={!editable}
          onChange={(e) => onChange(e.target.value)} // 自由記載＝候補外の値もそのまま保持
          className="w-full border rounded pl-2 pr-7 py-1 text-base disabled:bg-slate-100"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="候補一覧を開く"
          disabled={!editable}
          onMouseDown={(e) => e.preventDefault()} // blur→閉じ→クリック不発を防止
          onClick={() => setOpen((o) => !o)}
          className="absolute inset-y-0 right-0 w-7 inline-flex items-center justify-center text-slate-500 disabled:opacity-40"
        >
          ▾
        </button>
        {open && editable && (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 top-full z-20 mt-0.5 w-full min-w-max max-h-56 overflow-auto bg-white border border-slate-300 rounded shadow-lg"
          >
            {options.map((o) => (
              <li key={o} role="option" aria-selected={o === value}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(o)
                    setOpen(false)
                  }}
                  className={`w-full text-left px-3 min-h-[40px] inline-flex items-center text-base hover:bg-emerald-50 ${
                    o === value ? 'bg-emerald-100 font-medium' : ''
                  }`}
                >
                  {o}
                </button>
              </li>
            ))}
          </ul>
        )}
      </span>
      <span className="hidden print:inline-block align-bottom border-b border-black text-center px-1 min-w-[3rem]">
        {value || ' '}
      </span>
    </>
  )
}

// 連動値の表示専用欄（検食簿 朝夕の検食者＝調理担当者に連動）。入力・プルダウンを持たない。
// 画面=入力不可と分かる薄グレー枠（外形は ComboField の入力と同寸＝レイアウト不変）。
// 印刷=ComboField と同一の確定値スパン＝印刷物は従来と完全同一。
// ※渡す値は必ず保存済みの inspector（cook を書き戻さない＝過去記録を改変しない）。
export function MirrorField({ value, width = 'w-40' }: { value: string; width?: string }) {
  return (
    <>
      <span
        title={value || undefined}
        className={`print:hidden inline-block border border-slate-200 rounded px-2 py-1 text-base bg-slate-50 text-slate-600 truncate ${width}`}
      >
        {value || '—'}
      </span>
      <span className="hidden print:inline-block align-bottom border-b border-black text-center px-1 min-w-[3rem]">
        {value || ' '}
      </span>
    </>
  )
}

// 所見: ワンクリック定型文ボタン（押下で追記・重複ガード）＋「その他」自由記載（FieldArea）
const NOTE_PRESETS = [
  'ちょうどよい味でした。',
  '具材は食べやすいサイズでした。',
  '温かい状態での提供でした。',
  '問題なし。',
  '気になる点なし。',
] as const

export function NoteField({
  value,
  onChange,
  editable,
}: {
  value: string
  onChange: (v: string) => void
  editable: boolean
}) {
  const append = (t: string) => onChange(value.includes(t) ? value : `${value}${t}`)
  return (
    <>
      {editable && (
        <div className="flex flex-wrap gap-1 mb-1 print:hidden">
          {NOTE_PRESETS.map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => append(p)}
              className="rounded border border-slate-300 bg-white text-slate-700 px-2 min-h-[36px] text-xs hover:bg-slate-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {editable && <span className="text-xs text-slate-500 print:hidden">その他</span>}
      <FieldArea value={value} onChange={onChange} editable={editable} />
    </>
  )
}

// 施設長/調理員の押印枠。stamped かつ src があれば印影画像を表示（時刻計算で stamped を渡す）。画面/印刷共通。
// ※印影PNG受領後: ここで import して SealBox の src 既定へ設定すると、stamped の枠に自動表示される。
export function SealBox({ label, stamped = false, src = sealHashizume }: { label: string; stamped?: boolean; src?: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-xs text-slate-600">{label}</span>
      <div className="w-16 h-16 border border-slate-500 rounded flex items-center justify-center overflow-hidden">
        {stamped && src && <img src={src} alt="" aria-hidden decoding="async" className="w-14 h-14 object-contain select-none" />}
      </div>
    </div>
  )
}
