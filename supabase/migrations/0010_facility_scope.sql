-- =====================================================================
-- 0010: 厨房メニューの表を施設ごとに分ける
--   適用方法: Supabase ダッシュボード > SQL Editor にこのファイルの全文を貼り付けて実行（冪等）
--             全体を1つのトランザクションで流す。途中で失敗したら全部取り消される。
--             当てる手順・当てた後に確かめる SQL・会員の登録の仕方は DEPLOY.md。
--
-- 何をするか:
--   1. 施設（facilities）と施設の会員（facility_members）の表を作る。
--      会員は自分の会員の行だけ読める。書き込みのポリシーは置かない（登録は SQL エディタ・service role だけ）。
--   2. 「既定の施設」を1つ作り（固定の id）、今あるデータをすべてその施設に割り当てる。
--      今いるログインの利用者（auth.users の全員）を、その施設の会員（member）として一斉に登録する。
--      ＝今の「ログインした人なら全部」と同じ範囲を保つ。
--      ★一斉登録は「既定の施設」を初めて作った時だけ行う（再実行で、後から外した会員を戻さないため）。
--   3. 食品成分表（food_composition）は全施設で共有。ログインした人は読める・直せるのは
--      どこかの施設で role='admin' の会員だけ。
--   4. それ以外の7つの表に facility_id（not null）を足し、RLS を
--      「自分が会員の施設の行だけ読める・書ける」に替える。他施設へ書き換えることもできない（with check）。
--   5. facility_id の既定値は「ログインしている人が会員の施設がちょうど1つならその施設」。
--      0件・2件以上なら null ＝ not null に当たって断られる（黙って別施設に書かない）。
--   6. 一意の制約を施設ごとにする（食材名・献立セット番号・献立の日付・職員名・設定のキー）。
--      ★画面の upsert（onConflict）も同じ組に直してある＝この SQL を当てたら画面も公開し直すこと。
--   7. replace_dish_recipe は security invoker のまま、料理と食材が呼び出した人に見える
--      （＝会員の施設の）ものか確かめてから入れ替える。
--
-- ビュー（v_*）は security_invoker=on のままなので、元の表の RLS で施設ごとに絞られる（変更なし）。
-- realtime（postgres_changes）は購読する人の select ポリシーで絞って配信される（Supabase の仕様）。
--
-- 戻し方: supabase/rollback/0010_back.sql（施設が「既定の施設」1つのうちだけ戻せる）。
-- =====================================================================

begin;

-- ─────────────────────────────────────────────
-- 1. 補助関数の置き場（API に出さない）
-- ─────────────────────────────────────────────
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ─────────────────────────────────────────────
-- 2. 施設と施設の会員
-- ─────────────────────────────────────────────
create table if not exists public.facilities (
  id   uuid primary key default gen_random_uuid(),
  name text not null
);

create table if not exists public.facility_members (
  user_id     uuid not null references auth.users(id) on delete cascade,
  facility_id uuid not null references public.facilities(id),
  role        text not null default 'member' check (role in ('member','admin')),
  created_at  timestamptz not null default now(),
  primary key (user_id, facility_id)
);

alter table public.facilities       enable row level security;
alter table public.facility_members enable row level security;

-- 未ログインには何も配らない。ログインした人も読むだけ（書き込みは SQL エディタ・service role）
revoke all on public.facilities, public.facility_members from anon;
revoke insert, update, delete, truncate on public.facilities, public.facility_members from authenticated;
grant select on public.facilities, public.facility_members to authenticated;

-- ─────────────────────────────────────────────
-- 3. 会員の判定（RLS と既定値から呼ぶ）
--    facility_members を RLS の外から読むので security definer。search_path は空に固定。
-- ─────────────────────────────────────────────
-- 自分が会員の施設の一覧
create or replace function private.my_facility_ids() returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(m.facility_id), '{}'::uuid[])
    from public.facility_members m
   where m.user_id = auth.uid()
$$;

-- facility_id の既定値: 会員の施設がちょうど1つならその施設、0件・2件以上なら null
create or replace function private.current_facility_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select case when count(*) = 1 then (array_agg(m.facility_id))[1] end
    from public.facility_members m
   where m.user_id = auth.uid()
$$;

-- どこかの施設で admin の会員か（食品成分表を直せる人）
create or replace function private.is_any_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.facility_members m
     where m.user_id = auth.uid() and m.role = 'admin')
$$;

revoke all on function private.my_facility_ids(), private.current_facility_id(), private.is_any_admin() from public;
grant execute on function private.my_facility_ids(), private.current_facility_id(), private.is_any_admin()
  to authenticated, service_role;

-- 会員は自分の会員の行・自分が会員の施設だけ読める
drop policy if exists "member_read_own" on public.facility_members;
create policy "member_read_own" on public.facility_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "member_read" on public.facilities;
create policy "member_read" on public.facilities
  for select to authenticated using (id = any ((select private.my_facility_ids())::uuid[]));

-- ─────────────────────────────────────────────
-- 4. 既定の施設と、今いる利用者の一斉登録
--    id は固定（00000000-0000-4000-8000-000000000001）。戻し・試験・DEPLOY.md から同じ値で参照する。
-- ─────────────────────────────────────────────
do $$
declare n int;
begin
  insert into public.facilities (id, name)
  values ('00000000-0000-4000-8000-000000000001', '既定の施設')
  on conflict (id) do nothing;
  get diagnostics n = row_count;
  -- 初めて作った時だけ一斉登録する（再実行で、後から外した会員を戻さない）
  if n = 1 then
    insert into public.facility_members (user_id, facility_id, role)
    select u.id, '00000000-0000-4000-8000-000000000001', 'member' from auth.users u
    on conflict do nothing;
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 5. 7つの表に facility_id を足す
--    既定の施設の定数を既定値にして列を足す＝今ある行は全部既定の施設に入る（行の書き換えも
--    updated_at の更新も realtime の通知も起きない）。その後で既定値を「会員の施設」に替える。
-- ─────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['ingredients','menu_sets','dishes','dish_ingredients',
                           'daily_menus','report_staff','app_settings'] loop
    execute format(
      'alter table public.%I add column if not exists facility_id uuid not null
         default %L references public.facilities(id)',
      t, '00000000-0000-4000-8000-000000000001');
    execute format('alter table public.%I alter column facility_id set default private.current_facility_id()', t);
    execute format('create index if not exists %I on public.%I (facility_id)', t || '_facility_id_idx', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────
-- 6. 一意の制約を施設ごとにする
-- ─────────────────────────────────────────────
-- 全体で一意だった制約（0001 の unique。自動命名なので名前は決め打ちせず探して落とす）
do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'u' and array_length(c.conkey, 1) = 1
       and (   (c.conrelid = 'public.ingredients'::regclass and a.attname = 'name')
            or (c.conrelid = 'public.menu_sets'::regclass   and a.attname = 'code')
            or (c.conrelid = 'public.daily_menus'::regclass and a.attname = 'menu_date'))
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;
drop index if exists public.report_staff_name_uidx;   -- 0007

create unique index if not exists ingredients_facility_name_uidx   on public.ingredients  (facility_id, name);
create unique index if not exists menu_sets_facility_code_uidx     on public.menu_sets    (facility_id, code);
create unique index if not exists daily_menus_facility_date_uidx   on public.daily_menus  (facility_id, menu_date);
create unique index if not exists report_staff_facility_name_uidx  on public.report_staff (facility_id, name);

-- app_settings は主キーそのもの（key）を (facility_id, key) に替える
do $$
declare v_name text; v_len int;
begin
  select conname, array_length(conkey, 1) into v_name, v_len
    from pg_constraint where conrelid = 'public.app_settings'::regclass and contype = 'p';
  if v_len is distinct from 2 then
    if v_name is not null then
      execute format('alter table public.app_settings drop constraint %I', v_name);
    end if;
    alter table public.app_settings add constraint app_settings_pkey primary key (facility_id, key);
  end if;
end $$;

-- ─────────────────────────────────────────────
-- 7. 7つの表の RLS: 自分が会員の施設の行だけ読める・書ける（未ログインは全部断る）
--    using で読む・直す・消す行を絞り、with check で書いた後の行も会員の施設に限る
--    （＝他施設への挿入も、facility_id を他施設へ書き換えることもできない）
-- ─────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['ingredients','menu_sets','dishes','dish_ingredients',
                           'daily_menus','report_staff','app_settings'] loop
    execute format('drop policy if exists "read_all"    on public.%I', t);
    execute format('drop policy if exists "read_auth"   on public.%I', t);
    execute format('drop policy if exists "write_auth"  on public.%I', t);
    execute format('drop policy if exists "facility_rw" on public.%I', t);
    execute format(
      'create policy "facility_rw" on public.%I for all to authenticated
         using (facility_id = any ((select private.my_facility_ids())::uuid[]))
         with check (facility_id = any ((select private.my_facility_ids())::uuid[]))', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────
-- 8. 食品成分表: 読むのはログインした人（0008 の read_auth をそのまま使う）・直すのは admin の会員だけ
-- ─────────────────────────────────────────────
drop policy if exists "read_all"   on public.food_composition;
drop policy if exists "read_auth"  on public.food_composition;
drop policy if exists "write_auth" on public.food_composition;
drop policy if exists "admin_insert" on public.food_composition;
drop policy if exists "admin_update" on public.food_composition;
drop policy if exists "admin_delete" on public.food_composition;
create policy "read_auth" on public.food_composition for select to authenticated using (true);
create policy "admin_insert" on public.food_composition for insert to authenticated
  with check ((select private.is_any_admin()));
create policy "admin_update" on public.food_composition for update to authenticated
  using ((select private.is_any_admin())) with check ((select private.is_any_admin()));
create policy "admin_delete" on public.food_composition for delete to authenticated
  using ((select private.is_any_admin()));

-- ─────────────────────────────────────────────
-- 9. replace_dish_recipe（0006）: security invoker のまま、施設を確かめてから入れ替える
--    ・料理は RLS を通して探す＝会員でない施設の料理は見つからず、例外で止まる
--    ・明細の facility_id は料理の施設を明示する（2施設の会員でも既定値の null に当たらない）
--    ・食材も同じ施設のものだけ（他施設の食材 id を指す明細を作らせない）
--    その他のセマンティクス（空配列＝全削除・sort_order・memo 対象外）は 0006 と同じ
-- ─────────────────────────────────────────────
create or replace function replace_dish_recipe(p_dish_id bigint, p_rows jsonb)
returns void
language plpgsql
security invoker   -- RLS（facility_rw ポリシー）を呼び出しユーザーの権限のまま適用する
set search_path = public
as $$
declare
  v_fid uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;

  select d.facility_id into v_fid from dishes d where d.id = p_dish_id;
  if v_fid is null then
    raise exception 'dish % is not found in your facility', p_dish_id using errcode = '42501';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_rows) as r
     where not exists (
       select 1 from ingredients i
        where i.id = (r->>'ingredient_id')::bigint and i.facility_id = v_fid)
  ) then
    raise exception 'ingredient is not found in the facility of dish %', p_dish_id using errcode = '42501';
  end if;

  delete from dish_ingredients where dish_id = p_dish_id;
  insert into dish_ingredients (facility_id, dish_id, ingredient_id, amount_g, sort_order)
  select v_fid,
         p_dish_id,
         (r->>'ingredient_id')::bigint,
         (r->>'amount_g')::numeric,          -- jsonb null → SQL null（適量＝調味料）
         coalesce((r->>'sort_order')::int, 0)
  from jsonb_array_elements(p_rows) as r;
end;
$$;

revoke execute on function replace_dish_recipe(bigint, jsonb) from public;
grant execute on function replace_dish_recipe(bigint, jsonb) to authenticated;

commit;

-- PostgREST のスキーマキャッシュを即時リロード（列・一意の組の変更を画面の upsert へすぐ効かせる）
notify pgrst, 'reload schema';
