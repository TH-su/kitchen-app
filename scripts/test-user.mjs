// 検証用の一時認証ユーザーを作成/削除（service role）。実行: node scripts/test-user.mjs [--delete]
// 使い終わったら必ず --delete で消す（本番に残さない）。
import dotenv from 'dotenv'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMAIL = 'simtest@example.com'
// パスワードは実行ごとの乱数（2026-10-21）。公開リポジトリに固定の値を置くと、本番に残った検証用アカウントに誰でも入れるため。
// 画面に1回出すだけで、ファイルには残さない。
const PW = randomBytes(18).toString('base64url')

const { data: list } = await sb.auth.admin.listUsers()
const existing = list.users.find((u) => u.email === EMAIL)

if (process.argv.includes('--delete')) {
  if (existing) { await sb.auth.admin.deleteUser(existing.id); console.log('削除:', EMAIL) }
  else console.log('既に無し:', EMAIL)
} else {
  if (existing) {
    // 既にある時もパスワードを新しい乱数に替えて出す（前のパスワードを使えなくする）
    const { error } = await sb.auth.admin.updateUserById(existing.id, { password: PW })
    if (error) { console.error('パスワードの更新に失敗:', error.message); process.exit(1) }
    console.log('既に存在（パスワードを新しくした）:', EMAIL, '/', PW)
  }
  else {
    const { error } = await sb.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true })
    if (error) { console.error('作成失敗:', error.message); process.exit(1) }
    console.log('作成:', EMAIL, '/', PW)
  }
}
