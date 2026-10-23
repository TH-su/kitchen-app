import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// 自分が会員の施設（1人1施設）。購読を「自分の施設の行」に絞るために使う（2026-10-23・修正点 G30）。
// 削除の通知は RLS を通らずに購読者全員へ届くため、facility_id で絞らないと他施設の削除（主キー）まで届く。
// 絞り込みは削除でも「消す前の行」に当てて判定される（表の replica identity を full にする＝移行 0011）。
// ログインの利用者ごとに1回だけ読む（失敗・0件なら次の購読の時に読み直す）。
let facilityCache: { userId: string; facilityId: Promise<string | null> } | null = null

function myFacilityId(userId: string): Promise<string | null> {
  if (facilityCache && facilityCache.userId === userId) return facilityCache.facilityId
  const facilityId = (async () => {
    const { data, error } = await supabase.from('facility_members').select('facility_id').limit(2)
    if (error || !data || data.length !== 1) return null
    return (data[0] as { facility_id: string }).facility_id
  })()
  facilityCache = { userId, facilityId }
  facilityId.then((id) => { if (id === null && facilityCache?.facilityId === facilityId) facilityCache = null })
  return facilityId
}

// 指定テーブルの変更を購読して onChange を呼ぶ（複数端末同期）。
// ウィンドウ復帰時にも再取得。onChange は ref で最新を保持するため、
// 購読を張り直さずに常に最新のクロージャ（最新の active/id/type）を実行する。
// 施設が分からない時（会員でない・読めない）は変更の購読をせず、ウィンドウ復帰時の再取得だけにする
// （絞らずに購読すると他施設の削除の通知まで受け取るため）。
export function useRealtime(tables: string[], onChange: () => void) {
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    // 連続イベント（多端末の一括更新・cascade 等）を 300ms で1回の reload にまとめる
    let timer: ReturnType<typeof setTimeout> | null = null
    const fire = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => cb.current(), 300)
    }
    let ch: ReturnType<typeof supabase.channel> | null = null
    let closed = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      if (!userId) return
      const fid = await myFacilityId(userId)
      if (closed || !fid) return
      ch = supabase.channel('rt-' + tables.join('-'))
      for (const t of tables) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `facility_id=eq.${fid}` }, fire)
      }
      ch.subscribe()
    })()
    window.addEventListener('focus', fire)
    return () => {
      closed = true
      if (timer) clearTimeout(timer)
      if (ch) supabase.removeChannel(ch)
      window.removeEventListener('focus', fire)
    }
    // テーブル一覧が変わったときのみ購読し直す
  }, [tables.join(',')])
}
