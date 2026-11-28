// 施設長印の出どころと読み取り口の住所を、公開版の CSP と同じ範囲に絞る（2026-11-28）。住所は架空。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectedKitchenReadUrl, isAllowedKitchenReadUrl, isAllowedSealSrc, supabaseOrigin } from '../src/lib/allowedHosts'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

beforeEach(() => vi.stubEnv('VITE_SUPABASE_URL', 'https://example-test.supabase.co/'))
afterEach(() => vi.unstubAllEnvs())

describe('この画面の Supabase', () => {
  it('末尾の / があっても origin にそろえる', () => {
    expect(supabaseOrigin()).toBe('https://example-test.supabase.co')
    expect(expectedKitchenReadUrl()).toBe('https://example-test.supabase.co/functions/v1/kitchen-read')
  })
  it('大文字・ポート・道筋・前後の空白があっても同じ origin にそろえる', () => {
    for (const v of ['https://EXAMPLE-TEST.supabase.co', ' https://example-test.supabase.co:443/rest/v1/ ']) {
      vi.stubEnv('VITE_SUPABASE_URL', v)
      expect(supabaseOrigin(), v).toBe('https://example-test.supabase.co')
      expect(isAllowedKitchenReadUrl('https://example-test.supabase.co/functions/v1/kitchen-read')).toBe(true)
    }
  })
  it('設定が無い・http・壊れている時は null', () => {
    for (const v of ['', 'http://example-test.supabase.co', 'not a url']) {
      vi.stubEnv('VITE_SUPABASE_URL', v)
      expect(supabaseOrigin(), v).toBeNull()
      expect(isAllowedKitchenReadUrl('https://example-test.supabase.co/functions/v1/kitchen-read')).toBe(false)
    }
  })
})

describe('施設長印の出どころ', () => {
  it('data URL の画像と、同じ Supabase の https の画像は通す', () => {
    expect(isAllowedSealSrc(PNG)).toBe(true)
    expect(isAllowedSealSrc('https://example-test.supabase.co/storage/v1/object/public/x/seal.png')).toBe(true)
  })
  it('別の住所・http・画像でない data URL・空は断る', () => {
    for (const s of [
      'https://other-project.supabase.co/storage/v1/object/public/x/seal.png',
      'https://drive.google.com/uc?id=x',
      'http://example-test.supabase.co/seal.png',
      'data:text/html;base64,PGgxPng8L2gxPg==',
      'javascript:alert(1)',
      '',
      '   ',
    ]) {
      expect(isAllowedSealSrc(s), s).toBe(false)
    }
  })
  it('設定が無い時は URL を断るが、data URL の画像は通す', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    expect(isAllowedSealSrc('https://example-test.supabase.co/seal.png')).toBe(false)
    expect(isAllowedSealSrc(PNG)).toBe(true)
  })
})
