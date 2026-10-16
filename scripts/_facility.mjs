// 書く・消すスクリプトが使う「施設の指定」（migration 0010 で表が施設ごとになったため）
//   指定の仕方: 引数 --facility=<施設の id>  または  環境変数 KITCHEN_FACILITY_ID=<施設の id>
//   指定が無い・形が違う・その施設が無い時は、何もせずに止める（黙って既定の施設や全施設へ書かない）。
//   既定の施設の id をここで決め打ちしない: 施設が2つ以上になった後に、うっかり既定の施設へ書くのを防ぐため。
//   施設の id は SQL エディタで  select id, name from facilities;  で確かめる。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function facilityIdFromArgs(argv = process.argv, env = process.env) {
  const arg = argv.find((a) => a.startsWith('--facility='))
  const v = (arg ? arg.slice('--facility='.length) : env.KITCHEN_FACILITY_ID ?? '').trim()
  if (!v) {
    console.error('❌ 施設が指定されていません。--facility=<施設の id> か 環境変数 KITCHEN_FACILITY_ID を付けてください')
    console.error('   施設の id は SQL エディタで  select id, name from facilities;  で確かめられます')
    process.exit(1)
  }
  if (!UUID_RE.test(v)) {
    console.error(`❌ 施設の id の形が違います（uuid ではありません）: ${v}`)
    process.exit(1)
  }
  return v.toLowerCase()
}

// service role のクライアントで施設があるか確かめ、名前を返す（無ければ止める）
export async function assertFacilityExists(sb, facilityId) {
  const { data, error } = await sb.from('facilities').select('id, name').eq('id', facilityId).maybeSingle()
  if (error) {
    console.error(`❌ 施設の確認に失敗しました（0010 は当たっていますか）: ${error.message}`)
    process.exit(1)
  }
  if (!data) {
    console.error(`❌ 施設が見つかりません: ${facilityId}`)
    process.exit(1)
  }
  console.log(`施設: ${data.name}（${data.id}）`)
  return data.name
}
