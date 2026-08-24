import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCategories, fetchMenuSets } from '../lib/queries'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../hooks/useAuth'
import { slashDateWd, todayStr } from '../lib/date'
import { menuPrintDensity } from '../lib/printFit'

export default function MenuSetListPage() {
  const nav = useNavigate()
  const { editable } = useAuth()
  const [cats, setCats] = useState<string[]>([])
  const [active, setActive] = useState('')
  const [catError, setCatError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchCategories()
      .then((c) => {
        if (!alive) return
        setCats(c)
        setActive((a) => a || c[0] || '')
      })
      .catch((e) => alive && setCatError(String(e?.message ?? e)))
    return () => {
      alive = false
    }
  }, [])

  const { data, loading, error, reload } = useLoader(
    () => (active ? fetchMenuSets(active) : Promise.resolve([])),
    [active]
  )
  useRealtime(['menu_sets', 'dishes', 'dish_ingredients'], reload)
  const items = data ?? []
  // 印刷面の1行分（画面カード2行目と同じ連結式）。文字サイズ段階の見積りと表描画で共用する
  const printRows = items.map((m) => ({
    id: m.id,
    code: m.code,
    line: [m.staple, m.main, m.side1, m.side2, m.soup].filter(Boolean).join(' / '),
  }))

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3 items-center print:hidden">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            aria-pressed={active === c}
            className={`inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-medium transition ${
              active === c ? 'bg-emerald-600 text-white' : 'bg-white border text-slate-700 hover:border-emerald-400'
            }`}
          >
            {c}
          </button>
        ))}
        {/* ご当地の右：副菜・おやつ・＋新規（カテゴリ絞込ではなく各ページへ移動） */}
        <span className="mx-1 self-stretch border-l border-slate-300" aria-hidden />
        <button
          onClick={() => nav('/sides')}
          className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-medium bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        >
          副菜
        </button>
        <button
          onClick={() => nav('/snacks')}
          className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-medium bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        >
          おやつ
        </button>
        {editable && (
          <button
            onClick={() => nav('/new')}
            className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700"
          >
            ＋新規
          </button>
        )}
        {/* 表示中カテゴリの一覧をそのままA4縦で印刷（他帳票と同じ window.print() 方式） */}
        <button
          onClick={() => window.print()}
          disabled={items.length === 0}
          title="表示中のカテゴリの献立一覧をA4縦で印刷します"
          className="inline-flex items-center justify-center px-4 min-h-[44px] rounded-full text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
        >
          🖨 印刷（A4縦）
        </button>
      </div>
      {(catError || error) && <p className="text-red-600 text-sm mb-2 print:hidden">エラー: {catError || error}</p>}
      {loading ? (
        <p className="text-slate-500 print:hidden">読み込み中…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 print:hidden">
          {items.map((m) => (
            <button
              key={m.id}
              onClick={() => nav(`/set/${m.id}`)}
              aria-label={`${m.code} ${[m.staple, m.main, m.side1, m.side2, m.soup].filter(Boolean).join(' ')}`}
              className="text-left bg-white rounded-lg border p-3 hover:border-emerald-400 hover:shadow transition"
            >
              <div className="font-bold text-emerald-700">{m.code}</div>
              <div className="text-sm text-slate-600 mt-1">
                {[m.staple, m.main, m.side1, m.side2, m.soup].filter(Boolean).join(' / ')}
              </div>
            </button>
          ))}
          {items.length === 0 && <p className="text-slate-400">データなし</p>}
        </div>
      )}

      {/* 印刷面（A4縦・画面には出さない）。表示中カテゴリの全件を1行1セットの表で並べる。
          体裁は index.css の .menuset-print 配下に集約（列幅・罫線・動的文字サイズ）。
          0件のときは描画しない＝白紙1枚が出るのを防ぐ */}
      {items.length > 0 && (
        <section className="menuset-print hidden print:block" data-density={menuPrintDensity(printRows.map((r) => r.line))}>
          <div className="menuset-print-head">
            <h2>献立一覧　{active}</h2>
            <span>
              全{items.length}件　{slashDateWd(todayStr())}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>セット</th>
                <th>献立（主食 / メイン / 副菜① / 副菜② / 汁物）</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.code}</td>
                  {/* 画面カード2行目と同じ連結＝紙も画面も「そのまま」同じ並び */}
                  <td>{r.line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
