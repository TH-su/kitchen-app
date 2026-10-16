-- =====================================================================
-- 0010 の戻し: 施設ごとの分割をやめ、0009 までの「ログインした人なら全部読み書き」に戻す
--   適用方法: Supabase ダッシュボード > SQL Editor に全文を貼り付けて実行（1つのトランザクション）
--
-- ★戻せるのは、データが「既定の施設」（00000000-0000-4000-8000-000000000001）だけにある時だけ。
--   他の施設の行が1行でもあれば、混ぜてしまわないよう最初に止まる（何も変えない）。
-- ★画面の upsert（onConflict）も 0010 の前の版に戻すこと（facility_id の列が無くなるため、
--   新しい画面のままだと献立・食材の保存が失敗する）。手順は DEPLOY.md。
-- ★施設・会員の表は消える（会員の登録は残らない）。
-- =====================================================================

begin;

-- 0. 既定の施設以外のデータがあれば止める
do $$
declare t text; n bigint;
begin
  if to_regclass('public.facilities') is null then
    raise exception '0010 は当たっていません（facilities がありません）';
  end if;
  foreach t in array array['ingredients','menu_sets','dishes','dish_ingredients',
                           'daily_menus','report_staff','app_settings'] loop
    execute format('select count(*) from public.%I where facility_id <> %L',
                   t, '00000000-0000-4000-8000-000000000001') into n;
    if n > 0 then
      raise exception '% に既定の施設以外の行が % 行あります。戻すと施設のデータが混ざるため止めました', t, n;
    end if;
  end loop;
end $$;

-- 1. replace_dish_recipe を 0006 の形へ
create or replace function replace_dish_recipe(p_dish_id bigint, p_rows jsonb)
returns void
language plpgsql
security invoker   -- RLS（write_auth ポリシー）を呼び出しユーザーの権限のまま適用する
set search_path = public
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;
  delete from dish_ingredients where dish_id = p_dish_id;
  insert into dish_ingredients (dish_id, ingredient_id, amount_g, sort_order)
  select p_dish_id,
         (r->>'ingredient_id')::bigint,
         (r->>'amount_g')::numeric,          -- jsonb null → SQL null（適量＝調味料）
         coalesce((r->>'sort_order')::int, 0)
  from jsonb_array_elements(p_rows) as r;
end;
$$;
revoke execute on function replace_dish_recipe(bigint, jsonb) from public;
grant execute on function replace_dish_recipe(bigint, jsonb) to authenticated;

-- 2. RLS を 0008／0009 の形へ（ログインした人なら全部読み書き）
do $$
declare t text;
begin
  foreach t in array array['ingredients','menu_sets','dishes','dish_ingredients',
                           'daily_menus','report_staff','app_settings'] loop
    execute format('drop policy if exists "facility_rw" on public.%I', t);
    execute format('drop policy if exists "read_auth"  on public.%I', t);
    execute format('drop policy if exists "write_auth" on public.%I', t);
    execute format('create policy "read_auth"  on public.%I for select to authenticated using (true)', t);
    execute format('create policy "write_auth" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
drop policy if exists "admin_insert" on public.food_composition;
drop policy if exists "admin_update" on public.food_composition;
drop policy if exists "admin_delete" on public.food_composition;
drop policy if exists "write_auth"   on public.food_composition;
create policy "write_auth" on public.food_composition for all to authenticated using (true) with check (true);

-- 3. 一意を全体へ戻す（0001・0007・0009 と同じ名前）
alter table public.app_settings drop constraint if exists app_settings_pkey;
drop index if exists public.ingredients_facility_name_uidx;
drop index if exists public.menu_sets_facility_code_uidx;
drop index if exists public.daily_menus_facility_date_uidx;
drop index if exists public.report_staff_facility_name_uidx;

-- 4. facility_id の列を外す（外部キー・索引も一緒に消える）
do $$
declare t text;
begin
  foreach t in array array['ingredients','menu_sets','dishes','dish_ingredients',
                           'daily_menus','report_staff','app_settings'] loop
    execute format('alter table public.%I drop column if exists facility_id', t);
  end loop;
end $$;

alter table public.app_settings add constraint app_settings_pkey primary key (key);
alter table public.ingredients  add constraint ingredients_name_key unique (name);
alter table public.menu_sets    add constraint menu_sets_code_key unique (code);
alter table public.daily_menus  add constraint daily_menus_menu_date_key unique (menu_date);
create unique index if not exists report_staff_name_uidx on public.report_staff (name);

-- 5. 施設・会員の表と補助関数を消す
drop table if exists public.facility_members;
drop table if exists public.facilities;
drop function if exists private.my_facility_ids();
drop function if exists private.current_facility_id();
drop function if exists private.is_any_admin();
-- private スキーマは他に何も無ければ消す（何かあれば残す）
do $$
begin
  drop schema if exists private;   -- cascade を付けない＝中身があれば失敗して残る
exception when dependent_objects_still_exist then
  null;
end $$;

commit;

notify pgrst, 'reload schema';

-- 確かめる（全行が read_auth/write_auth {authenticated} になり、facility_id の列が無いこと）:
--   select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by 1, 2;
--   select table_name from information_schema.columns where table_schema = 'public' and column_name = 'facility_id';
