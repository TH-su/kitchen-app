// 検証用の一時認証ユーザーを作成/削除（service role）。実行: node scripts/test-user.mjs [--delete]
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const EMAIL = 'simtest@example.com'
const PW = 'SimTest-2099!'

const { data: list } = await sb.auth.admin.listUsers()
const existing = list.users.find((u) => u.email === EMAIL)

if (process.argv.includes('--delete')) {
  if (existing) { await sb.auth.admin.deleteUser(existing.id); console.log('削除:', EMAIL) }
  else console.log('既に無し:', EMAIL)
} else {
  if (existing) { console.log('既に存在:', EMAIL); }
  else {
    const { error } = await sb.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true })
    if (error) { console.error('作成失敗:', error.message); process.exit(1) }
    console.log('作成:', EMAIL, '/', PW)
  }
}
