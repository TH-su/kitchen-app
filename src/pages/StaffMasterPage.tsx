import { useCallback, useEffect, useState } from 'react'
import {
  fetchAllReportStaff,
  insertReportStaff,
  updateReportStaff,
  deleteReportStaff,
  type ReportStaff,
} from '../lib/staffMaster'
import { refreshMaster } from '../lib/staffStore'
import { REPORT_INSPECTORS, REPORT_COOKS } from '../lib/facility'
import { useAuth } from '../hooks/useAuth'

// 検食簿・給食日誌の職員マスタ。/staff-master（認証ゲート内・ヘッダーの「👤 職員」から）。
//
// 候補の確定仕様: 調理担当者＝調理員のみ／検食者＝検食者＋調理員。
// マイグレーション 0007 未適用なら案内を出し、施設設定(env)の候補で運用を続ける（画面は壊さない）。

const BTN = 'min-h-[44px] px-4 rounded border bg-white text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50'
const INPUT = 'border rounded px-2 min-h-[44px] text-base'

const MIGRATION_SQL = `-- supabase/migrations/0007_report_staff.sql を SQL Editor に貼り付けて実行してください`

export default function StaffMasterPage() {
  const { editable } = useAuth()
  const [rows, setRows] = useState<ReportStaff[] | null>(null)
  const [tableMissing, setTableMissing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // 追加フォーム
  const [name, setName] = useState('')
  const [isCook, setIsCook] = useState(true)
  const [isInspector, setIsInspector] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const list = await fetchAllReportStaff()
      if (list === null) {
        setTableMissing(true)
        setRows(null)
      } else {
        setTableMissing(false)
        setRows(list)
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // 変更後は一覧を読み直し、帳票のプルダウンにも即時反映する
  const after = async () => {
    await load()
    await refreshMaster()
  }

  const add = async () => {
    const n = name.trim()
    if (!n) return
    if (!isCook && !isInspector) {
      setErr('「調理員」「検食者」のどちらか一方は選んでください')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await insertReportStaff({ name: n, is_cook: isCook, is_inspector: isInspector })
      setName('')
      await after()
    } catch (e: any) {
      const m = String(e?.message ?? e)
      setErr(/duplicate|unique/i.test(m) ? `「${n}」は既に登録されています` : m)
    } finally {
      setBusy(false)
    }
  }

  const patch = async (r: ReportStaff, p: Partial<ReportStaff>) => {
    // 役割を両方外すと候補に出ない行になるため防ぐ
    const nextCook = p.is_cook ?? r.is_cook
    const nextInspector = p.is_inspector ?? r.is_inspector
    if (!nextCook && !nextInspector) {
      setErr(`${r.name}: 「調理員」「検食者」のどちらか一方は必要です`)
      return
    }
    setBusy(true)
    setErr(null)
    try {
      await updateReportStaff(r.id, p)
      await after()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (r: ReportStaff) => {
    if (!window.confirm(`${r.name} をマスタから削除します。よろしいですか？\n※過去の検食簿・給食日誌に記録された氏名は消えません。`)) return
    setBusy(true)
    setErr(null)
    try {
      await deleteReportStaff(r.id)
      await after()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }

  const cooks = (rows ?? []).filter((r) => r.active && r.is_cook).map((r) => r.name)
  const inspectorsOnly = (rows ?? []).filter((r) => r.active && r.is_inspector).map((r) => r.name)
  const inspectors = Array.from(new Set([...inspectorsOnly, ...cooks]))

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">職員マスタ（検食簿・給食日誌）</h2>
      <p className="text-sm text-slate-600 mb-4">
        調理担当者の候補＝<b>調理員</b>のみ ／ 検食者の候補＝<b>検食者＋調理員</b>（調理員も検食を行うため）。
        1人が両方を兼ねられます。氏名の直接入力（自由記載）は従来どおり可能です。
      </p>

      {tableMissing && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-bold">職員マスタのテーブルが未作成です</p>
          <p className="mt-1">
            現在は施設設定（環境変数）の候補で動作しています（調理員 {REPORT_COOKS.length}名／検食者{' '}
            {Array.from(new Set([...REPORT_INSPECTORS, ...REPORT_COOKS])).length}名）。
            マスタを使うには Supabase の SQL Editor で <code>supabase/migrations/0007_report_staff.sql</code> を実行してください。
          </p>
          <p className="mt-1 text-xs text-amber-800">{MIGRATION_SQL}</p>
        </div>
      )}
      {err && <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</p>}
      {!editable && <p className="mb-3 text-sm text-slate-500">※編集にはログインが必要です</p>}

      {/* 追加フォーム（ラベル常時表示） */}
      {!tableMissing && editable && (
        <div className="bg-white border rounded p-3 mb-4 flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">
            氏名
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add()
              }}
              placeholder="例: 山田"
              aria-label="追加する職員の氏名"
              className={`mt-1 block w-40 ${INPUT}`}
            />
          </label>
          <label className="text-sm inline-flex items-center gap-2 min-h-[44px]">
            <input type="checkbox" checked={isCook} onChange={(e) => setIsCook(e.target.checked)} className="w-5 h-5" />
            調理員
          </label>
          <label className="text-sm inline-flex items-center gap-2 min-h-[44px]">
            <input
              type="checkbox"
              checked={isInspector}
              onChange={(e) => setIsInspector(e.target.checked)}
              className="w-5 h-5"
            />
            検食者
          </label>
          <button
            onClick={add}
            disabled={busy || !name.trim()}
            className="bg-emerald-600 text-white text-sm rounded px-5 min-h-[44px] disabled:opacity-50"
          >
            追加
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : tableMissing ? null : (rows ?? []).length === 0 ? (
        <p className="text-slate-400">まだ登録がありません。上の欄から追加してください（登録0件の間は施設設定の候補で動作します）。</p>
      ) : (
        <table className="w-full border-collapse text-base bg-white">
          <thead>
            <tr className="bg-slate-50">
              <th className="border border-slate-300 px-2 py-1 text-left">氏名</th>
              <th className="border border-slate-300 px-2 py-1 w-24">調理員</th>
              <th className="border border-slate-300 px-2 py-1 w-24">検食者</th>
              <th className="border border-slate-300 px-2 py-1 w-32">状態</th>
              <th className="border border-slate-300 px-2 py-1 w-40">操作</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id} className={r.active ? '' : 'bg-slate-50 text-slate-400'}>
                <td className="border border-slate-300 px-2 py-1">{r.name}</td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={r.is_cook}
                    disabled={!editable || busy}
                    onChange={(e) => void patch(r, { is_cook: e.target.checked })}
                    aria-label={`${r.name} を調理員にする`}
                    className="w-5 h-5"
                  />
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center">
                  <input
                    type="checkbox"
                    checked={r.is_inspector}
                    disabled={!editable || busy}
                    onChange={(e) => void patch(r, { is_inspector: e.target.checked })}
                    aria-label={`${r.name} を検食者にする`}
                    className="w-5 h-5"
                  />
                </td>
                <td className="border border-slate-300 px-2 py-1 text-center text-sm">
                  {r.active ? '使用中' : '使用停止'}
                </td>
                <td className="border border-slate-300 px-2 py-1">
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => void patch(r, { active: !r.active })}
                      disabled={!editable || busy}
                      className={BTN}
                      aria-label={`${r.name} を${r.active ? '使用停止' : '使用再開'}する`}
                    >
                      {r.active ? '使用停止' : '使用再開'}
                    </button>
                    <button
                      onClick={() => void remove(r)}
                      disabled={!editable || busy}
                      className="min-h-[44px] px-3 rounded border border-red-300 bg-white text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
                      aria-label={`${r.name} を削除する`}
                    >
                      削除
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!tableMissing && (rows ?? []).length > 0 && (
        <div className="mt-4 text-sm text-slate-600 bg-white border rounded p-3">
          <p className="font-medium mb-1">現在のプルダウン候補</p>
          <p>調理担当者（{cooks.length}名）: {cooks.join('・') || 'なし'}</p>
          <p>検食者（{inspectors.length}名）: {inspectors.join('・') || 'なし'}</p>
        </div>
      )}
    </div>
  )
}
