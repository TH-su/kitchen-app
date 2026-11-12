// 作業指示書の選択欄：番号の末尾の数字の順に並べる（2026-11-12 本人指示）
import { describe, expect, it } from 'vitest'
import { byMenuNumber, menuCodeNumber } from '../src/lib/menuOrder'

describe('menuCodeNumber', () => {
  it('丸数字・半角・全角の数字を読む', () => {
    expect(menuCodeNumber('朝①')).toBe(1)
    expect(menuCodeNumber('朝⑳')).toBe(20)
    expect(menuCodeNumber('魚㉑')).toBe(21)
    expect(menuCodeNumber('魚㉟')).toBe(35)
    expect(menuCodeNumber('魚㊱')).toBe(36)
    expect(menuCodeNumber('朝㊿')).toBe(50)
    expect(menuCodeNumber('朝51')).toBe(51)
    expect(menuCodeNumber('朝５２')).toBe(52)
    expect(menuCodeNumber('朝 103 ')).toBe(103)
    expect(menuCodeNumber('行事')).toBeNull()
    expect(menuCodeNumber('')).toBeNull()
  })
})

describe('byMenuNumber', () => {
  it('後から足した番号（並び順が空）も数字の順に入る', () => {
    const items = [
      { id: 90, code: '朝53', seq_no: null },
      { id: 91, code: '朝51', seq_no: null },
      { id: 3, code: '朝③', seq_no: 3 },
      { id: 50, code: '朝㊿', seq_no: 50 },
      { id: 92, code: '朝５２', seq_no: null },
      { id: 1, code: '朝①', seq_no: 1 },
      { id: 93, code: '朝の特別', seq_no: null },
    ]
    expect([...items].sort(byMenuNumber).map((i) => i.code)).toEqual([
      '朝①', '朝③', '朝㊿', '朝51', '朝５２', '朝53', '朝の特別',
    ])
  })
  it('数字の無い番号は並び順、それも無ければ登録順', () => {
    const items = [
      { id: 5, code: '行事B', seq_no: null },
      { id: 4, code: '行事A', seq_no: null },
      { id: 6, code: '行事C', seq_no: 2 },
    ]
    expect([...items].sort(byMenuNumber).map((i) => i.code)).toEqual(['行事C', '行事A', '行事B'])
  })
})
