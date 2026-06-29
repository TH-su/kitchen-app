import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCategories, fetchMenuSets } from '../lib/queries'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../hooks/useAuth'

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

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3 items-center">
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
      </div>
      {(catError || error) && <p className="text-red-600 text-sm mb-2">エラー: {catError || error}</p>}
      {loading ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
    </div>
  )
}
