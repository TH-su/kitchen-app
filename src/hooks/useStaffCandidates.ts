import { useEffect, useSyncExternalStore } from 'react'
import { candidates, getSnapshot, resolveRoster, subscribe } from '../lib/staffStore'

// 帳票コンボの職員候補（検食者/調理担当者）をシフト由来の名簿で拡張して供給する薄いフック。
//
// 挙動:
//   - staffStore を useSyncExternalStore で購読し、名簿の取得状態が変わったときのみ再レンダーする。
//     snapshot はストア側でオブジェクト同一性を保つ（変更時のみ差し替え）ため無限再レンダーを起こさない。
//   - マウント時に resolveRoster() をキックする（単一飛行・TTL・失敗時 fallback の確定はストア側が担う。
//     例外はストア内で握り潰されるため、ここでの try/catch は不要）。
//   - 表示する候補は candidates() から得る。未接続・取得前・失敗（fallback/pending/idle）のときは
//     env の既定リストのみ＝現行と完全に同一で、名簿は status==='ok' かつ非空のときだけ後置される。

/** 名簿の取得状態（staffStore の snapshot 由来。ハードコードせずストアの型に追従させる）。 */
export type RosterStatus = ReturnType<typeof getSnapshot>['rosterStatus']

export type StaffCandidates = {
  inspectors: string[]
  cooks: string[]
  status: RosterStatus
}

export function useStaffCandidates(): StaffCandidates {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)

  // 取得は副作用として1度だけ促す（重複呼び出しはストアの単一飛行で吸収される）。
  useEffect(() => {
    void resolveRoster()
  }, [])

  const { inspectors, cooks } = candidates()
  return { inspectors, cooks, status: snapshot.rosterStatus }
}
