import type { ReportProps } from './types'

const B = 'border border-slate-400'

function MealForm({ label, dishes }: { label: string; dishes: string }) {
  const row = (k: string, v: string) => (
    <tr>
      <td className={`${B} px-2 py-1 w-28 bg-slate-50`}>{k}</td>
      <td className={`${B} px-2 py-1`}>{v}</td>
    </tr>
  )
  return (
    <table className="w-full border-collapse mb-3 break-inside-avoid">
      <tbody>
        <tr className="bg-slate-100">
          <th className={`${B} px-2 py-1 text-left`} colSpan={2}>
            {label}
          </th>
        </tr>
        {row('献立', dishes || '未設定')}
        {row('味', 'ちょうどよい　・　薄い　・　濃い')}
        {row('分量', 'よい　・　多い　・　少ない')}
        {row('鮮度', '特によい　・　良い　・　悪い')}
        {row('温度', 'ちょうどよい　・　熱い　・　冷たい')}
        {row('盛り付け', '特によい　・　よい　・　悪い')}
        {row('異物・異臭', 'なし　・　あり（　　　　　　　　　　）')}
        {row('検食者 / 時刻', '　　　　　　　　　　　：　　')}
        <tr>
          <td className={`${B} px-2 py-1 bg-slate-50`}>所見</td>
          <td className={`${B} px-2 py-3`}>&nbsp;</td>
        </tr>
      </tbody>
    </table>
  )
}

// 検食簿（記入欄は印刷後に手書き）
export default function Kenshoku({ data }: ReportProps) {
  if (!data) return <p className="text-slate-500">この日の献立は未設定です。</p>
  const dishesOf = (key: string) => {
    const m = data.meals.find((x) => x.key === key)
    return m ? m.slots.map((s) => s.name).join('　') : ''
  }
  return (
    <div className="text-base">
      <div className="flex items-end justify-between mb-2 border-b-2 border-slate-700 pb-1">
        <h2 className="text-2xl font-bold">検食簿</h2>
        <span>{data.menu_date}　天候（　　　）</span>
      </div>
      <div className="flex justify-end mb-2 print:hidden">
        <button onClick={() => window.print()} className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px]">
          印刷
        </button>
      </div>
      <MealForm label="朝食" dishes={dishesOf('breakfast')} />
      <MealForm label="昼食" dishes={dishesOf('lunch')} />
      <MealForm label="夕食" dishes={dishesOf('dinner')} />
      {data.snack && <MealForm label="間食" dishes={data.snack.name} />}
    </div>
  )
}
