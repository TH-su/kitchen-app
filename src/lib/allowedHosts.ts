// 外へつなぐ先・画像の出どころを、公開版の CSP（vite.config.ts）と同じ範囲に絞る（2026-11-28 代表者の決定「推奨どおり」）。
// CSP は Supabase を1か所（この画面がログインに使う所）しか許さない。別の住所を入れると、CSP で黙って止まり
// 「出ない・読めない」理由が画面に出ないため、入力・表示の時点で断る。
// 住所の具体値はコードに書かず、ビルドの設定（VITE_SUPABASE_URL）から取る。設定が無い・壊れている時は全部断る（安全側）。

/** この画面がログインに使う Supabase の origin（https://<ref>.supabase.co）。取れなければ null。 */
export function supabaseOrigin(): string | null {
  const raw = String(import.meta.env.VITE_SUPABASE_URL ?? '').trim()
  if (!raw) return null
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' ? u.origin : null
  } catch {
    return null
  }
}

/** 読み取り口 kitchen-read の正しい住所（この画面の Supabase の関数）。設定が無ければ null。 */
export function expectedKitchenReadUrl(): string | null {
  const o = supabaseOrigin()
  return o ? `${o}/functions/v1/kitchen-read` : null
}

/** 読み取り口の住所が、この画面の Supabase の kitchen-read そのものか。 */
export function isAllowedKitchenReadUrl(url: string): boolean {
  const want = expectedKitchenReadUrl()
  return want !== null && url === want
}

// 施設長印として通す data URL（画像の base64 だけ）
const SEAL_DATA_RE = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/

/** 施設長印の画像として表示してよいか（data URL の画像か、この画面の Supabase に置いた https の画像）。 */
export function isAllowedSealSrc(src: string): boolean {
  const s = src.trim()
  if (!s) return false
  if (s.startsWith('data:')) return SEAL_DATA_RE.test(s)
  const o = supabaseOrigin()
  if (!o) return false
  try {
    return new URL(s).origin === o
  } catch {
    return false
  }
}
