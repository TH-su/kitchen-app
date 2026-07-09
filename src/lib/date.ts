// 和暦の日付表記（検食簿/給食日誌/献立掲示で共用）。
const WD = ['日', '月', '火', '水', '木', '金', '土']

// 'YYYY-MM-DD' → 令和8年6月26日（金）。令和以前は西暦表示。
export function reiwaDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const wd = WD[dt.getDay()]
  const r = y - 2018 // 令和元年 = 2019
  if (r < 1) return `${y}年${m}月${d}日（${wd}）`
  return `令和${r === 1 ? '元' : r}年${m}月${d}日（${wd}）`
}

// 端末ローカル日付 'YYYY-MM-DD'（現地据置タブレット＝JST前提。UTC/toISOString は日境界がずれるため使わない）
export function todayStr(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// 端末ローカル時刻 'HH:MM'（自動反映のしきい値比較用）
export function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
