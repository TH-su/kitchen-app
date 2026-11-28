// 画面の中で移る前（日付の◀▶・← 一覧・上のタブ）に、保存していない入力があるかを確かめる（2026-11-28 点検 中4）。
// 入力を持つ部品が「未保存か」を返す関数を登録し、移る側は confirmLeave() を通す。
// ページを閉じる・読み込み直す時の確かめ（beforeunload）は各部品が今までどおり持つ。
type Source = () => boolean
const sources = new Set<Source>()

export const LEAVE_MSG = '保存していない入力があります。移ると、この入力は消えます。移りますか？'

export function registerUnsaved(fn: Source): () => void {
  sources.add(fn)
  return () => {
    sources.delete(fn)
  }
}

export function hasUnsaved(): boolean {
  for (const fn of sources) {
    try {
      if (fn()) return true
    } catch {
      // 確かめに失敗した部品は「未保存なし」とみなさず、確かめる側に倒す
      return true
    }
  }
  return false
}

/** 移ってよい時は true。未保存がある時だけ確かめる */
export function confirmLeave(ask: (msg: string) => boolean = (m) => window.confirm(m)): boolean {
  if (!hasUnsaved()) return true
  return ask(LEAVE_MSG)
}
