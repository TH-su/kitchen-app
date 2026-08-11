import { useEffect, useSyncExternalStore } from 'react'
import { getSealImage, resolveSealImage, sealSrc, subscribeSeal } from '../lib/appSettings'

// 押印枠に出す施設長印の画像を供給する薄いフック（useKitchenLabel と同じ作り）。
//
// 挙動:
//   - appSettings のミニストアを useSyncExternalStore で購読し、印影が届いた時だけ再レンダーする。
//   - マウント時に resolveSealImage() をキックする（単一飛行・再取得間隔・失敗時の値保持は
//     ストア側が担う。例外はストア内で握り潰されるため try/catch は不要）。
//   - 取得前・未適用（0009 未実行）・未登録・失敗のときは env（VITE_SEAL_URL）→ 空文字。
//     空なら SealBox は枠だけを印字する＝枠の寸法・位置は不変で、手押しで運用できる。
//
// ※ 実名の印影PNGをリポジトリへ同梱しないのは、Vite のインライン閾値（4KB）を下回るサイズだと
//   base64 で公開バンドルへ焼き込まれ、ログイン無しで取得できてしまうため（2026-08-10 実測）。

export function useSealSrc(): string {
  const image = useSyncExternalStore(subscribeSeal, getSealImage)

  useEffect(() => {
    void resolveSealImage()
  }, [])

  return sealSrc(image)
}
