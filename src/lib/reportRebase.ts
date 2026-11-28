// 検食簿・給食日誌の「この画面で触った欄だけを最新に重ねる」純関数（2026-11-28 点検）。
//
// 値の形は { 食事の区分: { 欄: 値 } } の2段（KenshokuRecord / NisshiRecord）。
// cur  = 今の画面の値、base = 画面がその値を作った元（最後に知った DB の値）、next = DB の新しい値。
// ・cur と base が同じ欄（この画面で触っていない欄）は next を使う＝他の端末の保存を取り込む
// ・違う欄（この画面で書いた・消した欄）は cur を残す＝書きかけを潰さない
// 変わる欄が無い時は cur をそのまま返す（React の再描画を起こさない）。

type Rec = Record<string, Record<string, unknown> | undefined>

const same = (a: unknown, b: unknown) => a === b || (a == null && b == null)

export function rebaseReport<T extends Record<string, any>>(cur: T, base: T, next: T): T {
  const c = cur as Rec
  const b = base as Rec
  const n = next as Rec
  const out: Rec = { ...c }
  let changed = false
  for (const sec of Object.keys(n)) {
    const ns = n[sec]
    const cs = c[sec]
    const bs = b[sec]
    if (!ns || typeof ns !== 'object') continue
    if (!cs || typeof cs !== 'object') {
      out[sec] = ns
      changed = true
      continue
    }
    let secOut: Record<string, unknown> | null = null
    for (const f of Object.keys(ns)) {
      const touched = !same(cs[f], bs ? bs[f] : undefined)
      if (touched) continue
      if (same(cs[f], ns[f])) continue
      if (!secOut) secOut = { ...cs }
      secOut[f] = ns[f]
    }
    if (secOut) {
      out[sec] = secOut
      changed = true
    }
  }
  return changed ? (out as T) : cur
}
