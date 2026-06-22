import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// 指定テーブルの変更を購読して onChange を呼ぶ（複数端末同期）。
// ウィンドウ復帰時にも再取得。onChange は ref で最新を保持するため、
// 購読を張り直さずに常に最新のクロージャ（最新の active/id/type）を実行する。
export function useRealtime(tables: string[], onChange: () => void) {
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    const fire = () => cb.current()
    const ch = supabase.channel('rt-' + tables.join('-'))
    for (const t of tables) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, fire)
    }
    ch.subscribe()
    window.addEventListener('focus', fire)
    return () => {
      supabase.removeChannel(ch)
      window.removeEventListener('focus', fire)
    }
    // テーブル一覧が変わったときのみ購読し直す
  }, [tables.join(',')])
}
