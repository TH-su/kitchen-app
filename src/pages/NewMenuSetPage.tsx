import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchCategories } from '../lib/queries'
import { createMenuSet } from '../lib/mutations'
import { useAuth } from '../hooks/useAuth'

export default function NewMenuSetPage() {
  const nav = useNavigate()
  const { editable, ready } = useAuth()
  const [cats, setCats] = useState<string[]>([])
  const [code, setCode] = useState('')
  const [category, setCategory] = useState('')
  const [seq, setSeq] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchCategories()
      .then(setCats)
      .catch((e) => console.error('カテゴリ候補の読み込みに失敗:', e))
  }, [])

  if (!ready) return null
  if (!editable) return <p className="text-slate-600">編集するにはログインしてください。</p>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const c = code.trim()
    const cat = category.trim()
    if (!c) return setError('番号を入力してください')
    if (!cat) return setError('カテゴリを入力してください')
    const n = Number(seq)
    const seqNo = seq && Number.isFinite(n) && n >= 0 ? n : null
    setBusy(true)
    setError(null)
    try {
      const idNew = await createMenuSet({ code: c, category: cat, seq_no: seqNo })
      nav(`/set/${idNew}`)
    } catch (err: any) {
      setError(String(err?.message ?? err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-3">
      <h2 className="text-lg font-bold">新規献立セット</h2>
      <label className="block text-sm">
        番号（例: 魚㉒）
        <input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 w-full border rounded px-2 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        カテゴリ
        <input
          required
          list="cat-names"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full border rounded px-2 py-2 text-sm"
        />
        <datalist id="cat-names">
          {cats.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="block text-sm">
        並び順（任意・数値）
        <input
          type="number"
          min="0"
          value={seq}
          onChange={(e) => setSeq(e.target.value)}
          className="mt-1 w-full border rounded px-2 py-2 text-sm"
        />
      </label>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="bg-emerald-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {busy ? '作成中…' : '作成して編集へ'}
      </button>
    </form>
  )
}
