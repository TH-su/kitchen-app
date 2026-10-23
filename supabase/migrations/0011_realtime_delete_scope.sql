-- =====================================================================
-- 0011: 削除の通知を、消した行の施設の会員にだけ届ける（2026-10-23・修正点 G30・代表者の決定 A）
--   適用方法: Supabase ダッシュボード > SQL Editor にこのファイルの全文を貼り付けて実行（冪等）
--
-- なぜ要るか:
--   realtime（postgres_changes）の削除の通知は、消えた行を RLS に当てられないため、購読者全員に主キーが届く
--   （realtime.apply_rls：DELETE は RLS を見ずに配る・中身は主キーだけ）。2つ目の施設を同じプロジェクトに入れると、
--   他施設の端末に「どこかで id N の行が消えた」が届き、読み直しも走る。
--   ただし購読の絞り込み（filter）は、削除では「消す前の行（old_columns）」に当てて判定される。
--   消す前の行に facility_id を載せるには replica identity を full にする必要がある（既定は主キーだけ）。
--   画面（src/hooks/useRealtime.ts）は facility_id=eq.<自分の施設> で絞って購読する。
--
-- 何をするか:
--   1. 0002 と同じく、5つの表を publication supabase_realtime に入れる（2026-10-22 に本番で0件だったのを当て直した・冪等）
--   2. 5つの表の replica identity を full にする（消す前・直す前の行全体が WAL に載る。表は小さく、容量の増えは小さい）
--
-- 戻し方（データには触れない）:
--   alter table public.<表> replica identity default;   ← 5つの表それぞれ
-- =====================================================================

begin;

do $$
declare t text;
begin
  foreach t in array array['menu_sets','dishes','dish_ingredients','ingredients','daily_menus'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

commit;
