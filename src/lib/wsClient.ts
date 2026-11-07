// 読み取り専用の GAS（ワークスケジュール/週間計画クラウド）クライアント。
//
// ── PII 非残留規約（このファイル全体で常時遵守・レビューで機械確認される）──
//  1. トークン・GAS エンドポイントの具体値をコード/リポジトリに書かない（localStorage 手入力保存のみ）。
//  2. su_sync_common は【読むだけ】。localStorage.setItem の対象にしない（書き先は kitchen_ws_sync_v1 のみ）。
//  3. GAS 応答の利用者名・ケア内容・職員の労務情報（rules/empCode/employment/status 等）を
//     state/localStorage/console に一切残さない（取得直後に必要最小限＝氏名 or 件数へ縮約する）。
//  4. pull は必ず keys を明示する（全件ダンプを呼ばない）。書込 action（put/push）のコードパスを作らない。
//  5. 新しい保存先の読み取り口（介護ツールの Supabase の受け口 kitchen-read）の URL・合言葉も、具体値をコードに書かない。
//     書き先は自前キー kitchen_su_read_v1 だけ。受け口の応答は数値2つ・氏名の配列だけで、それ以外は受け取っても捨てる。
//
// 本モジュールは ping / pull(keys) / get(key) の【読み取り3種のみ】を実装する。
// 新しい保存先の読み取り口が設定されている時は、在籍者数・職員の氏名を先にそちらから読む（2026-11-07 代表者の決定「Aで進めて」）。
// 読めた時は GAS を呼ばない。読めない・断られた（切り替える前を含む）・形が違う時は今までどおり GAS から読む。

// GAS エンドポイントの許容形式（ワークスケジュール側クライアントと同一基準）。
const GAS_ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/

// 自前保存キー（書き先はここだけ）。su_sync_common は読み取り専用の代替ソース。
const SELF_KEY = 'kitchen_ws_sync_v1'
const COMMON_KEY = 'su_sync_common'

export type WsSyncConfig = { endpoint: string; token: string }

/**
 * 接続設定を読む。優先1: kitchen_ws_sync_v1、優先2: su_sync_common。
 * 各値は trim し、endpoint が形式不一致ならそのソースはスキップする。
 * どちらも有効でなければ null（＝連携オフ）。JSON 破損等は握りつぶして安全側（null 相当）。
 */
export function readSyncConfig(): WsSyncConfig | null {
  for (const key of [SELF_KEY, COMMON_KEY]) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { endpoint?: unknown; token?: unknown; disabled?: unknown } | null
      if (!parsed || typeof parsed !== 'object') continue
      // 自前キーに明示的な「連携オフ」印がある場合は、共有(su_sync_common)へフォールバックせず null を確定する。
      // （WsSettingsPage で endpoint を空にして保存＝連携オフ にしたとき、同一オリジンに残る共有設定で取得が継続するのを防ぐ）
      if (key === SELF_KEY && parsed.disabled === true) return null
      const endpoint = typeof parsed.endpoint === 'string' ? parsed.endpoint.trim() : ''
      const token = typeof parsed.token === 'string' ? parsed.token.trim() : ''
      if (!endpoint || !GAS_ENDPOINT_RE.test(endpoint)) continue // 空/不正はこのソースを飛ばして次へ
      return { endpoint, token }
    } catch {
      // このソースは壊れている → 次のソースへ（例外を外へ漏らさない）
    }
  }
  return null
}

/**
 * 接続設定を保存する。書き先は kitchen_ws_sync_v1 のみ（su_sync_common には絶対に書かない）。
 * 空 endpoint は「連携オフ」として許可し、非空で形式不正のときだけ拒否する。
 * 空 endpoint のときは disabled:true を残し、共有(su_sync_common)へのフォールバックを止める（確実にオフ）。
 */
export function saveSyncConfig(endpoint: string, token: string): { ok: boolean; error?: string } {
  const ep = (endpoint ?? '').trim()
  const tok = (token ?? '').trim()
  if (ep && !GAS_ENDPOINT_RE.test(ep)) {
    return { ok: false, error: 'URL は https://script.google.com/macros/s/.../exec の形式である必要があります' }
  }
  try {
    // 空 endpoint＝連携オフ。disabled:true を残して共有設定へのフォールバックを止める。
    // 有効 endpoint のときは disabled:undefined＝JSON では出力されず、印は残らない。
    localStorage.setItem(
      SELF_KEY,
      JSON.stringify({ endpoint: ep, token: tok, updatedAt: Date.now(), disabled: ep === '' ? true : undefined })
    )
    return { ok: true }
  } catch {
    return { ok: false, error: '保存に失敗しました（localStorage が使用できません）' }
  }
}

// ── 新しい保存先の読み取り口（kitchen-read）──
// 受け口の住所の許容形式（Supabase の関数 kitchen-read の住所だけ。プロジェクトの名前は書かない）。
const KITCHEN_READ_URL_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/kitchen-read$/
// 自前保存キー（読み取り口の設定の書き先はここだけ）。
const READ_KEY = 'kitchen_su_read_v1'
// 合言葉の長さの下限（受け口と同じ・32文字以上）
const READ_TOKEN_MIN = 32

export type KitchenReadConfig = { url: string; key: string }

/** 新しい保存先の読み取り口の設定を読む。無い・形が違う・壊れている時は null（＝使わず GAS だけ）。 */
export function readKitchenReadConfig(): KitchenReadConfig | null {
  try {
    const raw = localStorage.getItem(READ_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { url?: unknown; key?: unknown } | null
    if (!parsed || typeof parsed !== 'object') return null
    const url = typeof parsed.url === 'string' ? parsed.url.trim() : ''
    const key = typeof parsed.key === 'string' ? parsed.key.trim() : ''
    if (!KITCHEN_READ_URL_RE.test(url) || key.length < READ_TOKEN_MIN) return null
    return { url, key }
  } catch {
    return null
  }
}

/**
 * 新しい保存先の読み取り口の設定を保存する。書き先は kitchen_su_read_v1 のみ。
 * URL と合言葉の両方が空なら設定を消す（＝今までどおり GAS だけ）。片方だけ・形が違う時は保存しない。
 */
export function saveKitchenReadConfig(url: string, key: string): { ok: boolean; error?: string } {
  const u = (url ?? '').trim()
  const k = (key ?? '').trim()
  try {
    if (!u && !k) {
      localStorage.removeItem(READ_KEY)
      return { ok: true }
    }
    if (!KITCHEN_READ_URL_RE.test(u)) {
      return { ok: false, error: 'URL は https://….supabase.co/functions/v1/kitchen-read の形にしてください' }
    }
    if (k.length < READ_TOKEN_MIN) {
      return { ok: false, error: `合言葉は ${READ_TOKEN_MIN} 文字以上です（管理者から受け取った値をそのまま入れてください）` }
    }
    localStorage.setItem(READ_KEY, JSON.stringify({ url: u, key: k, updatedAt: Date.now() }))
    return { ok: true }
  } catch {
    return { ok: false, error: '保存に失敗しました（localStorage が使用できません）' }
  }
}

/** 読み先の設定（GAS か新しい保存先の読み取り口）が1つでもあるか。 */
export function hasReadSource(): boolean {
  return readSyncConfig() !== null || readKitchenReadConfig() !== null
}

/** 直近に読めた読み先（表示専用・値そのものは持たない）。 */
export type ReadFrom = 'kitchen-read' | 'gas' | null
const lastFrom: { counts: ReadFrom; roster: ReadFrom } = { counts: null, roster: null }
export function getLastReadFrom(): { counts: ReadFrom; roster: ReadFrom } {
  return { ...lastFrom }
}

/**
 * 新しい保存先の読み取り口へ POST する。設定なし/通信失敗/!res.ok/out.ok!==true はすべて null。
 * 送るのは操作の名前と合言葉だけ。Content-Type は text/plain（事前の問い合わせを起こさない）。
 * console.warn はエラー種別のみを出し、応答本文・合言葉は一切出力しない。
 */
export async function postKitchenRead<T>(action: 'ping' | 'counts' | 'names', timeoutMs = 10000): Promise<T | null> {
  const cfg = readKitchenReadConfig()
  if (!cfg) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action, kitchenKey: cfg.key }),
      cache: 'no-store',
      credentials: 'omit',
      signal: ctrl.signal,
    })
    if (!res.ok) {
      // 409 は切り替える前（今までどおり GAS から読む）。種類だけを出す
      if (res.status !== 409) console.warn('[wsClient] 新しい保存先の読み取り口が断りました（status:', res.status, '）')
      return null
    }
    const out = (await res.json()) as { ok?: unknown } | null
    if (!out || typeof out !== 'object' || out.ok !== true) {
      console.warn('[wsClient] 新しい保存先の読み取り口の応答が ok ではありません')
      return null
    }
    return out as T
  } catch (e) {
    const kind = e instanceof DOMException && e.name === 'AbortError' ? 'タイムアウト' : '通信エラー'
    console.warn('[wsClient] 新しい保存先の読み取り口の呼び出しに失敗しました:', kind)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 新しい保存先の読み取り口の疎通確認（合言葉が合うか）。 */
export async function pingKitchenRead(): Promise<boolean> {
  const out = await postKitchenRead<{ ok: true }>('ping')
  return out !== null
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100000

/** 読み取り口の在籍者数。数値2つの形の時だけ返す（ほかの項目は受け取っても捨てる）。読めなければ null。 */
async function countsFromKitchenRead(): Promise<{ residents: number; hospitalized: number } | null> {
  const out = await postKitchenRead<{ residents?: unknown; hospitalized?: unknown }>('counts')
  if (!out) return null
  const { residents, hospitalized } = out
  if (!isCount(residents) || !isCount(hospitalized) || hospitalized > residents) return null
  return { residents, hospitalized }
}

/** 読み取り口の職員の氏名。文字の配列の時だけ、trim・空と重複を除いて返す（1つでも形が違えば null）。 */
async function namesFromKitchenRead(): Promise<string[] | null> {
  const out = await postKitchenRead<{ names?: unknown }>('names')
  if (!out || !Array.isArray(out.names)) return null
  const seen = new Set<string>()
  const names: string[] = []
  for (const n of out.names) {
    if (typeof n !== 'string') return null
    const nm = n.trim()
    if (!nm || seen.has(nm)) continue
    seen.add(nm)
    names.push(nm)
  }
  return names
}

/**
 * GAS へ POST する共通処理。設定なし/通信失敗/!res.ok/out.ok!==true はすべて null を返す。
 * console.warn はエラー種別のみを出し、応答本文（PII 含む可能性）は一切出力しない。
 */
export async function postGas<T>(body: object, timeoutMs = 15000): Promise<T | null> {
  const cfg = readSyncConfig()
  if (!cfg) return null // 連携オフ＝黙って null（エラー表示しない）

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...body, token: cfg.token }),
      redirect: 'follow',
      signal: ctrl.signal,
    })
    if (!res.ok) {
      console.warn('[wsClient] GAS からの HTTP 応答が異常です（status:', res.status, '）')
      return null
    }
    const out = (await res.json()) as { ok?: unknown } | null
    if (!out || typeof out !== 'object' || out.ok !== true) {
      console.warn('[wsClient] GAS 応答が ok ではありません')
      return null
    }
    return out as T
  } catch (e) {
    // エラー種別のみを出す（応答本文・PII は出さない）
    const kind = e instanceof DOMException && e.name === 'AbortError' ? 'タイムアウト' : '通信エラー'
    console.warn('[wsClient] GAS 呼び出しに失敗しました:', kind)
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 疎通確認。ok:true が返れば true、それ以外（設定なし含む）は false。 */
export async function pingWs(): Promise<boolean> {
  const out = await postGas<{ ok: true }>({ action: 'ping' })
  return out !== null
}

/**
 * シフト職員名簿（クラウドキー staff）から在籍者の氏名だけを取得する。
 * pull(keys:['staff']) → entries.staff.data（配列。data が {staff:[...]} 形でも両対応）。
 * active!==false の要素の name（string・trim 非空）だけを射影し、重複を除いて返す。
 * 新しい保存先の読み取り口（kitchen-read）が設定されていれば先にそちらから読み、読めた時は GAS を呼ばない。
 * ★ name 以外のフィールド（rules/empCode/employment/status 等の労務情報）は一切保持しない。
 * 設定なし/失敗/形不一致は null。
 */
export async function fetchRosterNames(): Promise<string[] | null> {
  // 新しい保存先の読み取り口が設定されていれば先にそちら。読めた時は GAS を呼ばない
  if (readKitchenReadConfig()) {
    const fromNew = await namesFromKitchenRead()
    if (fromNew) {
      lastFrom.roster = 'kitchen-read'
      return fromNew
    }
  }
  const names = await fetchRosterNamesGas()
  if (names) lastFrom.roster = 'gas'
  return names
}

async function fetchRosterNamesGas(): Promise<string[] | null> {
  const out = await postGas<{ entries?: { staff?: { data?: unknown } } }>({ action: 'pull', keys: ['staff'] })
  if (!out) return null

  const rawData = out.entries?.staff?.data
  let arr: unknown[] | null = null
  if (Array.isArray(rawData)) {
    arr = rawData
  } else if (rawData && typeof rawData === 'object' && Array.isArray((rawData as { staff?: unknown }).staff)) {
    arr = (rawData as { staff: unknown[] }).staff
  }
  if (!arr) return null

  const seen = new Set<string>()
  const names: string[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const rec = item as { active?: unknown; name?: unknown }
    if (rec.active === false) continue // 在籍者（active!==false）のみ
    if (typeof rec.name !== 'string') continue
    const nm = rec.name.trim()
    if (!nm || seen.has(nm)) continue
    seen.add(nm)
    names.push(nm) // 氏名だけを射影
  }
  return names
}

/**
 * 週間計画（care_schedule_v2）由来の在籍者数を取得する。
 * get(key:'care_schedule_v2') → data.residents[] を走査し、
 *   movedOut が truthy でなく external!==true の件数を residents、
 *   そのうち hospitalized===true の件数を hospitalized として数える。
 * 新しい保存先の読み取り口（kitchen-read）が設定されていれば先にそちらから読み、読めた時は GAS を呼ばない。
 * ★ 返すのは数値2つだけ（氏名・ケア内容は保持・出力しない）。設定なし/失敗/形不一致は null。
 */
export async function fetchResidentCounts(): Promise<{ residents: number; hospitalized: number } | null> {
  // 新しい保存先の読み取り口が設定されていれば先にそちら。読めた時は GAS を呼ばない
  if (readKitchenReadConfig()) {
    const fromNew = await countsFromKitchenRead()
    if (fromNew) {
      lastFrom.counts = 'kitchen-read'
      return fromNew
    }
  }
  const counts = await fetchResidentCountsGas()
  if (counts) lastFrom.counts = 'gas'
  return counts
}

async function fetchResidentCountsGas(): Promise<{ residents: number; hospitalized: number } | null> {
  const out = await postGas<{ data?: { residents?: unknown } }>({ action: 'get', key: 'care_schedule_v2' })
  if (!out) return null

  const list = out.data?.residents
  if (!Array.isArray(list)) return null

  let residents = 0
  let hospitalized = 0
  for (const item of list) {
    if (!item || typeof item !== 'object') continue
    const rec = item as { movedOut?: unknown; external?: unknown; hospitalized?: unknown }
    if (rec.movedOut) continue // 退去は除外
    if (rec.external === true) continue // 外部利用者は除外
    residents++
    if (rec.hospitalized === true) hospitalized++
  }
  return { residents, hospitalized } // 数値2つだけを返す
}
