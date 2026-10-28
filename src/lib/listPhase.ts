// 一覧の表示の段階（2026-10-28）。読み直しの間も、いま表示している区分の一覧があれば出したままにする。
//  - first   … その区分の一覧がまだ無い（最初の読み込み・区分を切り替えた直後）→ 今までどおり「読み込み中…」
//  - refresh … その区分の一覧があり、裏で読み直している（ウィンドウに戻った時・変更の通知）→ 一覧を出したまま小さく知らせる
//  - ready   … 読み込みが終わっている
export type ListPhase = 'first' | 'refresh' | 'ready'

export function listPhase(loading: boolean, shownKey: string | null | undefined, currentKey: string): ListPhase {
  if (!loading) return 'ready'
  return shownKey === currentKey ? 'refresh' : 'first'
}
