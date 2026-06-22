import { useState } from 'react'
import { fetchDishesByType, type SimpleDish } from '../lib/queries'
import { createSimpleDish, updateSimpleDish, deleteSimpleDish } from '../lib/mutations'
import { useLoader } from '../hooks/useLoader'
import { useRealtime } from '../hooks/useRealtime'
import { useAuth } from '../hooks/useAuth'

export default function SimpleListPage({ type, title }: { type: 'snack' | 'side'; title: string }) {
  const { editable } = useAuth()
  const { data, loading, error, reload } = useLoader(() => fetchDishesByType(type), [type])
  useRealtime(['dishes'], reload)
  const items = data ?? []

  const [editId, setEditId] = useState<number | null>(null) // 0 = 新規
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const startNew = () => {
    setEditId(0)
    setCode('')
    setName('')
    setErr(null)
  }
  const startEdit = (d: SimpleDish) => {
    setEditId(d.id)
    setCode(d.code ?? '')
    setName(d.name)
    setErr(null)
  }
  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      if (editId === 0) await createSimpleDish(type, code, name)
      else if (editId) await updateSimpleDish(editId, code, name)
      setEditId(null)
      reload()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setBusy(false)
    }
  }
  const onDelete = async (d: SimpleDish) => {
    if (deleting) return
    if (!window.confirm(`「${d.name}」を削除しますか？`)) return
    setDeleting(true)
    setErr(null)
    try {
      await deleteSimpleDish(d.id)
      reload()
    } catch (e: any) {
      setErr(String(e?.message ?? e))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold">
          {title}（{items.length}件）
        </h2>
        {editable && editId === null && (
          <button onClick={startNew} className="bg-emerald-600 text-white text-sm rounded px-3 min-h-[40px]">
            ＋ 追加
          </button>
        )}
      </div>
      {(error || err) && <p className="text-red-600 text-sm mb-2">エラー: {error || err}</p>}
      {editId !== null && (
        <div className="bg-white border rounded p-3 mb-3 flex flex-wrap gap-2 items-center">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="番号(例 お69)"
            className="border rounded px-2 py-2 text-sm w-32"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="名称"
            className="border rounded px-2 py-2 text-sm flex-1 min-w-[8rem]"
          />
          <button
            onClick={submit}
            disabled={busy || !name.trim() || !code.trim()}
            className="bg-emerald-600 text-white text-sm rounded px-3 min-h-[40px] disabled:opacity-50"
          >
            保存
          </button>
          <button onClick={() => setEditId(null)} className="text-slate-500 text-sm px-2 min-h-[40px]">
            取消
          </button>
        </div>
      )}
      {loading && items.length === 0 ? (
        <p className="text-slate-500">読み込み中…</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400">データなし</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {items.map((d) => (
            <div key={d.id} className="bg-white rounded border px-3 py-2 text-sm flex items-center justify-between gap-2">
              <span className="truncate">
                <span className="text-emerald-700 font-semibold mr-1">{d.code}</span>
                {d.name}
              </span>
              {editable && (
                <span className="flex gap-4 shrink-0">
                  <button
                    onClick={() => startEdit(d)}
                    className="inline-flex items-center min-h-[40px] px-2 text-emerald-700"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => onDelete(d)}
                    disabled={deleting}
                    className="inline-flex items-center min-h-[40px] px-2 text-red-500 disabled:opacity-50"
                  >
                    削除
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
