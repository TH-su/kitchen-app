// 献立一覧：読み直しの間も一覧を出したままにする判定（2026-10-28）
import { describe, expect, it } from 'vitest'
import { currentItems, listPhase } from '../src/lib/listPhase'

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
    expect(listPhase(false, '', '')).toBe('ready')
  })
})

describe('区分を切り替えた時の読み込みが失敗した時（反証レビューの指摘）', () => {
  it('手元の一覧が別の区分なら stale（カードを出さない）', () => {
    expect(listPhase(false, '朝', '魚')).toBe('stale')
    expect(listPhase(false, undefined, '朝')).toBe('stale')
  })
  it('画面と印刷に出す一覧は、いまの区分のものだけ', () => {
    const data = { cat: '朝', items: [1, 2, 3] }
    expect(currentItems(data, '朝')).toEqual([1, 2, 3])
    expect(currentItems(data, '魚')).toEqual([])
    expect(currentItems(null, '朝')).toEqual([])
  })
})
