// 献立一覧の A4縦印刷: 文字サイズ段階の決定。index.css の .menuset-print[data-density='a'|'b'|'c'] と対になる。
//
// 件数だけで決めると、品名が長いカテゴリで各行が折り返して2枚目へあふれる。逆に折り返しを
// 甘く見ると必要以上に小さい字で刷ってしまう。そこで「折り返し行数 × 行の高さ」で紙面の高さを
// 積み上げ、1枚に収まる中で最大の文字サイズを選ぶ。
//
// 定数はすべて実測で較正した値（推定値ではない）:
//   UNITS_PER_LINE … 印刷CSSと同じ幅(190mm)でレンダリングし、折り返しが始まる文字数を計測
//   CHAR_* … 上記で「/」「空白」の実幅が全角の約1/4だったため区別（全角前提で数えると過大評価になる）
//   AVAIL_PX … ヘッドレス印刷したPDFのページ数を二分探索し、1枚に収まった最大の積み上げ高さ
// 印刷CSS（列幅・余白・line-height・パディング・段階の文字サイズ）を変えたら測り直すこと。
// 検証ハーネス: scratchpad の print/{gen.mjs,run.sh,sweep.sh,probe2.mjs} が本ファイルを直接 import する。

export type PrintDensity = 'a' | 'b' | 'c'

const FONT_PX: Record<PrintDensity, number> = { a: 15, b: 13, c: 11.5 }
// 「献立」列（紙面幅190mmの90% ≒ 645px）に1行で入る文字数（全角=1換算）
const UNITS_PER_LINE: Record<PrintDensity, number> = { a: 42, b: 48, c: 55 }
// 表の行に使える紙面の高さ(px)。段階ごとに列見出しの高さが違うため段階別に持つ
const AVAIL_PX: Record<PrintDensity, number> = { a: 994, b: 1001, c: 1007 }
const LINE_HEIGHT = 1.25 // index.css の .menuset-print td/th と同値
const ROW_EXTRA_PX = 3 // 1行あたりの上下パディング(1px×2)＋罫線(1px)

const CHAR_SEP = 0.25 // 区切りの「 / 」に使う空白とスラッシュの実幅（全角比）
const CHAR_HALF = 0.5 // その他のASCII・半角カナ

// 全角1文字を1とした文字幅の合計
export function textUnits(s: string): number {
  let n = 0
  for (const ch of s) {
    if (ch === ' ' || ch === '/') n += CHAR_SEP
    else if (/[ -~｡-ﾟ]/.test(ch)) n += CHAR_HALF
    else n += 1
  }
  return n
}

// 各行の「献立」文字列から、A4縦1枚に収まる最大の文字サイズ段階を返す。
// どの段階でも収まらなければ最小段階(c)で止め、それ以上は縮めず2枚目へ送る（読めない紙を作らない）。
export function menuPrintDensity(lines: string[]): PrintDensity {
  for (const d of ['a', 'b', 'c'] as const) {
    const lineH = FONT_PX[d] * LINE_HEIGHT
    const used = lines.reduce((sum, s) => {
      const wrapped = Math.max(1, Math.ceil(textUnits(s) / UNITS_PER_LINE[d]))
      return sum + wrapped * lineH + ROW_EXTRA_PX
    }, 0)
    if (used <= AVAIL_PX[d]) return d
  }
  return 'c'
}
