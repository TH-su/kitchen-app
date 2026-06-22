// 番号→id の DB 直接解決ロジックの検証（save() が使う resolveSetId/resolveSnackId 相当）
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(ROOT, '.env') })
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
})
const resolveSet = async (code) => {
  const { data, error } = await sb.from('menu_sets').select('id,code').eq('code', code).maybeSingle()
  if (error) throw error
  return data
}
const resolveSnack = async (code) => {
  const { data, error } = await sb
    .from('dishes')
    .select('id,code')
    .eq('dish_type', 'snack')
    .eq('code', code)
    .maybeSingle()
  if (error) throw error
  return data
}
console.log('魚⑨ →', await resolveSet('魚⑨'))
console.log('牛⑨ →', await resolveSet('牛⑨'))
console.log('そ⑭ →', await resolveSet('そ⑭'))
console.log('お56 →', await resolveSnack('お56'))
console.log('存在しない番号 ZZ →', await resolveSet('ZZ'), '(null → 「見つかりません」)')
