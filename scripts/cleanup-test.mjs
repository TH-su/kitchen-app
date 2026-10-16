// 検証で作ったテストデータ・テストユーザーを掃除し、件数を確認
// 施設の指定が必須（0010 以降）: node scripts/cleanup-test.mjs --facility=<施設の id>
//   消すのも数えるのもその施設の行だけ（テストユーザーの削除は施設に関係なく行う＝会員の行も一緒に消える）。
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { facilityIdFromArgs, assertFacilityExists } from './_facility.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: join(ROOT, '.env') })
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const FACILITY_ID = facilityIdFromArgs()
await assertFacilityExists(admin, FACILITY_ID)

await admin.from('menu_sets').delete().eq('facility_id', FACILITY_ID).eq('category', 'テスト')
await admin.from('ingredients').delete().eq('facility_id', FACILITY_ID).in('name', ['テスト食材A', '__検証食材__'])
await admin.from('daily_menus').delete().eq('facility_id', FACILITY_ID).gte('menu_date', '2099-01-01') // テスト日付

const { data, error } = await admin.auth.admin.listUsers()
if (error) throw error
const u = data.users.find((x) => x.email === 'uitest@example.com')
if (u) {
  await admin.auth.admin.deleteUser(u.id)
  console.log('テストユーザー削除: ✓')
} else {
  console.log('テストユーザー: 既に無し')
}

console.log('\n=== 指定した施設の現在の件数（seed基準: 249/995/3636/450）===')
for (const t of ['menu_sets', 'dishes', 'dish_ingredients', 'ingredients']) {
  const { count } = await admin.from(t).select('*', { count: 'exact', head: true }).eq('facility_id', FACILITY_ID)
  console.log(`  ${t}: ${count}`)
}
console.log('✅ テストデータ＆ユーザー掃除完了')
