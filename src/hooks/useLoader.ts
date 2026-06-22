import { useEffect, useRef, useState } from 'react'

// 非同期データローダ。世代ガードにより、
//  - 高速切替時に遅れて返った stale 応答が新しい結果を上書きしない
//  - アンマウント後の setState を行わない
// reload() は最新の loader クロージャで再取得する（realtime/focus 用）。
export function useLoader<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const gen = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = () => {
    const my = ++gen.current
    setLoading(true)
    loaderRef
      .current()
      .then((d) => {
        if (my !== gen.current) return
        setData(d)
        setError(null)
      })
      .catch((e) => {
        if (my !== gen.current) return
        setError(String(e?.message ?? e))
      })
      .finally(() => {
        if (my !== gen.current) return
        setLoading(false)
      })
  }

  useEffect(() => {
    run()
    return () => {
      // アンマウント／依存変更で世代を進め、in-flight 応答を無効化
      gen.current++
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, loading, error, reload: run }
}
