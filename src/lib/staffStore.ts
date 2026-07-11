// 候補（検食者/調理担当者）と在籍者数の読み取り専用ミニストア。
//
// フレームワーク非依存（React に依存しない）。useSyncExternalStore から
// subscribe/getSnapshot 経由で購読され、GAS からの取得結果を集約する。
//
// PII 非残留規約（wsClient と同じ・ここでの保持は必要最小限に限る）:
//   - 保持するのは職員名の配列（rosterNames）と数値2つ（counts）だけ。
//   - 労務情報（rules/empCode/employment/status 等）は wsClient 側で取得直後に
//     縮約済みで、このストアには到達しない。console 出力も行わない。
//
// フォールバック不変条件:
//   未接続・取得失敗・取得前は candidates() が facility.ts の env 既定値のみを返し、
//   現行（静的リスト）と完全に同一の候補・並びになる（rosterStatus==='ok' のときだけ後置連結）。

import { readSyncConfig, fetchRosterNames, fetchResidentCounts } from './wsClient'
import { REPORT_INSPECTORS, REPORT_COOKS } from './facility'

/** 名簿取得の状態。ok のときだけ候補へ名簿名を後置連結する。 */
export type RosterStatus = 'idle' | 'pending' | 'ok' | 'fallback'

/** 外部ストアのスナップショット（getSnapshot の戻り値・同一性を保つ）。 */
export type StaffStoreState = {
  rosterStatus: RosterStatus
  rosterNames: string[] | null
  rosterAt: number
  counts: { residents: number; hospitalized: number } | null
  countsAt: number
}

const ROSTER_TTL_MS = 30 * 60 * 1000 // 30分
const COUNTS_TTL_MS = 10 * 60 * 1000 // 10分

// 現在のスナップショット。変更時のみ差し替え、同一性を保つ（無限再レンダー防止）。
let state: StaffStoreState = {
  rosterStatus: 'idle',
  rosterNames: null,
  rosterAt: 0,
  counts: null,
  countsAt: 0,
}

const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

// 浅い比較で実変化のあるときだけ state を差し替えて通知する。
function setState(patch: Partial<StaffStoreState>): void {
  const next: StaffStoreState = { ...state, ...patch }
  if (
    next.rosterStatus === state.rosterStatus &&
    next.rosterNames === state.rosterNames &&
    next.rosterAt === state.rosterAt &&
    next.counts === state.counts &&
    next.countsAt === state.countsAt
  ) {
    return
  }
  state = next
  emit()
}

/** useSyncExternalStore 用: リスナ登録。戻り値で解除。 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** useSyncExternalStore 用: 現在のスナップショット（同一性保持）。 */
export function getSnapshot(): StaffStoreState {
  return state
}

function dedupe(names: string[]): string[] {
  return Array.from(new Set(names))
}

// ---- 名簿（roster）取得: 単一飛行 + TTL 30分 ----

let rosterInFlight: Promise<void> | null = null

async function doResolveRoster(): Promise<void> {
  try {
    // 未接続はネットワークに出ず即 fallback 確定（pending を挟まない）。
    if (!readSyncConfig()) {
      setState({ rosterStatus: 'fallback', rosterNames: null, rosterAt: Date.now() })
      return
    }
    setState({ rosterStatus: 'pending' })
    const names = await fetchRosterNames()
    if (names) {
      // 取得成功（空配列でも成功扱い）。candidates() が非空判定するため空でも安全。
      setState({ rosterStatus: 'ok', rosterNames: names, rosterAt: Date.now() })
    } else {
      // null = 失敗/未設定 → fallback 確定。
      setState({ rosterStatus: 'fallback', rosterNames: null, rosterAt: Date.now() })
    }
  } catch {
    // 例外は外へ漏らさず fallback 確定（現行挙動へ退避）。
    setState({ rosterStatus: 'fallback', rosterNames: null, rosterAt: Date.now() })
  } finally {
    rosterInFlight = null
  }
}

function runRoster(force: boolean): Promise<void> {
  if (rosterInFlight) return rosterInFlight
  const now = Date.now()
  if (!force && state.rosterAt !== 0 && now - state.rosterAt < ROSTER_TTL_MS) {
    return Promise.resolve()
  }
  rosterInFlight = doResolveRoster()
  return rosterInFlight
}

/** 名簿を取得（単一飛行・TTL 30分）。例外は漏らさない。 */
export function resolveRoster(): Promise<void> {
  return runRoster(false)
}

// ---- 在籍者数（counts）取得: 単一飛行 + TTL 10分 ----

let countsInFlight: Promise<void> | null = null

async function doResolveCounts(): Promise<void> {
  try {
    // 未接続は取得試行せず、TTL だけ更新（再取得の連打を防ぐ）。
    if (!readSyncConfig()) {
      setState({ countsAt: Date.now() })
      return
    }
    const result = await fetchResidentCounts()
    if (result) {
      setState({ counts: result, countsAt: Date.now() })
    } else {
      // 失敗時は既存 counts をそのまま残し、TTL のみ更新（安全側フォールバック）。
      setState({ countsAt: Date.now() })
    }
  } catch {
    setState({ countsAt: Date.now() })
  } finally {
    countsInFlight = null
  }
}

function runCounts(force: boolean): Promise<void> {
  if (countsInFlight) return countsInFlight
  const now = Date.now()
  if (!force && state.countsAt !== 0 && now - state.countsAt < COUNTS_TTL_MS) {
    return Promise.resolve()
  }
  countsInFlight = doResolveCounts()
  return countsInFlight
}

/** 在籍者数を取得（単一飛行・TTL 10分）。例外は漏らさない。 */
export function resolveCounts(): Promise<void> {
  return runCounts(false)
}

/** TTL を無視して名簿・在籍者数を再取得（設定ページの手動更新用）。 */
export function refreshNow(): Promise<void> {
  return Promise.all([runRoster(true), runCounts(true)]).then(() => undefined)
}

/**
 * コンボボックスの候補。
 * facility.ts の env 既定値を先頭に、rosterStatus==='ok' かつ名簿が非空のときだけ
 * 名簿名を後置連結して重複除去する。fallback/pending/idle 時は env のみ＝現行と完全同一。
 */
export function candidates(): { inspectors: string[]; cooks: string[] } {
  const inspectors = [...REPORT_INSPECTORS]
  const cooks = [...REPORT_COOKS]
  if (state.rosterStatus === 'ok' && state.rosterNames && state.rosterNames.length > 0) {
    return {
      inspectors: dedupe([...inspectors, ...state.rosterNames]),
      cooks: dedupe([...cooks, ...state.rosterNames]),
    }
  }
  return { inspectors, cooks }
}
