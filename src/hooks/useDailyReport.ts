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
import { rebaseReport } from '../lib/reportRebase'
import { registerUnsaved } from '../lib/unsavedGuard'
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
  // 画面の値を作った元（最後に知った DB の値）。この元と違う欄＝この画面で触った欄（2026-11-28 点検）
  const baseRef = useRef<T>(empty())
  const keyRef = useRef('') // 今の画面の日と行（同じ日の取り直しかを見分ける）
  const writeLock = useRef(false) // autosave 同士 / autosave と手動 save の相互排他
  const lockWait = useRef<Promise<void> | null>(null) // 走っている autosave の終わり（手動保存が待つ）

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
    let release!: () => void
    lockWait.current = new Promise<void>((r) => (release = r))
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
      // この画面で触っていない欄は DB の最新（他の端末の保存＋自動反映）へ寄せ、触った欄は残す。
      // 元（baseRef）も同じ最新に進める＝未保存の印は「この画面で触った欄があるか」だけを表す
      // （以前は元だけ最新に進めて画面は古いままにしたため、他の端末の保存で「未保存」になり、
      //   その後の手動保存が他の端末の欄を古い値で上書きしていた＝2026-11-28 点検 高1）
      if (keyRef.current === `${d.menu_date}|${d.id}`) {
        const prevBase = baseRef.current
        baseRef.current = auto
        savedRef.current = autoStr // 保存済み＝「未保存」バッジを解消
        setV((cur) => mergeNewAutoFields(rebaseReport(cur, prevBase, auto), base, auto))
      }
    } catch {
      // 失敗しても表示・savedRef は変えない（値を消さない）。次の tick で自動再挑戦
      wrote = false
      console.warn(`[${column}] 自動保存を見送りました（次回再試行）`)
    } finally {
      writeLock.current = false
      lockWait.current = null
      release()
      // 書いた時だけ取り直す。同時に走っている保存があれば、全部終わった後に1回だけ取り直す
      batch.end(token, wrote ? reloadRef.current : null)
    }
  }, [editable, column, empty, merge, applyAuto])

  // (a) data → state 同期＋自動反映＋即時 autosave
  useEffect(() => {
    const saved = merge(empty(), (data as any)?.[column] ?? null)
    keyRef.current = `${data?.menu_date ?? ''}|${data?.id ?? ''}`
    baseRef.current = saved
    setV(applyAuto(saved, data?.menu_date ?? '', editable))
    savedRef.current = JSON.stringify(saved)
    void autoPersist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.menu_date, data?.id, editable])

  // (a1) 同じ日の取り直し（保存の後・リアルタイムの知らせ・窓に戻った時）で届いた値を、
  //   この画面で触っていない欄にだけ入れる（触った欄・書きかけは残す）。日や行が変わった時は (a) が作り直す
  useEffect(() => {
    if (!data) return
    if (keyRef.current !== `${data.menu_date}|${data.id}`) return
    const next = merge(empty(), (data as any)?.[column] ?? null)
    const nextStr = JSON.stringify(next)
    if (nextStr === JSON.stringify(baseRef.current)) return
    const prevBase = baseRef.current
    baseRef.current = next
    savedRef.current = nextStr
    setV((cur) => rebaseReport(cur, prevBase, next))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

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
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  // 画面の中で移る前の確かめ（日付の◀▶・← 一覧・上のタブ）に、この帳票の未保存を数える（2026-11-28 点検 中4）
  useEffect(() => registerUnsaved(() => dirtyRef.current), [])

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

  // 手動保存。保存の直前に DB の最新を読み、この画面で触った欄だけを最新に重ねて書く
  // （開いたままの端末が、他の端末の保存を古い値で上書きしない＝2026-11-28 点検 高1）。
  // autosave と writeLock を共有して順序ハザードを排除。autosave の最中に押した時は、終わるのを待って続ける（黙って無視しない）
  const vRef = useRef(v)
  vRef.current = v
  const save = useCallback(async () => {
    if (saving || !data) return
    setSaving(true)
    setSaveError(null)
    for (let i = 0; i < 50 && writeLock.current; i++) await (lockWait.current ?? new Promise((r) => setTimeout(r, 100)))
    if (writeLock.current) {
      setSaving(false)
      setSaveError('自動保存が終わりません。少し待ってから、もう一度保存してください。')
      return
    }
    writeLock.current = true
    const batch = afterSaveRef.current
    const token = batch.begin()
    let wrote = false
    try {
      const key = `${data.menu_date}|${data.id}`
      const mine = vRef.current
      const fresh = await fetchReportColumn(data.menu_date, column)
      // 最新が読めない（列が無い・まだ行が無い）時は画面の値のまま書く（重ねる相手が無い）
      const merged = fresh == null ? mine : rebaseReport(mine, baseRef.current, merge(empty(), fresh))
      await saveDailyReport(data.menu_date, { [column]: merged } as any)
      if (keyRef.current === key) {
        baseRef.current = merged
        savedRef.current = JSON.stringify(merged)
        // 保存を待つ間に書き足した欄は残し、それ以外は保存した値（他の端末の分を含む）にそろえる
        setV((cur) => rebaseReport(cur, mine, merged))
      }
      wrote = true
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    } finally {
      setSaving(false)
      writeLock.current = false
      batch.end(token, wrote ? reloadRef.current : null)
    }
  }, [saving, data, column, merge, empty])

  return { v, setV, dirty, saving, saveError, save }
}
