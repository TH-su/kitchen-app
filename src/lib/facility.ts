// 施設名・帳票の職員名候補をビルド時の環境変数から読む（Vite の import.meta.env）。
//
// 未設定・空文字なら**現行のソース既定値にフォールバック**するため、リポジトリ変数を
// 設定するまで画面・印刷とも挙動は完全に不変。
//
// 設定場所:
//   本番 … GitHub リポジトリの Settings > Secrets and variables > Actions > Variables
//          （deploy.yml が `${{ vars.VITE_* }}` として build 時に注入）
//   ローカル … プロジェクト直下の環境変数ファイル
//
// 書式:
//   VITE_FACILITY_NAME       施設名のみ（「厨房」は付けない）  例: ラウレアハレ
//   VITE_REPORT_INSPECTORS   検食者候補・区切りは , 、 ，       例: 坂本,堤,橋爪
//   VITE_REPORT_COOKS        調理担当者候補（同上）             例: 佐々木,松岡,田嶋
//
// ⚠ VITE_ 変数はビルド時に配信JSへ埋め込まれる（＝公開される）。ソース/gitから氏名を外す効果は
//   あるが、公開バンドルからは読み取れる。真に秘匿するならDB＋RLS経由での取得が必要。

const FALLBACK_INSPECTORS = ['坂本', '堤', '橋爪'] as const
const FALLBACK_COOKS = ['佐々木', '松岡', '田嶋'] as const
const FALLBACK_FACILITY = 'ラウレアハレ'

// 半角/全角カンマ・読点で分割し、空白除去・空要素除去・重複除去。1件も無ければ既定値を返す。
function parseList(raw: string | undefined, fallback: readonly string[]): readonly string[] {
  const items = (raw ?? '')
    .split(/[,、，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length ? Array.from(new Set(items)) : [...fallback]
}

/** 施設名（「厨房」は含まない）。例: ラウレアハレ */
export const FACILITY_NAME: string = (import.meta.env.VITE_FACILITY_NAME ?? '').trim() || FALLBACK_FACILITY

/** 画面・帳票に出す表記。例: ラウレアハレ厨房 */
export const KITCHEN_LABEL = `${FACILITY_NAME}厨房`

/** 検食者の候補（コンボボックスの選択肢） */
export const REPORT_INSPECTORS = parseList(import.meta.env.VITE_REPORT_INSPECTORS, FALLBACK_INSPECTORS)

/** 調理担当者の候補（コンボボックスの選択肢） */
export const REPORT_COOKS = parseList(import.meta.env.VITE_REPORT_COOKS, FALLBACK_COOKS)

// 自動反映で使う既定の担当者＝各リストの先頭（parseList は常に1件以上を返す）。
// 既定値のままなら従来どおり 検食者=坂本 / 調理担当者=佐々木 になり挙動不変。
export const DEFAULT_INSPECTOR: string = REPORT_INSPECTORS[0] ?? FALLBACK_INSPECTORS[0]
export const DEFAULT_COOK: string = REPORT_COOKS[0] ?? FALLBACK_COOKS[0]
