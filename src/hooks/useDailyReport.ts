// 検食簿・給食日誌 共通の state / 自動反映の永続化(autosave) / 手動保存フック。
//
// 【なぜ autosave が要るか】
//   自動反映は従来 React state にしか入らず、当日中に誰も「保存」を押さないと DB は空のまま。
//   applyAuto は menuDate !== todayStr() で即 return するため、翌日その日を開いても再適用されず
//   自動反映内容が完全に消失していた（本フックで解消）。
//
// 【先祖返り防止の核心】
//   autosave の payload は必ず「DBの最新保存値 + 自動反映」から作り、画面 state（手動編集・書きかけ
//   テキストを含む）からは絶対に作らない。表示への注入も「DBで空 ∧ 自動値あり ∧ 画面でも空」に限定する。
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { fetchReportColumn, saveDailyReport, type DailyMenuFull } from '../lib/daily'
import { isEmpty } from '../lib/reports'
import { todayStr } from '../lib/date'
import { getMasterAt, resolveMaster, subscribe } from '../lib/staffStore'
import type { ReloadBatch } from '../lib/reloadBatch'
import { useReloadBatch } from './useReloadBatch'

type Col = 'kenshoku' | 'nisshi'

// 「DBで空 ∧ 自動値あり ∧ 画面でも空」のフィールドだけを画面へ注入する。
// 手動編集・書きかけ・手動クリア（保存値を消そうとしている最中）を一切潰さない。
function mergeNewAutoFields<T extends Record<string, any>>(cur: T, base: T, auto: T): T {
  const out: any = { ...cur }
  let changed = false
  for (const sec of Object.keys(base)) {
    const b = base[sec]
    const a = auto[sec]
    const c = cur[sec]
    if (!b || !a || !c) continue
    let secOut: any = null
    for (const f of Object.keys(a)) {
      if (isEmpty(b[f]) && !isEmpty(a[f]) && isEmpty(c[f])) {
        if (!secOut) secOut = { ...c }
        secOut[f] = a[f]
      }
    }
    if (secOut) {
      out[sec] = secOut
      changed = true
    }
  }
  return changed ? (out as T) : cur
}

export function useDailyReport<T extends Record<string, any>>(cfg: {
  data: DailyMenuFull | null
  editable: boolean
  reload: () => void
  column: Col
  empty: () => T
  merge: (base: T, saved: any) => T
  applyAuto: (saved: T, menuDate: string, editable: boolean) => T
  // 保存の後の取り直しをまとめる仕組み（2026-10-28）。日別の画面は検食簿と給食日誌で同じものを渡し、
  // 同時に走った保存の後の取り直しを1回にする。渡さない時（一括印刷の画面など）はこの呼び出しだけのものを使う
  afterSave?: ReloadBatch
}) {
  const { data, editable, reload, column, empty, merge, applyAuto } = cfg
  const ownBatch = useReloadBatch()
  const afterSave = cfg.afterSave ?? ownBatch
  const afterSaveRef = useRef(afterSave)
  afterSaveRef.current = afterSave

  // 既定の担当者は職員マスタ(report_staff)由来（reports.ts の applyAuto → staffStore.defaults()）。
  // マスタはログイン後に非同期で届くため、その時刻を購読して自動反映をやり直す（下の (a2)）。
  const masterAt = useSyncExternalStore(subscribe, getMasterAt)

  const [v, setV] = useState<T>(empty)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const savedRef = useRef('') // 永続化済みスナップショット（dirty 判定の基準）
  const writeLock = useRef(false) // autosave 同士 / autosave と手動 save の相互排他

  // interval / effect から常に最新を見るための ref（stale closure 回避）
  const dataRef = useRef(data)
  const reloadRef = useRef(reload)
  dataRef.current = data
  reloadRef.current = reload

  const autoPersist = useCallback(async () => {
    const d = dataRef.current
    if (!editable || !d) return // data 無しで走らせない（phantom 行 INSERT 防止）
    if (d.menu_date > todayStr()) return // 未来日は書かない（過去日・当日は補完対象）
    if (writeLock.current) return
    writeLock.current = true
    const batch = afterSaveRef.current
    const token = batch.begin()
    let wrote = false
    try {
      // DB の最新値を基底にする＝他端末の保存を取り込み、衝突窓を縮小
      const fresh = await fetchReportColumn(d.menu_date, column)
      const base = merge(empty(), fresh)
      const auto = applyAuto(base, d.menu_date, editable)
      const baseStr = JSON.stringify(base)
      const autoStr = JSON.stringify(auto)
      wrote = autoStr !== baseStr
      if (wrote) await saveDailyReport(d.menu_date, { [column]: auto } as any)
      savedRef.current = autoStr // 保存済み＝「未保存」バッジを解消
      setV((cur) => mergeNewAutoFields(cur, base, auto))
    } catch {
      // 失敗しても表示・savedRef は変えない（値を消さない）。次の tick で自動再挑戦
      wrote = false
      console.warn(`[${column}] 自動保存を見送りました（次回再試行）`)
    } finally {
      writeLock.current = false
      // 書いた時だけ取り直す。同時に走っている保存があれば、全部終わった後に1回だけ取り直す
      batch.end(token, wrote ? reloadRef.current : null)
    }
  }, [editable, column, empty, merge, applyAuto])

  // (a) data → state 同期＋自動反映＋即時 autosave
  useEffect(() => {
    const saved = merge(empty(), (data as any)?.[column] ?? null)
    setV(applyAuto(saved, data?.menu_date ?? '', editable))
    savedRef.current = JSON.stringify(saved)
    void autoPersist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.menu_date, data?.id, editable])

  // (a2) 職員マスタが後から届いた時の再適用。
  //   applyAuto の既定担当者はマスタ由来のため、(a) の時点でマスタ未取得だと担当者だけが空のまま残る。
  //   ★ここで setV(applyAuto(...)) を直接やってはいけない（入力中の値を巻き戻す）。autoPersist 経由なら
  //     基底はDBの最新値、画面への注入は mergeNewAutoFields（DBで空 ∧ 自動値あり ∧ 画面でも空）に
  //     限定されるため、手動編集・書きかけ・手動クリアを一切潰さない。
  //   マスタ取得自体もここで促す（単一飛行・TTL はストア側。useStaffCandidates と重複しても吸収される）。
  useEffect(() => {
    void resolveMaster()
  }, [])
  useEffect(() => {
    if (!editable) return
    if (!masterAt) return // 未取得のうちは (a) の結果のまま（env フォールバック）
    void autoPersist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterAt, editable, data?.menu_date, data?.id])

  // (b) しきい値跨ぎ（例 07:49 に開いたまま 07:50 になる）を 60 秒ごとに反映＋保存
  useEffect(() => {
    if (!editable) return
    const t = setInterval(() => void autoPersist(), 60_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, data?.menu_date, data?.id])

  const dirty = editable && JSON.stringify(v) !== savedRef.current

  // (c) 手動編集が未保存のまま離脱するのを警告（autosave は自動反映分のみを保存するため）
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // 手動保存（従来どおり画面の値をそのまま確定）。autosave と writeLock を共有して順序ハザードを排除
  const save = useCallback(async () => {
    if (saving || writeLock.current || !data) return
    writeLock.current = true
    setSaving(true)
    setSaveError(null)
    const batch = afterSaveRef.current
    const token = batch.begin()
    let wrote = false
    try {
      await saveDailyReport(data.menu_date, { [column]: v } as any)
      savedRef.current = JSON.stringify(v)
      wrote = true
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    } finally {
      setSaving(false)
      writeLock.current = false
      batch.end(token, wrote ? reloadRef.current : null)
    }
  }, [saving, data, column, v])

  return { v, setV, dirty, saving, saveError, save }
}
