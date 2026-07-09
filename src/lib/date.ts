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
