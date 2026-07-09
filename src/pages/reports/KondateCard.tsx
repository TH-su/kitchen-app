import type { DailyMenuFull } from '../../lib/daily'
import { reiwaDate } from '../../lib/date'
import menuLeft from '../../assets/menu-left.png'
import menuRight from '../../assets/menu-right.png'

const MEAL_LABEL: Record<string, string> = {
  breakfast: '朝食',
  lunch: '昼食',
  dinner: '夕食',
}

// 1日分の「今日の献立」掲示カード（白黒・印刷用 / 上部左右に固定イラスト・A3横1ページ）
export default function KondateCard({ data }: { data: DailyMenuFull }) {
  return (
    <div className="kondate-page font-maru bg-white text-black rounded-[2rem] border-[3px] border-black p-6 sm:p-10">
      {/* ヘッダ: 左右に固定イラスト、中央にタイトル＋日付（日付は自動） */}
      <div className="kondate-head flex items-center justify-between gap-3 mb-8 border-b-[3px] border-black pb-5">
        {/* 左=赤ちゃん(menu-right.png) / 右=三角巾の子(menu-left.png)：元エクセルの配置に合わせる */}
        <img src={menuRight} alt="" aria-hidden decoding="async" className="h-28 sm:h-40 w-auto select-none" />
        <div className="text-center flex-1">
          <h2 className="text-4xl sm:text-6xl font-bold tracking-wider">今日の献立</h2>
          <p className="text-lg sm:text-2xl mt-2">{reiwaDate(data.menu_date)}</p>
        </div>
        <img src={menuLeft} alt="" aria-hidden decoding="async" className="h-28 sm:h-40 w-auto select-none" />
      </div>

      <div className="kondate-meals grid grid-cols-1 sm:grid-cols-3 gap-5">
        {data.meals.map((m) => (
          <div key={m.key} className="bg-white rounded-2xl border-2 border-black overflow-hidden">
            <div className="text-2xl font-bold py-3 text-center bg-gray-100 border-b-2 border-black">
              {MEAL_LABEL[m.key] ?? m.label}
            </div>
            <div className="kondate-mealbody p-5 text-center min-h-[9rem]">
              {m.slots.length === 0 ? (
                <p className="text-gray-300 text-xl">—</p>
              ) : (
                m.slots.map((s) => (
                  <p key={s.slot} className="text-2xl sm:text-3xl leading-relaxed py-1.5">
                    {s.name}
                  </p>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      {data.snack && (
        <div className="kondate-snack mt-8 flex justify-center">
          <div className="inline-flex items-center gap-4 rounded-full px-8 py-4 border-2 border-black">
            <span className="text-2xl font-bold">★おやつ★</span>
            <span className="text-2xl sm:text-3xl font-bold">{data.snack.name}</span>
          </div>
        </div>
      )}
    </div>
  )
}
