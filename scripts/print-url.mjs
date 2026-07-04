// VITE_SUPABASE_URL のみ表示（URLは秘密情報ではない。anon キーは表示しない）
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })
console.log('VITE_SUPABASE_URL =', process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '(未設定)')
const k = process.env.VITE_SUPABASE_ANON_KEY || ''
console.log('VITE_SUPABASE_ANON_KEY = (設定あり・先頭8文字のみ)', k ? k.slice(0, 8) + '…' : '(未設定)')
