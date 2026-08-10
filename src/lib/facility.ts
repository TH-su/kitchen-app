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
//   VITE_FACILITY_NAME       施設名のみ（「厨房」は付けない）  例: サンプルホーム
//   VITE_REPORT_INSPECTORS   検食者候補・区切りは , 、 ，       例: 検食者A,検食者B
//   VITE_REPORT_COOKS        調理担当者候補（同上）             例: 調理A,調理B
//   VITE_SEAL_URL            施設長印の画像URL（未設定なら押印枠は空欄＝手押し運用）
//
// ⚠ VITE_ 変数はビルド時に配信JSへ埋め込まれる（＝公開される）。ソース/gitから氏名を外す効果は
//   あるが、公開バンドルからは読み取れる。真に秘匿するならDB＋RLS経由での取得が必要。
//   2026-08-10: 配信中の dist/assets/index-*.js に職員6名の実名と施設名が実際に含まれることを実測で確認。
//   これを受けて氏名・施設名の供給元をDB（ログイン必須・RLS authenticated 限定）へ移した:
//     職員名 … report_staff（0007）→ lib/staffMaster.ts → staffStore.candidates()/defaults()
//     施設名 … app_settings.facility_name（0009）→ lib/appSettings.ts → hooks/useKitchenLabel()
//   運用: GitHub Actions Variables から VITE_REPORT_INSPECTORS / VITE_REPORT_COOKS を削除する
//   （施設名 VITE_FACILITY_NAME も削除可。ログイン画面だけは DB を読めないため汎用表記になる）。
//   本ファイルの env は**互換のためのフォールバック**として残す＝DB未適用でも画面は壊れない。
//
// フォールバックは「実名を含まない汎用プレースホルダ」。自施設で使う場合は上記 Variables に
// 実際の施設名・職員名を設定する（設定済みならフォールバックは一切使われず挙動不変）。

const FALLBACK_INSPECTORS = ['検食者A', '検食者B'] as const
const FALLBACK_COOKS = ['調理A', '調理B'] as const
const FALLBACK_FACILITY = 'サンプルホーム'

// 半角/全角カンマ・読点で分割し、空白除去・空要素除去・重複除去。1件も無ければ既定値を返す。
function parseList(raw: string | undefined, fallback: readonly string[]): readonly string[] {
  const items = (raw ?? '')
    .split(/[,、，]/)
    .map((s) => s.trim())
    .filter(Boolean)
  return items.length ? Array.from(new Set(items)) : [...fallback]
}

/** 施設名（「厨房」は含まない）。例: サンプルホーム */
export const FACILITY_NAME: string = (import.meta.env.VITE_FACILITY_NAME ?? '').trim() || FALLBACK_FACILITY

/** 画面・帳票に出す表記。例: サンプルホーム厨房 */
export const KITCHEN_LABEL = `${FACILITY_NAME}厨房`

/** 検食者の候補（コンボボックスの選択肢） */
export const REPORT_INSPECTORS = parseList(import.meta.env.VITE_REPORT_INSPECTORS, FALLBACK_INSPECTORS)

/** 調理担当者の候補（コンボボックスの選択肢） */
export const REPORT_COOKS = parseList(import.meta.env.VITE_REPORT_COOKS, FALLBACK_COOKS)

// 自動反映で使う既定の担当者の env フォールバック（実際の供給元は職員マスタ＝staffStore.defaults()）。
// ★候補リスト（REPORT_*）と違い、Variables 未設定時は**空文字**にする。プレースホルダ（検食者A /
//   調理A）を帳票の記録として書き込まないため（reports.ts の fillEmpty は空文字なら欄を空のまま残す）。
//   コンボの選択肢はプレースホルダのままで、選択肢が空になることはない。
export const DEFAULT_INSPECTOR: string = parseList(import.meta.env.VITE_REPORT_INSPECTORS, [])[0] ?? ''
export const DEFAULT_COOK: string = parseList(import.meta.env.VITE_REPORT_COOKS, [])[0] ?? ''

// 施設長印の画像URL。実名入りの印影をリポジトリへ同梱すると、公開バンドルへ base64 で
// 埋め込まれて配信されるため、ソースには一切持たせない（2026-08-10 に同梱PNGを削除）。
// 未設定なら押印枠は空欄のまま印字される＝従来どおり枠の大きさ・位置は不変で、手押しで運用できる。
export const SEAL_URL: string = (import.meta.env.VITE_SEAL_URL ?? '').trim()
