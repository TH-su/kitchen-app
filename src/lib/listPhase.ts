// 一覧の表示の段階（2026-10-28）。読み直しの間も、いま表示している区分の一覧があれば出したままにする。
//  - first   … その区分の一覧がまだ無い（最初の読み込み・区分を切り替えた直後）→ 今までどおり「読み込み中…」
//  - refresh … その区分の一覧があり、裏で読み直している（ウィンドウに戻った時・変更の通知）→ 一覧を出したまま小さく知らせる
//  - ready   … 読み込みが終わり、手元の一覧がいまの区分のもの
//  - stale   … 読み込みは終わったが、手元の一覧が別の区分のもの（区分を切り替えた時の読み込みが失敗した）
//              → カードも印刷も出さない（別の区分のカードを、新しい区分の名前のまま押させない）
export type ListPhase = 'first' | 'refresh' | 'ready' | 'stale'

export function listPhase(loading: boolean, shownKey: string | null | undefined, currentKey: string): ListPhase {
  const same = shownKey === currentKey
  if (!loading) return same ? 'ready' : 'stale'
  return same ? 'refresh' : 'first'
}

// 画面と印刷に出してよい一覧（いまの区分のものだけ）
export function currentItems<T>(data: { cat: string; items: T[] } | null | undefined, currentKey: string): T[] {
  return data && data.cat === currentKey ? data.items : []
}
