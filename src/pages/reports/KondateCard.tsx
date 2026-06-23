import { dailyNutrition, type DailyMenuFull } from '../../lib/daily'
import { NutritionFooter } from '../../components/NutritionBar'

const WD = ['日', '月', '火', '水', '木', '金', '土']

// 'YYYY-MM-DD' → 令和8年6月26日（金）
function reiwaDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const wd = WD[dt.getDay()]
  const r = y - 2018 // 令和元年 = 2019
  if (r < 1) return `${y}年${m}月${d}日（${wd}）` // 令和以前は西暦表示
  return `令和${r === 1 ? '元' : r}年${m}月${d}日（${wd}）`
}

const MEAL_STYLE: Record<string, { head: string; emoji: string }> = {
  breakfast: { head: 'bg-amber-100 text-amber-800', emoji: '🌅' },
  lunch: { head: 'bg-emerald-100 text-emerald-800', emoji: '🍱' },
  dinner: { head: 'bg-indigo-100 text-indigo-800', emoji: '🌙' },
}

// 1日分の「今日の献立」掲示カード（柔らかいデザイン・A3横1ページ）
export default function KondateCard({ data }: { data: DailyMenuFull }) {
  return (
    <div className="kondate-page font-maru bg-[#fffaf0] text-slate-700 rounded-[2rem] border-2 border-amber-200 shadow-sm p-6 sm:p-10">
      <div className="flex items-center justify-between mb-8">
        <div className="text-5xl select-none" aria-hidden>
          🍚
        </div>
        <div className="text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-amber-800 tracking-wider">今日の献立</h2>
          <p className="text-lg sm:text-xl text-slate-500 mt-2">{reiwaDate(data.menu_date)}</p>
        </div>
        <div className="text-5xl select-none" aria-hidden>
          🧑‍🍳
        </div>
      </div>

      <div className="kondate-meals grid grid-cols-1 sm:grid-cols-3 gap-5">
        {data.meals.map((m) => {
          const st = MEAL_STYLE[m.key] ?? MEAL_STYLE.lunch
          return (
            <div key={m.key} className="bg-white rounded-3xl border border-amber-100 shadow-sm overflow-hidden">
              <div className={`text-2xl font-bold py-3 text-center ${st.head}`}>
                <span className="mr-1">{st.emoji}</span>
                {m.label}
              </div>
              <div className="p-5 text-center min-h-[9rem]">
                {m.slots.length === 0 ? (
                  <p className="text-slate-300 text-xl">—</p>
                ) : (
                  m.slots.map((s) => (
                    <p key={s.slot} className="text-2xl sm:text-3xl leading-relaxed py-1.5">
                      {s.name}
                    </p>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {data.snack && (
        <div className="mt-8 flex justify-center">
          <div className="inline-flex items-center gap-3 bg-amber-100 text-amber-800 rounded-full px-8 py-4 border border-amber-200">
            <span className="text-2xl font-bold">🍩 ★おやつ★</span>
            <span className="text-2xl sm:text-3xl font-bold">{data.snack.name}</span>
          </div>
        </div>
      )}

      <NutritionFooter nut={dailyNutrition(data)} />
    </div>
  )
}
