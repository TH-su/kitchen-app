import { useState } from 'react'
import { createReloadBatch, type ReloadBatch } from '../lib/reloadBatch'

// 保存の後の取り直しをまとめる仕組みを、画面1つ（このフックを呼んだ部品が出ている間）ごとに1つ作る（2026-10-28）。
// アプリ全体で共有しない＝ほかの画面で止まった保存が、この画面の取り直しを止めない
export function useReloadBatch(): ReloadBatch {
  const [batch] = useState(() => createReloadBatch())
  return batch
}
