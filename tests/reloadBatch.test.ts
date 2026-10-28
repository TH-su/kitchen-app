// 日別の画面：保存の後の取り直しを1回にまとめる（2026-10-28）
import { describe, expect, it, vi } from 'vitest'
import { createReloadBatch } from '../src/lib/reloadBatch'

describe('createReloadBatch', () => {
  it('同時に走った2つの保存（検食簿・給食日誌）の後の取り直しは1回', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.begin()
    b.begin()
    b.end(reload)
    expect(reload).not.toHaveBeenCalled() // もう1つの保存が終わるまで待つ
    b.end(reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('片方だけ書いた時も、全部の保存が終わった後に1回だけ取り直す', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.begin()
    b.begin()
    b.end(reload)
    b.end(null)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('書かなかった（失敗・変化なし）時は取り直さない', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.begin()
    b.end(null)
    expect(reload).not.toHaveBeenCalled()
  })
  it('保存が1つだけなら、終わった時にすぐ取り直す（手で保存した時と同じ）', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.begin()
    b.end(reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })
  it('時間をおいて走った保存は、それぞれの後に取り直す（前の保存の分を持ち越さない）', () => {
    const b = createReloadBatch()
    const reload = vi.fn()
    b.begin()
    b.end(reload)
    b.begin()
    b.end(null)
    expect(reload).toHaveBeenCalledTimes(1)
    b.begin()
    b.end(reload)
    expect(reload).toHaveBeenCalledTimes(2)
  })
})
