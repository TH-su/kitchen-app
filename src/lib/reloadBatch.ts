// 保存の後の取り直しをまとめる（2026-10-28）。
// 日別の画面を開くと、検食簿と給食日誌の自動保存が同時に走り、それぞれの保存の後に同じ日の献立を
// 取り直していた（同じ取得が2本）。走っている保存が全部終わるまで取り直しを待たせ、最後に1回だけ取り直す。
// 取り直しは全部の保存が終わった後に始まるので、どちらの保存も取りこぼさない
// （走っている取得を使い回す形にしないのは、保存より前に出た取得の答えを返してしまうため）。
export interface ReloadBatch {
  // 保存を始める時に呼ぶ（最初の await より前に呼ぶこと＝同時に始まった保存を数えるため）
  begin(): void
  // 保存が終わった時に必ず呼ぶ（失敗しても finally で）。取り直したい時は reload を渡す
  end(reload: (() => void) | null): void
}

export function createReloadBatch(): ReloadBatch {
  let running = 0
  let queued: (() => void) | null = null
  return {
    begin() {
      running++
    },
    end(reload) {
      if (reload) queued = reload
      running = Math.max(0, running - 1)
      if (running === 0 && queued) {
        const r = queued
        queued = null
        r()
      }
    },
  }
}
