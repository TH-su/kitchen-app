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
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type SetStateAction } from 'react'
import { fetchReportColumn, saveDailyReport, type DailyMenuFull } from '../lib/daily'
import { todayStr } from '../lib/date'
import { getMasterAt, resolveMaster, subscribe } from '../lib/staffStore'
import type { ReloadBatch } from '../lib/reloadBatch'
import { useReloadBatch } from './useReloadBatch'
import { rebaseReport } from '../lib/reportRebase'
import { registerUnsaved } from '../lib/unsavedGuard'

type Col = 'kenshoku' | 'nisshi'

/** 自動保存の待ちの上限（終わらない時は手動保存を止めて知らせる） */
export const AUTOSAVE_WAIT_MS = 5000

/**
 * 画面の状態（2026-11-28 点検で1つにまとめた）。3つを必ず同じ時点の組で持つ:
 *   v     … 画面の値
 *   base  … 画面の値を作った元＝最後に知った DB の値に自動反映を当てた物。v と違う欄＝この画面で触った欄
 *           （自動反映の値は「触っていない」扱い＝他の端末の手直しを自動の既定値で戻さない）
 *   saved … DB に保存済みの値（JSON）。「未保存」の印の基準（自動反映がまだ保存されていない時も出す）
 * 別々の ref に持っていた時は、描画の前後で「新しい元」と「古い画面の値」を組にして比べ、
 * 他の端末の欄を「触った欄」と取り違えて古い値で書くことがあった。
 */
type St<T> = { v: T; base: T; saved: string }

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

  const [st, setSt] = useState<St<T>>(() => {
    const e = empty()
    return { v: e, base: e, saved: '' }
  })
  const stRef = useRef(st) // 描画した最新の組（手動保存が同じ時点の v と base を取る）
  stRef.current = st
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const keyRef = useRef('') // 今の画面の日と行（同じ日の取り直しかを見分ける）
  const writeLock = useRef(false) // autosave 同士 / autosave と手動 save の相互排他
  const lockWait = useRef<Promise<void> | null>(null) // 走っている autosave の終わり（手動保存が待つ）

  // 画面の値を変える入口（部品の setK / setNz）。元と保存済みはそのまま
  const setV = useCallback((u: SetStateAction<T>) => {
    setSt((s) => ({ ...s, v: typeof u === 'function' ? (u as (p: T) => T)(s.v) : u }))
  }, [])

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
      const autoStr = JSON.stringify(auto)
      wrote = autoStr !== JSON.stringify(base)
      if (wrote) await saveDailyReport(d.menu_date, { [column]: auto } as any)
      // この画面で触っていない欄は DB の最新（他の端末の保存＋自動反映）へ寄せ、触った欄は残す（同じ時点の組で比べる）
      if (keyRef.current === `${d.menu_date}|${d.id}`) {
        setSt((s) => ({ v: rebaseReport(s.v, s.base, auto), base: auto, saved: autoStr }))
      }
    } catch {
      // 失敗しても表示・保存済みの印は変えない（値を消さない）。次の tick で自動再挑戦
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

  // (a) data → state 同期＋自動反映＋即時 autosave（日・行が変わった時は作り直す）
  useEffect(() => {
    const saved = merge(empty(), (data as any)?.[column] ?? null)
    const auto = applyAuto(saved, data?.menu_date ?? '', editable)
    keyRef.current = `${data?.menu_date ?? ''}|${data?.id ?? ''}`
    setSt({ v: auto, base: auto, saved: JSON.stringify(saved) })
    void autoPersist()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.menu_date, data?.id, editable])

  // (a1) 同じ日の取り直し（保存の後・リアルタイムの知らせ・窓に戻った時）で届いた値を、
  //   この画面で触っていない欄にだけ入れる（触った欄・書きかけは残す）。日や行が変わった時は (a) が作り直す
  useEffect(() => {
    if (!data) return
    if (keyRef.current !== `${data.menu_date}|${data.id}`) return
    const saved = merge(empty(), (data as any)?.[column] ?? null)
    const auto = applyAuto(saved, data.menu_date, editable)
    const savedStr = JSON.stringify(saved)
    setSt((s) => {
      if (s.saved === savedStr && JSON.stringify(s.base) === JSON.stringify(auto)) return s
      return { v: rebaseReport(s.v, s.base, auto), base: auto, saved: savedStr }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // (a2) 職員マスタが後から届いた時の再適用。
  //   applyAuto の既定担当者はマスタ由来のため、(a) の時点でマスタ未取得だと担当者だけが空のまま残る。
  //   ★ここで画面の値を直接 applyAuto で作り直してはいけない（入力中の値を巻き戻す）。autoPersist 経由なら
  //     基底はDBの最新値、画面へは「この画面で触っていない欄」だけが入るため、手動編集・書きかけ・手動クリアを潰さない。
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

  const v = st.v
  const vStr = JSON.stringify(v)
  const dirty = editable && vStr !== st.saved
  // この画面で触った欄があるか（自動反映の値は数えない）。画面の中で移る前の確かめに使う
  const touched = editable && vStr !== JSON.stringify(st.base)
  const touchedRef = useRef(touched)
  touchedRef.current = touched
  // 画面の中で移る前の確かめ（日付の◀▶・← 一覧・上のタブ）に、この帳票の書きかけを数える（2026-11-28 点検 中4）
  useEffect(() => registerUnsaved(() => touchedRef.current), [])

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
  const save = useCallback(async () => {
    if (saving || !data) return
    setSaving(true)
    setSaveError(null)
    if (writeLock.current) {
      const until = Date.now() + AUTOSAVE_WAIT_MS
      while (writeLock.current && Date.now() < until) {
        const left = until - Date.now()
        await Promise.race([lockWait.current ?? Promise.resolve(), new Promise((r) => setTimeout(r, Math.min(100, left)))])
      }
      // 待ちが解けた直後は、自動保存が入れた値がまだ描画されていない。1回描画を待ってから、同じ時点の組を取る
      await new Promise((r) => setTimeout(r, 0))
    }
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
      // 画面の値と元は、同じ時点の組で取る（await の前）
      const snap = stRef.current
      const mine = snap.v
      const fresh = await fetchReportColumn(data.menu_date, column)
      // 最新が読めない（列が無い・まだ行が無い）時は画面の値のまま書く（重ねる相手が無い）
      const merged =
        fresh == null ? mine : rebaseReport(mine, snap.base, applyAuto(merge(empty(), fresh), data.menu_date, editable))
      await saveDailyReport(data.menu_date, { [column]: merged } as any)
      if (keyRef.current === key) {
        const mergedStr = JSON.stringify(merged)
        // 保存を待つ間に書き足した欄は残し、それ以外は保存した値（他の端末の分を含む）にそろえる
        setSt((s) => ({ v: rebaseReport(s.v, mine, merged), base: merged, saved: mergedStr }))
      }
      wrote = true
    } catch (e: any) {
      setSaveError(String(e?.message ?? e))
    } finally {
      setSaving(false)
      writeLock.current = false
      batch.end(token, wrote ? reloadRef.current : null)
    }
  }, [saving, data, column, merge, empty, applyAuto, editable])

  return { v, setV, dirty, saving, saveError, save }
}
