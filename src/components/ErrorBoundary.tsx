import { Component, type ErrorInfo, type ReactNode } from 'react'

// 画面描画中の想定外例外を捕捉し、アプリ全体の白画面化を防ぐ。
// フォールバックUIを表示しつつ、ヘッダ/ナビ（この境界の外側）は生き続けるため
// 別タブへ移動すれば復帰できる。resetKey（現在パス）が変わったら自動で復帰する。
interface Props {
  children: ReactNode
  resetKey?: unknown
}
interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 原因追跡のため詳細を残す（要配慮個人情報は扱わないアプリのため出力可）
    console.error('画面の描画中にエラーが発生しました:', error, info)
  }

  componentDidUpdate(prev: Props) {
    // 画面遷移（パス変化）で自動的に通常表示へ復帰＝別タブへ移動すれば元に戻る
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="max-w-lg mx-auto mt-10 bg-white border border-red-200 rounded-lg p-6 text-center">
          <h2 className="text-lg font-bold text-red-700 mb-2">画面の表示中にエラーが発生しました</h2>
          <p className="text-sm text-slate-600 mb-4">
            お手数ですが「再読み込み」するか、上のメニューから別の画面へ移動してください。
            <br />
            保存済みのデータは失われていません。
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="bg-emerald-600 text-white text-sm rounded px-5 min-h-[44px] hover:bg-emerald-700"
          >
            再読み込み
          </button>
          <p className="mt-4 text-xs text-slate-400 break-all">
            {String(this.state.error?.message ?? this.state.error)}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
