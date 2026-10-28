// 日別の画面：保存の後の取り直しのまとめ役が、画面ごとに分かれていること・止まった保存を待ち続けないこと（2026-10-28）
// 検食簿と給食日誌と同じく、1つの画面で useDailyReport を2回呼び、useReloadBatch の同じまとめ役を渡す。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'

const saves: Record<string, Array<{ resolve: () => void }>> = { kenshoku: [], nisshi: [] }
const stuck = new Set<string>()
vi.mock('../src/lib/daily', () => ({
  fetchReportColumn: vi.fn(async () => null),
  saveDailyReport: vi.fn((_date: string, patch: Record<string, unknown>) => {
    const col = Object.keys(patch)[0]
    if (stuck.has(col)) return new Promise<void>(() => {}) // 終わらない保存
    return new Promise<void>((resolve) => saves[col].push({ resolve }))
  }),
}))
vi.mock('../src/lib/staffStore', () => ({
  getMasterAt: () => 0,
  resolveMaster: async () => {},
  subscribe: () => () => {},
  defaults: () => ({}),
}))

import { useDailyReport } from '../src/hooks/useDailyReport'
import { useReloadBatch } from '../src/hooks/useReloadBatch'
import { RELOAD_BATCH_MAX_WAIT_MS } from '../src/lib/reloadBatch'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
// 未保存の離脱の警告（beforeunload）が付け外しする所だけの window（DOM は使わない）
if (!(globalThis as any).window) (globalThis as any).window = { addEventListener() {}, removeEventListener() {} }

type R = { s: { f: string } }
const empty = (): R => ({ s: { f: '' } })
const merge = (b: R, saved: any): R => saved ?? b
const applyAuto = (): R => ({ s: { f: '架空の自動値' } }) // 基底と違う＝書く
const data = { id: 1, menu_date: '2000-01-01' } as any

function Page({ reload }: { reload: () => void }) {
  const afterSave = useReloadBatch()
  const common = { data, editable: true, reload, empty, merge, applyAuto, afterSave }
  useDailyReport<R>({ ...common, column: 'kenshoku' })
  useDailyReport<R>({ ...common, column: 'nisshi' })
  return null
}

const flush = () => act(async () => { for (let i = 0; i < 20; i++) await Promise.resolve() })
const resolveAll = async () => {
  for (const c of ['kenshoku', 'nisshi']) for (const s of saves[c].splice(0)) s.resolve()
  await flush()
}

let roots: ReactTestRenderer[] = []
beforeEach(() => {
  vi.useFakeTimers()
  stuck.clear()
  saves.kenshoku = []
  saves.nisshi = []
  roots = []
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  act(() => { for (const r of roots) r.unmount() })
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const mount = async (reload: () => void) => {
  let r!: ReactTestRenderer
  await act(async () => { r = create(<Page reload={reload} />) })
  roots.push(r)
  await flush()
  return r
}

describe('日別の画面の保存の後の取り直し', () => {
  it('開いた時の検食簿と給食日誌の自動保存の後、取り直しは1回', async () => {
    const reload = vi.fn()
    await mount(reload)
    expect(saves.kenshoku.length + saves.nisshi.length).toBe(2)
    await resolveAll()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('片方の保存が止まっても、15秒で取り直す（待ち続けない）', async () => {
    stuck.add('kenshoku')
    const reload = vi.fn()
    await mount(reload)
    await resolveAll() // 給食日誌だけ終わる
    expect(reload).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(RELOAD_BATCH_MAX_WAIT_MS) })
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('前の画面で止まった保存は、次に開いた画面の取り直しを止めない（画面ごとに分かれている）', async () => {
    stuck.add('kenshoku')
    stuck.add('nisshi')
    const r1 = await mount(vi.fn()) // 2つとも止まったまま
    act(() => r1.unmount())
    roots = roots.filter((r) => r !== r1)
    stuck.clear()
    const reload2 = vi.fn()
    await mount(reload2)
    await resolveAll()
    expect(reload2).toHaveBeenCalledTimes(1) // 15秒を待たずにすぐ
  })
})
