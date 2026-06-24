# GitHub Pages へのデプロイ手順（厨房メニュー管理アプリ）

push すると `.github/workflows/deploy.yml` が自動でビルド＆公開します。
初回のみ以下の設定が必要です。

## 1. GitHub にリポジトリを作成
- GitHub で新規リポジトリを作成（例: `kitchen-app`）。
- **Public** を推奨（無料アカウントで Pages を使うため。献立データに個人情報は無いので公開可）。
  - Private で公開したい場合は GitHub Pro が必要。

## 2. このフォルダを push
ターミナルで（このフォルダ `施設厨房アプリ` で）:
```bash
git remote add origin https://github.com/<ユーザー名>/kitchen-app.git
git push -u origin main
```

## 3. リポジトリに Secrets を2つ登録
リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で、
ローカルの `.env` と同じ値を登録:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

※ anon キーは公開前提の安全なキー（service_role キーは登録しない・使わない）。

## 4. Pages を有効化
**Settings → Pages → Build and deployment → Source = "GitHub Actions"** を選択。

## 5. 公開
- 上記後に `main` へ push（または Actions タブから手動実行）すると自動デプロイ。
- 公開URL: `https://<ユーザー名>.github.io/kitchen-app/`
- 以降は push するたびに自動更新されます。

## 補足
- ルーティングは HashRouter（URL に `#` が入る）なので Pages のサブパスでも 404 になりません。
- 閲覧は誰でも可・編集は Supabase ログイン必須（RLS で保護）。
