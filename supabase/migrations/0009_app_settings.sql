-- =====================================================================
-- 0009: アプリ設定（app_settings）— 施設名を配信JSから外してDBへ移す
--   適用方法: Supabase ダッシュボード > SQL Editor に貼り付けて実行（冪等）
--
-- 背景:
--   施設名はこれまで VITE_FACILITY_NAME（ビルド時の環境変数）で供給していたが、VITE_ 変数は
--   公開バンドル dist/assets/index-*.js へそのまま埋め込まれて配信される（2026-08-10 実測で確認）。
--   氏名（0007 report_staff）と同じく、ログイン必須のDBから読む形へ移す。
--
-- ・key/value の汎用1行設定テーブル。今のところ key='facility_name' のみ使う。
-- ・★read も authenticated 限定にする（0007・0008 と同方針）。施設名は施設を特定する情報であり、
--   匿名で読めると DB へ移した意味が無くなるため（anon キーは公開バンドルに含まれる）。
-- ・未適用・未ログイン時はアプリが env（VITE_FACILITY_NAME）→ 汎用既定値「サンプルホーム」へ
--   フォールバックするため、このテーブルが無くても画面は壊れない（lib/appSettings.ts）。
-- ・ログイン画面はログイン前でDBを読めないため、汎用表記のままになる（仕様）。
-- =====================================================================
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;

drop policy if exists "read_auth"  on app_settings;
drop policy if exists "write_auth" on app_settings;
-- read も authenticated 限定＝匿名では施設名を読めない
create policy "read_auth"  on app_settings for select to authenticated using (true);
create policy "write_auth" on app_settings for all    to authenticated using (true) with check (true);

-- PostgREST のスキーマキャッシュを即時リロード（適用直後の 404/PGRST205 期間を短縮）
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 値の投入（施設名。'〇〇' を実際の施設名に置き換えて実行する。「厨房」は付けない＝
-- 画面側で「〇〇厨房」と組み立てる）。再実行すると上書き更新される。
--   insert into app_settings (key, value) values ('facility_name', '〇〇')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
--
-- 確認:
--   select key, value, updated_at from app_settings order by key;
-- ---------------------------------------------------------------------
