// 連携設定：新しい保存先の読み取り口（kitchen-read）を先に読み、読めない時だけ GAS へ戻る（2026-11-07 代表者の決定「Aで進めて」）
// 通信は全部偽物・架空データだけ。本物の URL・合言葉は使わない。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 厨房アプリのデータベースの共通の設定（app_settings）の偽物
const shared = vi.hoisted(() => ({ values: new Map<string, string>(), fail: false, calls: 0 }))
vi.mock('../src/lib/appSettings', () => ({
  fetchAppSetting: async (key: string) => {
    shared.calls++
    if (shared.fail) throw new Error('offline')
    return shared.values.has(key) ? shared.values.get(key)! : null
  },
}))

import {
  _resetSharedKitchenReadForTest,
  ensureSharedKitchenRead,
  readDeviceKitchenReadConfig,
  usesSharedKitchenRead,
  fetchResidentCounts,
  fetchRosterNames,
  getLastReadFrom,
  hasReadSource,
  pingKitchenRead,
  readKitchenReadConfig,
  saveKitchenReadConfig,
} from '../src/lib/wsClient'

const READ_URL = 'https://example-test.supabase.co/functions/v1/kitchen-read'
const READ_KEY = 'k'.repeat(40)
const GAS_URL = 'https://script.google.com/macros/s/EXAMPLE/exec'

// 端末の保存（localStorage）の偽物
let store: Map<string, string>
function fakeStorage() {
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size
    },
  }
}

type Reply = { status?: number; body?: unknown; throws?: boolean }
let calls: { url: string; body: Record<string, unknown>; init: RequestInit }[]
let replies: { read: Record<string, Reply>; gas: Record<string, Reply> }
let warns: string[]

function respond(r: Reply | undefined): Response {
  if (!r) return new Response('{}', { status: 500 })
  if (r.throws) throw new TypeError('network')
  return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200 })
}

beforeEach(() => {
  shared.values = new Map()
  shared.fail = false
  shared.calls = 0
  _resetSharedKitchenReadForTest()
  store = new Map()
  calls = []
  warns = []
  replies = {
    read: {
      ping: { body: { ok: true } },
      counts: { body: { ok: true, residents: 31, hospitalized: 2 } },
      names: { body: { ok: true, names: ['見本 職員一', '見本 職員二'] } },
    },
    gas: {
      get: { body: { ok: true, data: { residents: [{ name: '見本 甲' }, { name: '見本 乙', hospitalized: true }, { name: '見本 丙', movedOut: true }] } } },
      pull: { body: { ok: true, entries: { staff: { data: [{ name: '見本 古い職員' }] } } } },
    },
  }
  vi.stubGlobal('localStorage', fakeStorage())
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      calls.push({ url, body, init })
      if (url === READ_URL) return respond(replies.read[String(body.action)])
      if (url === GAS_URL) return respond(replies.gas[String(body.action)])
      return new Response('{}', { status: 404 })
    })
  )
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => {
    warns.push(a.map(String).join(' '))
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function setGas() {
  store.set('kitchen_ws_sync_v1', JSON.stringify({ endpoint: GAS_URL, token: '架空の合言葉' }))
}
function setRead() {
  expect(saveKitchenReadConfig(READ_URL, READ_KEY)).toEqual({ ok: true })
}
const readCalls = () => calls.filter((c) => c.url === READ_URL)
const gasCalls = () => calls.filter((c) => c.url === GAS_URL)

describe('読み取り口の設定', () => {
  it('URL と合言葉は自前のキー kitchen_su_read_v1 にだけ保存する（su_sync_common には書かない）', () => {
    setRead()
    expect([...store.keys()]).toEqual(['kitchen_su_read_v1'])
    expect(readKitchenReadConfig()).toEqual({ url: READ_URL, key: READ_KEY })
    expect(hasReadSource()).toBe(true)
  })
  it('形が違う URL・短い合言葉・片方だけは保存しない', () => {
    for (const [u, k] of [
      ['https://script.google.com/macros/s/x/exec', READ_KEY],
      ['http://example-test.supabase.co/functions/v1/kitchen-read', READ_KEY],
      ['https://example-test.supabase.co/functions/v1/clinic-read', READ_KEY],
      ['https://example-test.supabase.co/functions/v1/kitchen-read?x=1', READ_KEY],
      [READ_URL, 'short'],
      [READ_URL, ''],
      ['', READ_KEY],
    ]) {
      const r = saveKitchenReadConfig(u, k)
      expect(r.ok, u + ' / ' + k.length).toBe(false)
    }
    expect(store.size).toBe(0)
    expect(hasReadSource()).toBe(false)
  })
  it('両方とも空で保存すると外す', () => {
    setRead()
    expect(saveKitchenReadConfig('', '')).toEqual({ ok: true })
    expect(store.has('kitchen_su_read_v1')).toBe(false)
    expect(readKitchenReadConfig()).toBeNull()
  })
  it('壊れた保存は読まない（例外を外へ出さない）', () => {
    store.set('kitchen_su_read_v1', '{壊れ')
    expect(readKitchenReadConfig()).toBeNull()
    store.set('kitchen_su_read_v1', JSON.stringify({ url: READ_URL, key: 'short' }))
    expect(readKitchenReadConfig()).toBeNull()
  })
})

describe('在籍者数（fetchResidentCounts）', () => {
  it('読み取り口が読めた時は GAS を呼ばない・数字2つだけを返す', async () => {
    setGas()
    setRead()
    replies.read.counts = { body: { ok: true, residents: 31, hospitalized: 2, extra: '見本 甲' } }
    expect(await fetchResidentCounts()).toEqual({ residents: 31, hospitalized: 2 })
    expect(gasCalls()).toHaveLength(0)
    expect(readCalls()).toHaveLength(1)
    expect(readCalls()[0].body).toEqual({ action: 'counts', kitchenKey: READ_KEY })
    expect((readCalls()[0].init.headers as Record<string, string>)['Content-Type']).toBe('text/plain;charset=UTF-8')
    expect(getLastReadFrom().counts).toBe('kitchen-read')
  })
  it('GAS の設定が無くても読み取り口だけで読める', async () => {
    setRead()
    expect(await fetchResidentCounts()).toEqual({ residents: 31, hospitalized: 2 })
    expect(gasCalls()).toHaveLength(0)
  })
  for (const [label, reply] of [
    ['切り替える前（409）', { status: 409, body: { ok: false, code: 'shadow' } }],
    ['合言葉が違う（401）', { status: 401, body: { ok: false, code: 'key' } }],
    ['設定がまだ（503）', { status: 503, body: { ok: false, code: 'notset' } }],
    ['通信の失敗', { throws: true }],
    ['ok が無い', { body: { residents: 2, hospitalized: 1 } }],
    ['数が文字', { body: { ok: true, residents: '31', hospitalized: 2 } }],
    ['数が負', { body: { ok: true, residents: -1, hospitalized: 0 } }],
    ['数が小数', { body: { ok: true, residents: 1.5, hospitalized: 0 } }],
    ['入院が在籍より多い', { body: { ok: true, residents: 1, hospitalized: 2 } }],
  ] as [string, Reply][]) {
    it(`${label}の時は今までどおり GAS から読む`, async () => {
      setGas()
      setRead()
      replies.read.counts = reply
      expect(await fetchResidentCounts()).toEqual({ residents: 2, hospitalized: 1 })
      expect(readCalls()).toHaveLength(1)
      expect(gasCalls()).toHaveLength(1)
      expect(gasCalls()[0].body).toMatchObject({ action: 'get', key: 'care_schedule_v2' })
      expect(gasCalls()[0].body.kitchenKey).toBeUndefined()
      expect(getLastReadFrom().counts).toBe('gas')
    })
  }
  it('読み取り口が無い時は GAS だけ（今までと同じ）', async () => {
    setGas()
    expect(await fetchResidentCounts()).toEqual({ residents: 2, hospitalized: 1 })
    expect(readCalls()).toHaveLength(0)
  })
  it('どちらも読めない時は null', async () => {
    setRead()
    replies.read.counts = { status: 409, body: { ok: false } }
    expect(await fetchResidentCounts()).toBeNull()
  })
})

describe('職員の氏名（fetchRosterNames）', () => {
  it('読み取り口が読めた時は GAS を呼ばない・氏名だけ（空白・空・重複を除く）', async () => {
    setGas()
    setRead()
    replies.read.names = { body: { ok: true, names: [' 見本 職員一 ', '見本 職員二', '見本 職員一', ''], empCode: 'E1' } }
    expect(await fetchRosterNames()).toEqual(['見本 職員一', '見本 職員二'])
    expect(gasCalls()).toHaveLength(0)
    expect(readCalls()[0].body).toEqual({ action: 'names', kitchenKey: READ_KEY })
    expect(getLastReadFrom().roster).toBe('kitchen-read')
  })
  it('在籍の職員がいない（空の一覧）も読めたとする', async () => {
    setGas()
    setRead()
    replies.read.names = { body: { ok: true, names: [] } }
    expect(await fetchRosterNames()).toEqual([])
    expect(gasCalls()).toHaveLength(0)
  })
  for (const [label, reply] of [
    ['切り替える前（409）', { status: 409, body: { ok: false, code: 'shadow' } }],
    ['通信の失敗', { throws: true }],
    ['氏名が配列でない', { body: { ok: true, names: '見本' } }],
    ['氏名に文字でない物', { body: { ok: true, names: ['見本 職員一', { name: '見本' }] } }],
  ] as [string, Reply][]) {
    it(`${label}の時は今までどおり GAS から読む`, async () => {
      setGas()
      setRead()
      replies.read.names = reply
      expect(await fetchRosterNames()).toEqual(['見本 古い職員'])
      expect(gasCalls()).toHaveLength(1)
      expect(gasCalls()[0].body).toMatchObject({ action: 'pull', keys: ['staff'] })
      expect(getLastReadFrom().roster).toBe('gas')
    })
  }
})

describe('接続テスト・記録', () => {
  it('ping は合言葉が合えば OK、断られれば NG', async () => {
    setRead()
    expect(await pingKitchenRead()).toBe(true)
    replies.read.ping = { status: 401, body: { ok: false } }
    expect(await pingKitchenRead()).toBe(false)
    store.clear()
    expect(await pingKitchenRead()).toBe(false)
  })
  it('console に合言葉・URL・氏名・数を出さない', async () => {
    setGas()
    setRead()
    replies.read.counts = { status: 503, body: { ok: false, residents: 99 } }
    replies.read.names = { body: { ok: true, names: ['見本 職員一', 1] } }
    await fetchResidentCounts()
    await fetchRosterNames()
    replies.read.counts = { throws: true }
    await fetchResidentCounts()
    const all = warns.join('\n')
    expect(warns.length).toBeGreaterThan(0)
    expect(all).not.toContain(READ_KEY)
    expect(all).not.toContain('supabase.co')
    expect(all).not.toContain('見本')
    expect(all).not.toContain('99')
  })
  it('読んだ氏名・数を端末の保存に残さない（保存されるのは設定だけ）', async () => {
    setGas()
    setRead()
    await fetchResidentCounts()
    await fetchRosterNames()
    expect([...store.keys()].sort()).toEqual(['kitchen_su_read_v1', 'kitchen_ws_sync_v1'])
    expect([...store.values()].join('')).not.toContain('見本 職員')
  })
})

describe('全端末で共通の設定（app_settings）', () => {
  function setShared(url = READ_URL, key = READ_KEY) {
    shared.values.set('kitchen_read_url', url)
    shared.values.set('kitchen_read_key', key)
  }
  it('端末に何も入れていなくても、共通の設定があれば読み取り口から読み、GAS を呼ばない', async () => {
    setShared()
    expect(await fetchResidentCounts()).toEqual({ residents: 31, hospitalized: 2 })
    expect(await fetchRosterNames()).toEqual(['見本 職員一', '見本 職員二'])
    expect(readCalls().every((c) => c.body.kitchenKey === READ_KEY)).toBe(true)
    expect(gasCalls()).toHaveLength(0)
    expect(usesSharedKitchenRead()).toBe(true)
    expect(hasReadSource()).toBe(true)
  })
  it('共通の設定の値は端末（localStorage）に書かない・入力欄用の値にも出さない', async () => {
    setShared()
    await fetchResidentCounts()
    expect([...store.keys()]).toEqual([])
    expect(readDeviceKitchenReadConfig()).toBeNull()
  })
  it('端末に入れた値が共通の設定より先', async () => {
    setShared(READ_URL, 'z'.repeat(40))
    setRead()
    await fetchResidentCounts()
    expect(readCalls()[0].body.kitchenKey).toBe(READ_KEY)
    expect(usesSharedKitchenRead()).toBe(false)
  })
  it('形が違う共通の設定（短い合言葉・違う住所）は使わず、今までどおり GAS から読む', async () => {
    for (const [u, k] of [
      [READ_URL, 'short'],
      ['https://script.google.com/macros/s/x/exec', READ_KEY],
    ]) {
      _resetSharedKitchenReadForTest()
      calls = []
      shared.values = new Map([
        ['kitchen_read_url', u],
        ['kitchen_read_key', k],
      ])
      setGas()
      expect(await fetchResidentCounts()).toEqual({ residents: 2, hospitalized: 1 })
      expect(readCalls()).toHaveLength(0)
    }
  })
  it('共通の設定を読めない時（未ログイン・通信の失敗）は例外を出さず、GAS から読む', async () => {
    shared.fail = true
    setGas()
    expect(await fetchResidentCounts()).toEqual({ residents: 2, hospitalized: 1 })
    expect(readCalls()).toHaveLength(0)
  })
  it('一度読めた共通の設定は、後で読めなくなっても残す（通信の失敗で Google へ戻さない）', async () => {
    setShared()
    await ensureSharedKitchenRead(true)
    shared.fail = true
    await ensureSharedKitchenRead(true)
    expect(usesSharedKitchenRead()).toBe(true)
  })
  it('共通の設定は30分の間は読み直さない（毎回データベースへ行かない）', async () => {
    setShared()
    await fetchResidentCounts()
    await fetchRosterNames()
    await fetchResidentCounts()
    expect(shared.calls).toBe(2) // URL と合言葉の2つを1回だけ
  })
})
