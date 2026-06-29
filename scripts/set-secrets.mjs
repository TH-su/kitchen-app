// .env の Supabase 接続情報を GitHub リポジトリの Actions Secrets に登録する（要 gh 認証）。
// 実行: node scripts/set-secrets.mjs
import dotenv from 'dotenv'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const GH = '/opt/homebrew/bin/gh'
const REPO = 'TH-su/kitchen-app'
const NAMES = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']

for (const name of NAMES) {
  const val = process.env[name]
  if (!val) {
    console.error(`❌ .env に ${name} がありません`)
    process.exit(1)
  }
  // 値は標準入力で渡す（プロセス一覧に出さない）。anon キーは公開前提の安全な鍵。
  execFileSync(GH, ['secret', 'set', name, '--repo', REPO], { input: val, stdio: ['pipe', 'inherit', 'inherit'] })
  console.log(`✅ secret 登録: ${name}`)
}
