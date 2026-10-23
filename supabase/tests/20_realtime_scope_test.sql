-- 0011_realtime_delete_scope.sql の試験。架空のデータは使わない（表の設定だけを見る）。
-- 前提: run.sh が 0011 を2回当ててある（冪等）。t.eq / t.ok は 10_facility_scope_test.sql が作った道具。

\set ON_ERROR_STOP 1

select t.eq('11-1 5つの表が realtime の publication に入っている',
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('menu_sets','dishes','dish_ingredients','ingredients','daily_menus')),
  5);

select t.eq('11-2 5つの表の replica identity が full（削除の通知を施設で絞れる）',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relreplident = 'f'
      and c.relname in ('menu_sets','dishes','dish_ingredients','ingredients','daily_menus')),
  5);

select t.ok('11-3 5つの表には facility_id がある（画面の絞り込みの列）',
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name = 'facility_id'
      and table_name in ('menu_sets','dishes','dish_ingredients','ingredients','daily_menus')) = 5);
