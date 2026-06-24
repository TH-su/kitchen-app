import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'

// ログイン入口は LoginPage に一本化したため、ここはログイン済みユーザーのログアウト専用。
export default function LoginBar() {
  const { user, ready } = useAuth()
  const [error, setError] = useState<string | null>(null)

  if (!ready || !user) return null

  const logout = async () => {
    setError(null)
    try {
      // ローカルセッションを確実に破棄（サーバ revoke が失敗してもゲートを解除する）
      const { error: e } = await supabase.auth.signOut({ scope: 'local' })
      if (e) setError(e.message)
    } catch (err: any) {
      setError(String(err?.message ?? err))
    }
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-emerald-100 max-w-[10rem] truncate">{user.email}</span>
      {error && <span className="text-red-200">{error}</span>}
      <button onClick={logout} className="bg-emerald-800 px-2 py-1 rounded">
        ログアウト
      </button>
    </div>
  )
}
