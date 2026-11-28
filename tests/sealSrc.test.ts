// 押印枠の画像の選び方: DB → env（VITE_SEAL_URL）→ 空。CSP が通さない出どころは飛ばし、注意は1度だけ・値は出さない（2026-11-28）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/lib/supabase', () => ({ supabase: {} }))

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const OWN = 'https://example-test.supabase.co/storage/v1/object/public/x/seal.png'
const OTHER = 'https://other-project.supabase.co/storage/v1/object/public/x/seal.png'

async function load(envSeal: string) {
  vi.resetModules()
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example-test.supabase.co')
  vi.stubEnv('VITE_SEAL_URL', envSeal)
  return (await import('../src/lib/appSettings')).sealSrc
}

let warns: string[]
beforeEach(() => {
  warns = []
  vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => void warns.push(a.join(' ')))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('sealSrc', () => {
  it('DB の値が使えればそれ、無ければ env、どちらも無ければ空（注意は出さない）', async () => {
    let sealSrc = await load(OWN)
    expect(sealSrc(PNG)).toBe(PNG)
    expect(sealSrc(null)).toBe(OWN)
    sealSrc = await load('')
    expect(sealSrc(null)).toBe('')
    expect(warns).toHaveLength(0)
  })
  it('DB の値が使えない出どころなら env へ進み、注意は1度だけで値を含まない', async () => {
    const sealSrc = await load(PNG)
    expect(sealSrc(OTHER)).toBe(PNG)
    expect(sealSrc(OTHER)).toBe(PNG)
    expect(warns).toHaveLength(1)
    expect(warns[0]).not.toContain('other-project')
  })
  it('DB も env も使えない出どころなら空（枠だけ）', async () => {
    const sealSrc = await load(OTHER)
    expect(sealSrc('https://drive.google.com/uc?id=x')).toBe('')
  })
})
