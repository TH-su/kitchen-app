// アプリ設定（app_settings）の読み取り。現在は施設名（key='facility_name'）のみ。
//
// 【なぜDBから読むか】
//   VITE_FACILITY_NAME はビルド時に公開バンドルへ埋め込まれて配信される（2026-08-10 実測）。
//   施設を特定できる情報のため、氏名（0007 report_staff）と同じくログイン必須のDB（0009・RLS は
//   read も authenticated 限定）へ移した。
//
// 【フォールバック不変条件】
//   マイグレーション 0009 未適用・未ログイン・通信失敗は「例外」ではなく null（＝設定なし）として扱い、
//   呼び出し側を env（VITE_FACILITY_NAME）→ 汎用既定値「サンプルホーム」へ落とす
//   （staffMaster.ts と同じ方針。DBが無くても画面は壊れない）。
//
// フレームワーク非依存（React に依存しない）。取得結果は module スコープに1つだけ保持し、
// useSyncExternalStore（hooks/useKitchenLabel.ts）から購読する＝ログイン後に届いた施設名で
// ヘッダ・帳票の表記が差し替わる。
import { supabase } from './supabase'
import { KITCHEN_LABEL } from './facility'

/** 施設名の設定キー（app_settings.key） */
const FACILITY_KEY = 'facility_name'

const TTL_MS = 30 * 60 * 1000 // 取得成功時の再取得間隔。30分（施設名はほぼ不変のため長め）
const RETRY_MS = 60 * 1000 // 未取得（未適用・未登録・未ログイン・失敗）時の再挑戦間隔。60秒

/** テーブル未作成（0009 未適用）を表すエラーか。42P01=undefined_table / PGRST205=スキーマキャッシュに無い */
export function isMissingSettingsTable(e: any): boolean {
  if (!e) return false
  const code = String(e.code ?? '')
  const msg = `${e.message ?? ''} ${e.details ?? ''}`
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || /app_settings/i.test(msg)
}

/**
 * 設定値を1件取得。未作成テーブル・未登録キー・空文字はすべて null（＝設定なし）。
 * それ以外のエラー（権限・通信）は throw し、呼び出し側（resolveFacilityName）が握り潰す。
 */
export async function fetchAppSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle()
  if (error) {
    if (isMissingSettingsTable(error)) return null
    throw error
  }
  const value = String(data?.value ?? '').trim()
  return value || null
}

/** 施設名（「厨房」は含まない）。未設定なら null。 */
export function fetchFacilityName(): Promise<string | null> {
  return fetchAppSetting(FACILITY_KEY)
}

// ---- ミニストア（DB由来の施設名を1つだけ保持・単一飛行 + TTL 30分） ----

let dbFacilityName: string | null = null // DB 由来の施設名（未取得・未設定は null）
let nextFetchAt = 0 // これ以降に再取得を許す時刻（成功=+TTL_MS / 未取得=+RETRY_MS）
let inFlight: Promise<void> | null = null
const listeners = new Set<() => void>()

/** useSyncExternalStore 用: リスナ登録。戻り値で解除。 */
export function subscribeFacility(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** useSyncExternalStore 用: 現在の施設名（プリミティブなので同一性の心配は無い）。 */
export function getFacilityName(): string | null {
  return dbFacilityName
}

/**
 * 画面・帳票に出す表記。DB由来 > env（VITE_FACILITY_NAME）> 汎用既定値「サンプルホーム」。
 * 引数はスナップショット（getFacilityName の戻り値）を渡す＝React 側で購読した値と必ず一致する。
 */
export function kitchenLabel(name: string | null): string {
  return name ? `${name}厨房` : KITCHEN_LABEL
}

/**
 * 施設名を取得（単一飛行 + 再取得間隔）。例外は漏らさず、失敗時は既存値を保持する（表記を消さない）。
 * 未取得のときの再挑戦を60秒に留める＝ログイン前に呼ばれても、ログイン後の再マウントで取り直せる。
 */
export function resolveFacilityName(): Promise<void> {
  if (inFlight) return inFlight
  if (Date.now() < nextFetchAt) return Promise.resolve()
  inFlight = (async () => {
    try {
      const name = await fetchFacilityName()
      nextFetchAt = Date.now() + (name ? TTL_MS : RETRY_MS)
      if (name !== dbFacilityName) {
        dbFacilityName = name
        for (const listener of listeners) listener()
      }
    } catch {
      // 権限・通信エラーは env フォールバックのまま（施設名は console へ出さない）。
      nextFetchAt = Date.now() + RETRY_MS
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}
