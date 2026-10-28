// 日別の画面：保存の後の取り直しを1回にまとめる（2026-10-28）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReloadBatch, RELOAD_BATCH_MAX_WAIT_MS } from '../src/lib/reloadBatch'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('createReloadBatch', () => {
  it('同時に走った2つの保存（検食簿・給食日誌）の後の取り直しは1回', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    const t1 = b.begin()
    const t2 = b.begin()
    b.end(t1, reload)
    expect(reload).not.toHaveBeenCalled() // もう1つの保存が終わるまで待つ
    b.end(t2, reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('片方だけ書いた時も、全部の保存が終わった後に1回だけ取り直す', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    const t1 = b.begin()
    const t2 = b.begin()
    b.end(t1, reload)
    b.end(t2, null)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('書かなかった（失敗・変化なし）時は取り直さない', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.end(b.begin(), null)
    vi.advanceTimersByTime(RELOAD_BATCH_MAX_WAIT_MS * 2)
    expect(reload).not.toHaveBeenCalled()
  })
  it('時間をおいて走った保存は、それぞれの後に取り直す', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.end(b.begin(), reload)
    b.end(b.begin(), null)
    expect(reload).toHaveBeenCalledTimes(1)
    b.end(b.begin(), reload)
    expect(reload).toHaveBeenCalledTimes(2)
  })
  it('違う取り直しを待たせても、上書きで落とさない（両方1回ずつ）', () => {
    const b = createReloadBatch()
    const r1 = vi.fn()
    const r2 = vi.fn()
    const t1 = b.begin()
    const t2 = b.begin()
    const t3 = b.begin()
    b.end(t1, r1)
    b.end(t2, r2)
    b.end(t3, r1)
    expect(r1).toHaveBeenCalledTimes(1)
    expect(r2).toHaveBeenCalledTimes(1)
  })
  it('止まった保存を待ち続けない（始まってから15秒で、待っている取り直しを走らせる）', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.begin() // 終わらない保存
    b.end(b.begin(), reload)
    vi.advanceTimersByTime(RELOAD_BATCH_MAX_WAIT_MS - 1)
    expect(reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('止まった保存があっても、15秒を過ぎた後の保存はすぐ取り直す', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.begin() // 終わらない保存
    vi.advanceTimersByTime(RELOAD_BATCH_MAX_WAIT_MS)
    b.end(b.begin(), reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
