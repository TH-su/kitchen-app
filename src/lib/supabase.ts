import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  // 開発中の設定漏れを早期に気づけるようにする
  console.warn('Supabase の環境変数 (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) が未設定です')
}

// 2026-11-20: 介護ツールの DB（care-log）の箱 kitchen へ移した（統合 0116・Supabase の無料の枠を1つ空けるため）。
// 表・ビュー・関数（replace_dish_recipe）はどれも kitchen の箱にある。変更の通知（useRealtime）も同じ箱を見る
export const DB_SCHEMA = 'kitchen'
export const supabase = createClient(url, anonKey, { db: { schema: DB_SCHEMA } })
