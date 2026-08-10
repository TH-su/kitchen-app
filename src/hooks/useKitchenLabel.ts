import { useEffect, useSyncExternalStore } from 'react'
import { getFacilityName, kitchenLabel, resolveFacilityName, subscribeFacility } from '../lib/appSettings'

// 画面・帳票に出す厨房表記（例:「〇〇厨房」）を供給する薄いフック。
//
// 挙動:
//   - appSettings のミニストアを useSyncExternalStore で購読し、施設名が届いた時だけ再レンダーする。
//   - マウント時に resolveFacilityName() をキックする（単一飛行・TTL・失敗時フォールバックは
//     ストア側が担う。例外はストア内で握り潰されるため try/catch は不要）。
//   - 取得前・未適用（0009 未実行）・未登録・失敗のときは env（VITE_FACILITY_NAME）→ 汎用既定値
//     「サンプルホーム厨房」＝ facility.ts の KITCHEN_LABEL と完全に同一の表記になる。
//
// ※ ログイン画面（LoginPage）はログイン前でDBを読めないため、このフックを使わず
//   KITCHEN_LABEL（汎用表記）のままにしている。

export function useKitchenLabel(): string {
  const name = useSyncExternalStore(subscribeFacility, getFacilityName)

  useEffect(() => {
    void resolveFacilityName()
  }, [])

  return kitchenLabel(name)
}
