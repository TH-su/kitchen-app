# 厨房メニュー管理アプリ

ラウレアハレ厨房の「献立・作業指示書」Excel運用を、複数端末でリアルタイム共有・編集できるWebアプリへ移行するプロジェクト。

## 技術スタック

- フロント: Vite + React + TypeScript + Tailwind CSS（SPA）
- バックエンド: Supabase（PostgreSQL / Realtime / Auth / RLS）
- ホスティング: GitHub Pages（`base: './'` で相対パス配信）

## データモデル（中核）

| テーブル | 役割 |
|---|---|
| `menu_sets` | 献立セット番号（魚⑨等）。主食/メイン/副①/副②/汁のdishを参照 |
| `dishes` | 料理（主食/メイン/副/汁/おやつ）。セット内料理は番号スコープ |
| `dish_ingredients` | レシピ明細（料理×食材×1人分g） |
| `ingredients` | 食材マスタ（成分表 food_code に紐付け） |
| `food_composition` | 食品成分表（100gあたり栄養） |
| `daily_menus` | 日々の献立（日付・食数・朝昼夕セット・おやつ） |

集計ビュー: `v_dish_nutrition` / `v_menuset_nutrition` / `v_daily_nutrition`（栄養）, `v_daily_ingredient_totals`（食数連動の総使用量）

## セットアップ手順

### 1. Supabase プロジェクト作成（初回のみ）
1. https://supabase.com でプロジェクト作成
2. SQL Editor で `supabase/migrations/0001_init.sql` を実行（スキーマ＋RLS＋ビュー）
3. Settings > API から URL / anon key / service_role key を取得

### 2. 環境変数
```bash
cp .env.example .env
# .env を編集して Supabase の値を設定
```

### 3. 依存インストール
```bash
npm install
```

### 4. Excelデータ移行
```bash
# 元Excelを解析して data/*.json を生成（要: 共有ボリュームへのアクセス）
EXCEL_PATH="/Volumes/.../献立・作業指示書（改良版） .xlsx" npm run parse
# Supabase へ投入
npm run seed
```

### 5. 開発サーバ
```bash
npm run dev
```

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバ起動 |
| `npm run build` | 本番ビルド |
| `npm run parse` | Excel → 中間JSON（data/） |
| `npm run seed` | 中間JSON → Supabase 投入 |
