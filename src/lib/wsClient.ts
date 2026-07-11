// 読み取り専用の GAS（ワークスケジュール/週間計画クラウド）クライアント。
//
// ── PII 非残留規約（このファイル全体で常時遵守・レビューで機械確認される）──
//  1. トークン・GAS エンドポイントの具体値をコード/リポジトリに書かない（localStorage 手入力保存のみ）。
//  2. su_sync_common は【読むだけ】。localStorage.setItem の対象にしない（書き先は kitchen_ws_sync_v1 のみ）。
//  3. GAS 応答の利用者名・ケア内容・職員の労務情報（rules/empCode/employment/status 等）を
//     state/localStorage/console に一切残さない（取得直後に必要最小限＝氏名 or 件数へ縮約する）。
//  4. pull は必ず keys を明示する（全件ダンプを呼ばない）。書込 action（put/push）のコードパスを作らない。
//
// 本モジュールは ping / pull(keys) / get(key) の【読み取り3種のみ】を実装する。

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
 * ★ name 以外のフィールド（rules/empCode/employment/status 等の労務情報）は一切保持しない。
 * 設定なし/失敗/形不一致は null。
 */
export async function fetchRosterNames(): Promise<string[] | null> {
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
 * ★ 返すのは数値2つだけ（氏名・ケア内容は保持・出力しない）。設定なし/失敗/形不一致は null。
 */
export async function fetchResidentCounts(): Promise<{ residents: number; hospitalized: number } | null> {
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
