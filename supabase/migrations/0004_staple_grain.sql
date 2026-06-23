-- =====================================================================
-- Phase C: 主食量(1食1膳のグラム)を献立日ごとに保持
--   適用方法: Supabase ダッシュボード > SQL Editor に貼り付けて実行
-- 既定160g。1日の主食エネルギー = staple_grain_g × 1.56kcal/g × 主食のある食事数
-- （炊飯後ご飯 八訂01088 = 156kcal/100g を基準）
-- =====================================================================
alter table daily_menus
  add column if not exists staple_grain_g numeric default 160;

-- 既存行（NULL）はアプリ層で160に正規化するが、明示的に既定を入れておく
update daily_menus set staple_grain_g = 160 where staple_grain_g is null;

-- PostgREST のスキーマキャッシュを即時リロード（適用直後の PGRST204 期間を短縮）
notify pgrst, 'reload schema';
