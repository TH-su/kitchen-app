// 検証で作ったテストデータ・テストユーザーを掃除し、件数を確認
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(ROOT, '.env') })
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

await admin.from('menu_sets').delete().eq('category', 'テスト')
await admin.from('ingredients').delete().in('name', ['テスト食材A', '__検証食材__'])

const { data, error } = await admin.auth.admin.listUsers()
if (error) throw error
const u = data.users.find((x) => x.email === 'uitest@example.com')
if (u) {
  await admin.auth.admin.deleteUser(u.id)
  console.log('テストユーザー削除: ✓')
} else {
  console.log('テストユーザー: 既に無し')
}

console.log('\n=== 現在の件数（seed基準: 249/995/3636/450）===')
for (const t of ['menu_sets', 'dishes', 'dish_ingredients', 'ingredients']) {
  const { count } = await admin.from(t).select('*', { count: 'exact', head: true })
  console.log(`  ${t}: ${count}`)
}
console.log('✅ テストデータ＆ユーザー掃除完了')
