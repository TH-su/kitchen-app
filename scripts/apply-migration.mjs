// マイグレーション適用補助: 利用可能な接続情報を確認し、可能なら DDL を適用
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const names = Object.keys(process.env).filter((k) => /SUPABASE|DATABASE|POSTGRES|PG|DB_/.test(k))
console.log('接続系の環境変数(名前のみ):', names.join(', ') || '(なし)')

// staple_grain_g 列が既に存在するかを PostgREST 経由で判定（SELECTしてエラー種別を見る）
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { error } = await sb.from('daily_menus').select('staple_grain_g').limit(1)
if (!error) console.log('✅ staple_grain_g 列は既に存在します')
else console.log('⚠ staple_grain_g 列なし or エラー:', error.message)
