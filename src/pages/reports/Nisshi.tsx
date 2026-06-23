import type { ReportProps } from './types'

const B = 'border border-slate-400'

// 給食日誌（予定人数=食数を自動表示。中心温度・残食・担当者・実施人数は印刷後に記入）
export default function Nisshi({ data }: ReportProps) {
  if (!data) return <p className="text-slate-500">この日の献立は未設定です。</p>
  return (
    <div className="text-base">
      <div className="flex items-end justify-between mb-2 border-b-2 border-slate-700 pb-1">
        <h2 className="text-2xl font-bold">給食日誌</h2>
        <div>
          <span className="mr-4">{data.menu_date}</span>
          <span className="font-bold">予定 {data.meal_count} 人</span>
        </div>
      </div>
      <div className="flex justify-end mb-2 print:hidden">
        <button onClick={() => window.print()} className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px]">
          印刷
        </button>
      </div>

      {data.meals.map((m) => (
        <table key={m.key} className="w-full border-collapse mb-3 break-inside-avoid">
          <tbody>
            <tr className="bg-slate-100">
              <th className={`${B} px-2 py-1 text-left w-24`}>{m.label}</th>
              <th className={`${B} px-2 py-1 text-left`}>献立名</th>
              <th className={`${B} px-2 py-1 w-40`}>中心温度</th>
              <th className={`${B} px-2 py-1 w-28`}>残食</th>
            </tr>
            <tr>
              <td className={`${B} px-2 py-1 align-top text-sm`}>調理担当<br />（　　　）</td>
              <td className={`${B} px-2 py-1`}>{m.slots.length ? m.slots.map((s) => s.name).join('／') : '未設定'}</td>
              <td className={`${B} px-2 py-1 text-sm`}>主菜 ＿＿℃<br />副菜 ＿＿℃</td>
              <td className={`${B} px-2 py-1`}>＿＿ g</td>
            </tr>
            <tr>
              <td className={`${B} px-2 py-1 text-sm`} colSpan={2}>
                検食者（　　　）　出来上り　＿：＿　特別食（　　　）
              </td>
              <td className={`${B} px-2 py-1 text-sm`} colSpan={2}>
                予定 {data.meal_count} 人 ／ 実施 ＿＿ 人
              </td>
            </tr>
          </tbody>
        </table>
      ))}

      {data.snack && (
        <table className="w-full border-collapse mb-3 break-inside-avoid">
          <tbody>
            <tr className="bg-amber-50">
              <th className={`${B} px-2 py-1 text-left w-24`}>おやつ</th>
              <td className={`${B} px-2 py-1`}>{data.snack.name}</td>
              <td className={`${B} px-2 py-1 text-sm w-64`}>残食 1F 多・少・無　2F 多・少・無</td>
            </tr>
          </tbody>
        </table>
      )}
      <p className="text-sm text-slate-500 print:hidden">※ 中心温度・残食・担当者・実施人数は印刷後に記入します。</p>
    </div>
  )
}
