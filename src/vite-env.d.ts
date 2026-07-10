/// <reference types="vite/client" />

// ビルド時に埋め込まれる環境変数の型。VITE_ プレフィックスのみクライアントへ露出する。
// 施設名・職員名候補は未設定でも src/lib/facility.ts が既定値へフォールバックするため任意。
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_FACILITY_NAME?: string
  readonly VITE_REPORT_INSPECTORS?: string
  readonly VITE_REPORT_COOKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
