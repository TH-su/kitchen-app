-- =====================================================================
-- 検食簿・給食日誌の入力値を daily_menus に保持（jsonb・様式まるごと1オブジェクト）
--   適用方法: Supabase ダッシュボード > SQL Editor に貼り付けて実行（冪等）
-- 検食簿=kenshoku / 給食日誌=nisshi。各々 { breakfast, lunch, dinner, snack } を格納。
-- RLS(read_all/write_auth)・realtime は daily_menus 既存設定を継承するため変更不要。
-- =====================================================================
alter table daily_menus
  add column if not exists kenshoku jsonb,
  add column if not exists nisshi   jsonb;

-- PostgREST のスキーマキャッシュを即時リロード（適用直後の PGRST204 期間を短縮）
notify pgrst, 'reload schema';
