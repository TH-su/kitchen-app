// 献立一覧：読み直しの間も一覧を出したままにする判定（2026-10-28）
import { describe, expect, it } from 'vitest'
import { listPhase } from '../src/lib/listPhase'

describe('listPhase', () => {
  it('最初の読み込み（一覧がまだ無い）は「読み込み中」', () => {
    expect(listPhase(true, undefined, '朝')).toBe('first')
    expect(listPhase(true, undefined, '')).toBe('first')
  })
  it('区分を切り替えた直後（別の区分の一覧しか無い）は「読み込み中」', () => {
    expect(listPhase(true, '朝', '魚')).toBe('first')
  })
  it('同じ区分の読み直し（ウィンドウに戻った時・変更の通知）は一覧を出したまま', () => {
    expect(listPhase(true, '朝', '朝')).toBe('refresh')
  })
  it('読み込みが終われば一覧を出す', () => {
    expect(listPhase(false, '朝', '朝')).toBe('ready')
    expect(listPhase(false, undefined, '朝')).toBe('ready')
  })
})
