// 献立の番号（例: 朝⑤ / 魚㉒ / 朝51 / 朝５１）の末尾の数字を取り出す。
// 作業指示書などの選択欄を「番号の数字の順」に並べるために使う（2026-11-12 本人指示）。
// 後から足したメニューは「並び順（seq_no）」が空のことがあり、seq_no だけでは順不同になっていた。

function circledValue(ch: string): number | null {
  const c = ch.codePointAt(0) ?? 0
  if (c >= 0x2460 && c <= 0x2473) return c - 0x2460 + 1 // ①〜⑳
  if (c >= 0x3251 && c <= 0x325f) return c - 0x3251 + 21 // ㉑〜㉟
  if (c >= 0x32b1 && c <= 0x32bf) return c - 0x32b1 + 36 // ㊱〜㊿
  return null
}

/** 番号の末尾の数字。丸数字1字・半角/全角の数字の並びに対応。無ければ null */
export function menuCodeNumber(code: string | null | undefined): number | null {
  const s = (code ?? '').trim()
  if (!s) return null
  const last = [...s].pop() as string
  const circ = circledValue(last)
  if (circ != null) return circ
  const half = s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
  const m = half.match(/(\d+)$/)
  return m ? Number(m[1]) : null
}

type Orderable = { id: number; code: string; seq_no: number | null }

/** 番号の数字 → 並び順（seq_no） → 登録順（id） の順で並べる比較関数 */
export function byMenuNumber(a: Orderable, b: Orderable): number {
  const na = menuCodeNumber(a.code) ?? a.seq_no ?? 1e9
  const nb = menuCodeNumber(b.code) ?? b.seq_no ?? 1e9
  if (na !== nb) return na - nb
  const sa = a.seq_no ?? 1e9
  const sb = b.seq_no ?? 1e9
  if (sa !== sb) return sa - sb
  return a.id - b.id
}
