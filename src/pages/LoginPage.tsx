import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { KITCHEN_LABEL } from '../lib/facility'

// 未ログイン時に全画面で表示するログイン画面（アプリ本体の手前でゲート）
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (err) setError(err.message === 'Invalid login credentials' ? 'メールアドレスまたはパスワードが違います' : err.message)
    // 成功時は onAuthStateChange（useAuth）が session を更新し、App がアプリ本体へ切替える
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-emerald-800">厨房メニュー管理</h1>
          <p className="text-slate-500 text-sm mt-1">{KITCHEN_LABEL}</p>
        </div>
        <form onSubmit={submit} className="bg-white rounded-xl shadow border p-6 space-y-4">
          <h2 className="text-lg font-bold text-slate-800">ログイン</h2>
          <label className="block text-sm font-medium text-slate-700">
            メールアドレス
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-base"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            パスワード
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-base"
            />
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-emerald-600 text-white rounded py-2.5 font-medium disabled:opacity-50 min-h-[44px]"
          >
            {busy ? 'ログイン中…' : 'ログイン'}
          </button>
          <p className="text-xs text-slate-400 text-center">
            アカウントは管理者が発行します。ログインできない場合は管理者にご連絡ください。
          </p>
        </form>
      </div>
    </div>
  )
}
