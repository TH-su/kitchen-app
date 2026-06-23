import type { ReportProps } from './types'

// 今日の献立（掲示用・大きめ表示）
export default function Kondate({ data }: ReportProps) {
  if (!data) return <p className="text-slate-500">この日の献立は未設定です。</p>
  const [bf, ln, dn] = data.meals
  return (
    <div className="text-center">
      <div className="flex justify-end mb-2 print:hidden">
        <button onClick={() => window.print()} className="bg-emerald-600 text-white text-sm rounded px-4 min-h-[40px]">
          印刷
        </button>
      </div>
      <h2 className="text-3xl font-bold mb-1">今日の献立</h2>
      <p className="text-lg mb-4">{data.menu_date}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[bf, ln, dn].map((m) => (
          <div key={m.key} className="border-2 border-slate-400 rounded overflow-hidden">
            <div className="text-xl font-bold bg-slate-100 p-2">{m.label}</div>
            <div className="p-3">
              {m.slots.length === 0 ? (
                <p className="text-slate-400">未設定</p>
              ) : (
                m.slots.map((s) => (
                  <p key={s.slot} className="text-2xl py-1">
                    {s.name}
                  </p>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      {data.snack && (
        <div className="mt-4 inline-block border-2 border-amber-300 rounded px-4 py-3">
          <span className="text-xl font-bold text-amber-700 mr-3">★おやつ★</span>
          <span className="text-2xl">{data.snack.name}</span>
        </div>
      )}
    </div>
  )
}
