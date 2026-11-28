// 検食簿・給食日誌：開いたままの端末の保存が、他の端末の保存を古い値で上書きしないこと（2026-11-28 点検 高1）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { rebaseReport } from '../src/lib/reportRebase'

let dbValue: any = null
const written: any[] = []
let holdAuto: { release: () => void } | null = null
vi.mock('../src/lib/daily', () => ({
  fetchReportColumn: vi.fn(async () => (dbValue == null ? null : JSON.parse(JSON.stringify(dbValue)))),
  saveDailyReport: vi.fn(async (_d: string, patch: Record<string, unknown>) => {
    if (holdAuto) await new Promise<void>((r) => (holdAuto!.release = r))
    const v = Object.values(patch)[0]
    written.push(JSON.parse(JSON.stringify(v)))
    dbValue = JSON.parse(JSON.stringify(v))
  }),
}))
vi.mock('../src/lib/staffStore', () => ({
  getMasterAt: () => 0,
  resolveMaster: async () => {},
  subscribe: () => () => {},
  defaults: () => ({}),
}))

import { useDailyReport } from '../src/hooks/useDailyReport'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
if (!(globalThis as any).window) (globalThis as any).window = { addEventListener() {}, removeEventListener() {} }

type R = { lunch: { note: string; time: string }; dinner: { note: string; time: string } }
const empty = (): R => ({ lunch: { note: '', time: '' }, dinner: { note: '', time: '' } })
const merge = (b: R, saved: any): R =>
  saved ? { lunch: { ...b.lunch, ...saved.lunch }, dinner: { ...b.dinner, ...saved.dinner } } : b
let autoOn = false // 入れた時だけ、空の昼食の時刻に架空の自動値を入れる（自動保存が書く）
const applyAuto = (saved: R): R => (autoOn && saved.lunch.time === '' ? { ...saved, lunch: { ...saved.lunch, time: '07:50' } } : saved)

let hook: ReturnType<typeof useDailyReport<R>>
function Page({ data }: { data: any }) {
  hook = useDailyReport<R>({ data, editable: true, reload: () => {}, column: 'kenshoku', empty, merge, applyAuto })
  return null
}
const flush = () => act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve() })

let root: ReactTestRenderer
beforeEach(() => {
  vi.useFakeTimers()
  written.length = 0
  holdAuto = null
  autoOn = false
  dbValue = { lunch: { note: '', time: '' }, dinner: { note: '', time: '' } }
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  act(() => root?.unmount())
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const mount = async () => {
  const data = { id: 1, menu_date: '2000-01-01', kenshoku: JSON.parse(JSON.stringify(dbValue)) }
  await act(async () => { root = create(<Page data={data} />) })
  await flush()
  return data
}

describe('rebaseReport', () => {
  it('触っていない欄は新しい値、触った欄は画面の値', () => {
    const base = empty()
    const cur = { ...empty(), dinner: { note: '架空の夕食の所見', time: '' } }
    const next = { ...empty(), lunch: { note: '架空の昼食の所見', time: '12:30' } }
    expect(rebaseReport(cur, base, next)).toEqual({
      lunch: { note: '架空の昼食の所見', time: '12:30' },
      dinner: { note: '架空の夕食の所見', time: '' },
    })
  })
  it('画面で消した欄は消したまま（新しい値で戻さない）', () => {
    const base = { ...empty(), lunch: { note: '前の所見', time: '' } }
    const cur = empty()
    expect(rebaseReport(cur, base, base).lunch.note).toBe('')
  })
  it('変わる欄が無ければ同じものを返す', () => {
    const cur = empty()
    expect(rebaseReport(cur, empty(), empty())).toBe(cur)
  })
})

describe('開いたままの端末の手動保存', () => {
  it('他の端末が保存した昼食の欄を、夕食だけ書いた端末の保存で消さない', async () => {
    await mount()
    // 他の端末が昼食を保存（DB だけが新しくなる。この端末の画面は古いまま）
    dbValue = { lunch: { note: '架空の昼食の所見', time: '12:30' }, dinner: { note: '', time: '' } }
    act(() => hook.setV((c) => ({ ...c, dinner: { ...c.dinner, note: '架空の夕食の所見' } })))
    await act(async () => { await hook.save() })
    await flush()
    const last = written[written.length - 1]
    expect(last.lunch).toEqual({ note: '架空の昼食の所見', time: '12:30' })
    expect(last.dinner.note).toBe('架空の夕食の所見')
    expect(hook.v.lunch.note).toBe('架空の昼食の所見')
    expect(hook.dirty).toBe(false)
  })

  it('自動保存が他の端末の値を読んでも、触っていない画面は「未保存」にならず値が寄る', async () => {
    await mount()
    dbValue = { lunch: { note: '架空の昼食の所見', time: '12:30' }, dinner: { note: '', time: '' } }
    await act(async () => { vi.advanceTimersByTime(60_000) })
    await flush()
    expect(hook.dirty).toBe(false)
    expect(hook.v.lunch.note).toBe('架空の昼食の所見')
  })

  it('自動保存の最中に押した保存は、終わるのを待って保存する（黙って無視しない）', async () => {
    autoOn = true
    holdAuto = { release: () => {} } // 開いた時の自動保存を書く所で止める
    await mount()
    act(() => hook.setV((c) => ({ ...c, dinner: { ...c.dinner, note: '架空の夕食の所見' } })))
    let done = false
    let p!: Promise<void>
    act(() => { p = hook.save().then(() => { done = true }) })
    await flush()
    expect(done).toBe(false) // 自動保存を待っている
    const rel = holdAuto!.release
    holdAuto = null
    await act(async () => { rel(); await p })
    await flush()
    expect(done).toBe(true)
    const last = written[written.length - 1]
    expect(last.dinner.note).toBe('架空の夕食の所見')
    expect(last.lunch.time).toBe('07:50') // 自動保存の値も消さない
    expect(hook.saveError).toBe(null)
  })
})
