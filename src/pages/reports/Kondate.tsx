import KondateCard from './KondateCard'
import type { ReportProps } from './types'

// 今日の献立（単日サブタブ）— 共有の KondateCard を表示
export default function Kondate({ data }: ReportProps) {
  if (!data) return <p className="text-slate-500">この日の献立は未設定です。</p>
  return (
    <div>
      <div className="flex justify-end mb-2 print:hidden">
        <button onClick={() => window.print()} className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px]">
          印刷（A3横）
        </button>
      </div>
      <KondateCard data={data} />
    </div>
  )
}
