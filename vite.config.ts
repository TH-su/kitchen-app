import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Content-Security-Policy（2026-11-28 点検の指摘「CSP が無い」への対応）。
// 公開元 th-su.github.io を care-tools・care-log と共有し、同じ localStorage にログインのセッションや
// GAS の合言葉が入っている。この画面で動くのは自分の束だけ・送り先は決まった所だけにする。
//   connect-src … Supabase（REST・ログイン・Realtime の wss・kitchen-read）と GAS の exec（＋転送先）
//   style/font  … Google Fonts（Zen Maru Gothic）
//   img-src     … 同梱の画像と施設長印（data URL か、同じ Supabase の Storage に置いた画像）
// 本番ビルドの時だけ差し込む: 開発サーバー（npm run dev）は @vitejs/plugin-react がインラインの
// スクリプトを足すため、script-src 'self' だと画面が出なくなる。
const SUPABASE_HOST = 'jhbernqawjrzqwrmqrih.supabase.co'
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src 'self' data: blob: https://${SUPABASE_HOST}`,
  `connect-src 'self' https://${SUPABASE_HOST} wss://${SUPABASE_HOST} https://script.google.com https://script.googleusercontent.com`,
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

function cspMeta(): Plugin {
  return {
    name: 'su-csp-meta',
    apply: 'build',
    // charset の直後（フォントの link より前）に置く。charset が見つからなければビルドを止める。
    transformIndexHtml(html) {
      const anchor = '<meta charset="UTF-8" />'
      if (html.indexOf(anchor) < 0) throw new Error('su-csp-meta: index.html に charset の meta が見つかりません')
      return html.replace(anchor, `${anchor}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
    },
  }
}

// base: './' → GitHub Pages のサブパス配信でも相対パスで動作する
export default defineConfig({
  plugins: [react(), cspMeta()],
  base: './',
})
