// 画面の中で移る前の確かめ（2026-11-28 点検 中4）
import { describe, expect, it } from 'vitest'
import { confirmLeave, hasUnsaved, registerUnsaved } from '../src/lib/unsavedGuard'

describe('unsavedGuard', () => {
  it('未保存が無ければ聞かずに移る', () => {
    let asked = 0
    expect(confirmLeave(() => (asked++, false))).toBe(true)
    expect(asked).toBe(0)
  })
  it('未保存があれば聞き、答えに従う。外した後は聞かない', () => {
    let dirty = true
    const off = registerUnsaved(() => dirty)
    expect(hasUnsaved()).toBe(true)
    expect(confirmLeave(() => false)).toBe(false)
    expect(confirmLeave(() => true)).toBe(true)
    dirty = false
    expect(confirmLeave(() => false)).toBe(true)
    dirty = true
    off()
    expect(hasUnsaved()).toBe(false)
  })
  it('確かめに失敗した部品は未保存とみなす', () => {
    const off = registerUnsaved(() => {
      throw new Error('x')
    })
    expect(hasUnsaved()).toBe(true)
    off()
  })
})
