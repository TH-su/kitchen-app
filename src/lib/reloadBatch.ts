// 保存の後の取り直しをまとめる（2026-10-28）。
// 日別の画面を開くと、検食簿と給食日誌の自動保存が同時に走り、それぞれの保存の後に同じ日の献立を
// 取り直していた（同じ取得が2本）。走っている保存が全部終わるまで取り直しを待たせ、最後に1回だけ取り直す。
// 取り直しは全部の保存が終わった後に始まるので、どちらの保存も取りこぼさない
// （走っている取得を使い回す形にしないのは、保存より前に出た取得の答えを返してしまうため）。
//
// 守り（反証レビューの指摘）:
//  - 画面1つごとに作る（useReloadBatch）。アプリ全体で1つにしない＝ほかの画面の止まった保存を待たない
//  - 止まった保存を待ち続けない。始まってから maxWaitMs を過ぎた保存は数えず、待っている取り直しを走らせる
//  - 待っている取り直しは Set で持つ（上書きで落とさない・同じ関数は1回だけ）
export interface ReloadBatch {
  // 保存を始める時に呼ぶ（最初の await より前に呼ぶこと＝同時に始まった保存を数えるため）。返り値は end に渡す
  begin(): number
  // 保存が終わった時に必ず呼ぶ（失敗しても finally で）。取り直したい時は reload を渡す
  end(token: number, reload: (() => void) | null): void
}

export const RELOAD_BATCH_MAX_WAIT_MS = 15_000

export function createReloadBatch(maxWaitMs = RELOAD_BATCH_MAX_WAIT_MS, now: () => number = Date.now): ReloadBatch {
  const live = new Map<number, number>() // 走っている保存 → 始めた時刻
  const queued = new Set<() => void>()
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  // 時間を過ぎた保存は「止まった」とみなして数えない
  const running = () => {
    const t = now()
    for (const [k, s] of live) if (t - s >= maxWaitMs) live.delete(k)
    return live.size
  }
  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  const flush = () => {
    if (queued.size === 0) return clearTimer()
    if (running() > 0) return schedule()
    clearTimer()
    const fs = [...queued]
    queued.clear()
    for (const f of fs) f()
  }
  // 待っている取り直しがあれば、いちばん古い保存が時間を過ぎる時に見直す
  const schedule = () => {
    clearTimer()
    if (queued.size === 0 || live.size === 0) return
    const oldest = Math.min(...live.values())
    timer = setTimeout(flush, Math.max(0, oldest + maxWaitMs - now()))
  }

  return {
    begin() {
      const token = ++seq
      live.set(token, now())
      return token
    },
    end(token, reload) {
      live.delete(token)
      if (reload) queued.add(reload)
      flush()
    },
  }
}
