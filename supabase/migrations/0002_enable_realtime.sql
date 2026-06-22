-- =====================================================================
-- Realtime（複数端末リアルタイム同期）を有効化
-- 適用方法: Supabase SQL Editor で実行（冪等・既に登録済みならスキップ）
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array['menu_sets','dishes','dish_ingredients','ingredients','daily_menus'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;
