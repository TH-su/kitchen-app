import { useCallback, useState, useSyncExternalStore } from 'react'
import {
  readSyncConfig,
  saveSyncConfig,
  pingWs,
  readKitchenReadConfig,
  saveKitchenReadConfig,
  pingKitchenRead,
  getLastReadFrom,
  type ReadFrom,
} from '../lib/wsClient'
import { subscribe, getSnapshot, refreshNow } from '../lib/staffStore'

// WS連携（読み取り専用GAS）の設定画面。/ws-settings（認証ゲート内）。
//
// PII/セキュリティ規約（このファイルでも機械確認される）:
//   - GASの応答内容・トークン・エンドポイントの具体値はコードに一切書かない。値は localStorage 手入力のみ。
//   - su_sync_common は【読むだけ】。書き先は kitchen_ws_sync_v1 のみ（saveSyncConfig 経由）。
//     このページからは localStorage.setItem を一切呼ばず、保存は saveSyncConfig に委譲する。
//   - トークン値は console 等に出さない（password 入力で伏せ、状態にのみ保持）。
//   - 新しい保存先の読み取り口（kitchen-read）の URL・合言葉も同じ。書き先は kitchen_su_read_v1 のみ（saveKitchenReadConfig 経由）。

// 設定ソース判定にだけ使う（WS側クライアントと同一基準）。判定は表示専用・読み取りのみ。
const GAS_ENDPOINT_RE = /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/

type Source = '独自' | 'su_sync_common' | '未設定'

// 有効な設定がどのソース由来かを判定（表示専用）。
//   - readSyncConfig() が null → 未設定
//   - 自前キー kitchen_ws_sync_v1 に RE 一致の endpoint がある → 独自
//   - それ以外（有効設定はあるが自前キー由来でない） → su_sync_common
// su_sync_common の中身検証は readSyncConfig（wsClient）に委ね、ここでは自前キーのみ直接読む。
function computeSource(): Source {
  const cfg = readSyncConfig()
  if (!cfg) return '未設定'
  try {
    const raw = localStorage.getItem('kitchen_ws_sync_v1')
    if (raw) {
      const o = JSON.parse(raw) as { endpoint?: unknown }
      const ep = typeof o.endpoint === 'string' ? o.endpoint.trim() : ''
      if (GAS_ENDPOINT_RE.test(ep)) return '独自'
    }
  } catch {
    /* パース失敗時は自前キー無効とみなす（安全側） */
  }
  return 'su_sync_common'
}

function fmtTime(ms: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('ja-JP', { hour12: false })
  } catch {
    return '—'
  }
}

const FROM_LABEL: Record<string, string> = {
  'kitchen-read': '新しい保存先',
  gas: 'Google（GAS）',
}
function fromLabel(f: ReadFrom): string {
  return f ? FROM_LABEL[f] ?? '—' : '—'
}

const ROSTER_LABEL: Record<string, string> = {
  idle: '未取得',
  pending: '取得中…',
  ok: '取得済み',
  fallback: '既定候補のみ（連携なし/失敗）',
}

export default function WsSettingsPage() {
  // ライブな取得状態はストアから購読（roster/counts の status・時刻を反映）
  const snap = useSyncExternalStore(subscribe, getSnapshot)

  // 入力初期値は現在の有効設定から一度だけ取り込む（endpoint だけ直したい時に token を消さないため）
  const [endpoint, setEndpoint] = useState(() => readSyncConfig()?.endpoint ?? '')
  const [token, setToken] = useState(() => readSyncConfig()?.token ?? '')
  const [source, setSource] = useState<Source>(() => computeSource())

  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pingState, setPingState] = useState<'idle' | 'testing' | 'ok' | 'ng'>('idle')
  const [refreshing, setRefreshing] = useState(false)

  // 新しい保存先の読み取り口（URL と合言葉）。入力初期値は今の設定から一度だけ取り込む
  const [readUrl, setReadUrl] = useState(() => readKitchenReadConfig()?.url ?? '')
  const [readKey, setReadKey] = useState(() => readKitchenReadConfig()?.key ?? '')
  const [readMsg, setReadMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [readPing, setReadPing] = useState<'idle' | 'testing' | 'ok' | 'ng'>('idle')

  const onSaveRead = useCallback(() => {
    const res = saveKitchenReadConfig(readUrl.trim(), readKey.trim())
    if (res.ok) {
      setReadMsg({
        ok: true,
        text: readUrl.trim() || readKey.trim() ? '保存しました' : '新しい保存先の読み取り口を外しました（Google から読みます）',
      })
    } else {
      setReadMsg({ ok: false, text: res.error ?? '保存に失敗しました' })
    }
  }, [readUrl, readKey])

  const onPingRead = useCallback(async () => {
    setReadPing('testing')
    try {
      const ok = await pingKitchenRead()
      setReadPing(ok ? 'ok' : 'ng')
    } catch {
      setReadPing('ng')
    }
  }, [])

  const onSave = useCallback(() => {
    const res = saveSyncConfig(endpoint.trim(), token.trim())
    if (res.ok) {
      setSaveMsg({ ok: true, text: endpoint.trim() ? '保存しました' : '連携をオフにしました（endpoint 空）' })
      setSource(computeSource())
    } else {
      setSaveMsg({ ok: false, text: res.error ?? '保存に失敗しました' })
    }
  }, [endpoint, token])

  const onPing = useCallback(async () => {
    setPingState('testing')
    try {
      const ok = await pingWs()
      setPingState(ok ? 'ok' : 'ng')
    } catch {
      setPingState('ng')
    }
  }, [])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshNow()
    } catch {
      /* refreshNow は例外を漏らさない設計だが、UI 側でも握って状態を戻す */
    } finally {
      setRefreshing(false)
    }
  }, [])

  const rosterLabel = ROSTER_LABEL[snap.rosterStatus] ?? snap.rosterStatus
  const rosterCount = snap.rosterStatus === 'ok' ? snap.rosterNames?.length ?? 0 : null
  // 直近に読めた読み先（snap が変わるたびに読み直す・値そのものは持たない）
  const lastFrom = getLastReadFrom()

  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-lg font-bold text-slate-800 mb-1">連携設定</h1>
      <p className="text-xs text-slate-500 mb-4">
        シフト職員名簿・在籍者数を読み取り専用で取得します（書き込みは行いません）。
      </p>

      {/* 接続状態 */}
      <section className="bg-white border rounded-lg p-4 mb-4">
        <h2 className="text-sm font-bold text-slate-700 mb-2">接続状態</h2>
        <dl className="text-sm space-y-1.5">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">設定ソース</dt>
            <dd className="font-medium text-slate-800">
              {source === '独自' ? '独自（このアプリで設定）' : source === 'su_sync_common' ? '共有（su_sync_common）' : '未設定'}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">職員候補</dt>
            <dd className="text-slate-800">
              {rosterLabel}
              {rosterCount != null && <span className="text-slate-500">（{rosterCount}名）</span>}
              <span className="text-slate-400 ml-2">{fmtTime(snap.rosterAt)}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">在籍者数</dt>
            <dd className="text-slate-800">
              {snap.counts ? (
                <>
                  在籍 {snap.counts.residents} 名（うち入院 {snap.counts.hospitalized} 名）
                </>
              ) : (
                '未取得'
              )}
              <span className="text-slate-400 ml-2">{fmtTime(snap.countsAt)}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">読み先</dt>
            <dd className="text-slate-800">
              在籍者数 {fromLabel(lastFrom.counts)}・職員 {fromLabel(lastFrom.roster)}
            </dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="bg-slate-100 border text-slate-700 text-sm rounded px-4 min-h-[40px] disabled:opacity-50"
          >
            {refreshing ? '更新中…' : '候補を今すぐ更新'}
          </button>
        </div>
      </section>

      {/* 接続先 */}
      <section className="bg-white border rounded-lg p-4">
        <h2 className="text-sm font-bold text-slate-700 mb-3">接続先</h2>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            エンドポイント（GAS /exec URL・空欄で連携オフ）
            <input
              type="url"
              value={endpoint}
              onChange={(e) => {
                setEndpoint(e.target.value)
                setSaveMsg(null)
                setPingState('idle')
              }}
              placeholder="https://script.google.com/macros/s/.../exec"
              autoComplete="off"
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            トークン
            <input
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setSaveMsg(null)
                setPingState('idle')
              }}
              autoComplete="off"
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-slate-400">
            読み取り専用（閲覧のみ）のトークンを推奨します。値はこの端末の localStorage にのみ保存されます。
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={onSave}
              className="bg-emerald-600 text-white text-sm rounded px-5 min-h-[40px] font-medium"
            >
              保存
            </button>
            <button
              onClick={onPing}
              disabled={pingState === 'testing'}
              className="bg-slate-100 border text-slate-700 text-sm rounded px-4 min-h-[40px] disabled:opacity-50"
            >
              {pingState === 'testing' ? 'テスト中…' : '接続テスト'}
            </button>
            {pingState === 'ok' && <span className="text-emerald-600 text-sm">OK</span>}
            {pingState === 'ng' && <span className="text-red-600 text-sm">NG（設定・トークンを確認）</span>}
          </div>

          {saveMsg && (
            <p className={`text-sm ${saveMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{saveMsg.text}</p>
          )}
        </div>
      </section>

      {/* 新しい保存先の読み取り口（kitchen-read） */}
      <section className="bg-white border rounded-lg p-4 mt-4">
        <h2 className="text-sm font-bold text-slate-700 mb-1">新しい保存先の読み取り口</h2>
        <p className="text-xs text-slate-500 mb-3">
          設定すると、在籍者数と職員の氏名を先に新しい保存先から読みます。読めない時は上の接続先（Google）から読みます。空欄で保存すると外します。
        </p>
        <div className="space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            URL
            <input
              type="url"
              value={readUrl}
              onChange={(e) => {
                setReadUrl(e.target.value)
                setReadMsg(null)
                setReadPing('idle')
              }}
              placeholder="https://….supabase.co/functions/v1/kitchen-read"
              autoComplete="off"
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            合言葉
            <input
              type="password"
              value={readKey}
              onChange={(e) => {
                setReadKey(e.target.value)
                setReadMsg(null)
                setReadPing('idle')
              }}
              autoComplete="off"
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-slate-400">管理者から受け取った値を入れてください。値はこの端末の localStorage にのみ保存されます。</p>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              onClick={onSaveRead}
              className="bg-emerald-600 text-white text-sm rounded px-5 min-h-[40px] font-medium"
            >
              保存
            </button>
            <button
              onClick={onPingRead}
              disabled={readPing === 'testing'}
              className="bg-slate-100 border text-slate-700 text-sm rounded px-4 min-h-[40px] disabled:opacity-50"
            >
              {readPing === 'testing' ? 'テスト中…' : '接続テスト'}
            </button>
            {readPing === 'ok' && <span className="text-emerald-600 text-sm">OK</span>}
            {readPing === 'ng' && <span className="text-red-600 text-sm">NG（保存したか・URL・合言葉を確認）</span>}
          </div>

          {readMsg && <p className={`text-sm ${readMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>{readMsg.text}</p>}
        </div>
      </section>
    </div>
  )
}
