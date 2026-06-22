import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

export default function LoginBar() {
  const { user, ready } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!ready) return null

  if (user) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="text-emerald-100 max-w-[10rem] truncate">{user.email}</span>
        {error && <span className="text-red-200">{error}</span>}
        <button
          onClick={async () => {
            setError(null)
            const { error: e } = await supabase.auth.signOut()
            if (e) setError(e.message)
          }}
          className="bg-emerald-800 px-2 py-1 rounded"
        >
          ログアウト
        </button>
      </div>
    )
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (err) setError(err.message)
    else {
      setOpen(false)
      setEmail('')
      setPassword('')
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="bg-emerald-800 text-xs px-3 py-1.5 rounded">
        ログイン
      </button>
      {open && (
        <form
          onSubmit={submit}
          className="absolute right-0 mt-1 bg-white text-slate-800 rounded shadow-lg border p-3 w-64 z-20 space-y-2"
        >
          <input
            type="email"
            required
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          <input
            type="password"
            required
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-emerald-600 text-white rounded py-1.5 text-sm disabled:opacity-50"
          >
            {busy ? '…' : 'ログイン'}
          </button>
        </form>
      )}
    </div>
  )
}
