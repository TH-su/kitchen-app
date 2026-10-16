-- =====================================================================
-- 0010: 厨房メニューの表を施設ごとに分ける
--   適用方法: Supabase ダッシュボード > SQL Editor にこのファイルの全文を貼り付けて実行（冪等）
--             全体を1つのトランザクションで流す。途中で失敗したら全部取り消される。
--             当てる手順・当てた後に確かめる SQL・会員の登録の仕方は DEPLOY.md。
--
-- 何をするか:
--   0. PostgreSQL 15 以上であることを確かめる（4b の「on delete set null (列)」が 15 からのため）。
--   1. 施設（facilities）と施設の会員（facility_members）の表を作る。
--      会員は自分の会員の行だけ読める。書き込みのポリシーは置かない（登録は SQL エディタ・service role だけ）。
--      1人1施設（user_id で一意）。2施設の会員が既にいれば何も変えずに止まる。
--   2. 「既定の施設」を1つ作り（固定の id）、今あるデータをすべてその施設に割り当てる。
--      今いるログインの利用者（auth.users の全員）を、その施設の会員（member）として一斉に登録する。
--      ＝今の「ログインした人なら全部」と同じ範囲を保つ。
--      ★一斉登録は「既定の施設」を初めて作った時だけ行う（再実行で、後から外した会員を戻さないため）。
--   3. 食品成分表（food_composition）は全施設で共有・読むだけ。ログインした人は読める。
--      ログインした人・未ログインからの書き込みは、ポリシーを置かず権限も剥がして断る（admin の会員でも書けない）。
--      更新は service role（scripts/seed-composition.mjs）だけ。
--   4. それ以外の7つの表に facility_id（not null）を足し、RLS を
--      「自分が会員の施設の行だけ読める・書ける」に替える。他施設へ書き換えることもできない（with check）。
--   4b. 表どうしの参照（料理→献立セット、献立セット→料理、明細→料理・食材、日ごとの献立→献立セット・料理）の
--      外部キーを (参照先 id, facility_id) の2列に替える＝他施設の行を指せない（RLS を通らない service role・
--      SQL エディタからでも）。制約名は画面の埋め込み（table!制約名(...)）が使う名前で、戻しでも同じ名前にする。
--   5. facility_id の既定値は「ログインしている人が会員の施設がちょうど1つならその施設」。
--      0件・2件以上なら null ＝ not null に当たって断られる（黙って別施設に書かない）。
--   6. 一意の制約を施設ごとにする（食材名・献立セット番号・献立の日付・職員名・設定のキー）。
--      ★画面の upsert（onConflict）も同じ組に直してある＝この SQL を当てたら画面も公開し直すこと。
--   7. replace_dish_recipe は security invoker のまま、料理と食材が呼び出した人に見える
--      （＝会員の施設の）ものか確かめてから入れ替える。
--
-- ビュー（v_*）は security_invoker=on のままなので、元の表の RLS で施設ごとに絞られる（変更なし）。
-- realtime（postgres_changes）: 挿入・更新は購読する人の select ポリシーで絞って配信される（Supabase の説明）。
--   ただし削除の通知は消えた行を RLS に当てられないため、旧い行のうち主キー（replica identity の既定）だけが
--   購読者全員（他施設の会員を含む）に届く可能性がある（Supabase の説明からの推測・本番では未確認）。
--   届くのは数字の id だけで、献立の中身・施設は含まない。
--
-- 戻し方: supabase/rollback/0010_back.sql（施設が「既定の施設」1つのうちだけ戻せる）。
-- =====================================================================

begin;

-- ─────────────────────────────────────────────
-- 0. 版の確認（4b の on delete set null (列) は PostgreSQL 15 から）。古ければ何も変えずに止まる
-- ─────────────────────────────────────────────
do $$
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'PostgreSQL 15 以上が必要です（今は %）。何も変えていません', current_setting('server_version');
  end if;
end $$;

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
  role        text not null default 'member' check (role in ('member','admin')),  -- 今は権限の違いに使っていない（食品成分表は admin でも書けない）
  created_at  timestamptz not null default now(),
  primary key (user_id, facility_id)
);

-- 1人1施設: 画面には施設の切り替えが無く、2施設の会員は既定値が決まらず保存できず、
-- 読む画面（設定の maybeSingle など）もエラーになるため、DB で1人1施設に限る。
-- 施設を移す時は会員の行を消してから入れ直す（DEPLOY.md）。2施設の会員が既にいれば止まる（何も変えない）。
do $$
declare n int;
begin
  select count(*) into n from (
    select user_id from public.facility_members group by user_id having count(*) > 1) x;
  if n > 0 then
    raise exception '2つ以上の施設の会員になっている利用者が % 人います。1人1施設に直してから当ててください', n;
  end if;
end $$;
create unique index if not exists facility_members_user_uidx on public.facility_members (user_id);

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

revoke all on function private.my_facility_ids(), private.current_facility_id() from public;
grant execute on function private.my_facility_ids(), private.current_facility_id()
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
-- 5b. 表どうしの参照を同じ施設の中に限る（2列の外部キー）
--    参照される3表（menu_sets・dishes・ingredients）に unique (id, facility_id) を足し、
--    子の外部キーを (参照先 id, facility_id) → 親 (id, facility_id) に替える。
--    子の7表はすべて 5 で facility_id を持つ（dish_ingredients も持つので、親経由の確かめは要らない）。
--    ・on delete は 0001 と同じ意味: 料理→献立セットと明細→料理は cascade、明細→食材は no action、
--      献立セットのスロット・日ごとの献立は set null。set null は「その列だけ」を空にする
--      （set null (列) ＝ facility_id は not null のまま残す。PostgreSQL 15 から）。
--    ・on update は no action（親の facility_id を、子が指しているまま他施設へ移すことはできない）。
--    ・他施設の id を指しても、無い id を指しても、同じ「外部キー違反（23503）・その組は無い」で断られる
--      （他施設の id があるかどうかはエラーの違いで分からない）。
--    ・ingredients.food_code → food_composition は全施設で共有の表なので1列のまま。
--    ・制約名は画面の埋め込み（例 main:dishes!menu_sets_main_dish_fkey(...)）が使う。変えない。
--      PostgREST は列名の指定（main_dish_id(...)）を1列の外部キーにしか当てないため、制約名で指定している。
-- ─────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['menu_sets','dishes','ingredients'] loop
    if not exists (select 1 from pg_constraint
                    where conrelid = ('public.' || t)::regclass and conname = t || '_id_facility_key') then
      execute format('alter table public.%I add constraint %I unique (id, facility_id)', t, t || '_id_facility_key');
    end if;
  end loop;
end $$;

do $$
declare r record;
begin
  -- 0001 の1列の外部キー（自動命名と fk_ms_* なので名前は決め打ちせず、3表を指す1列のものを探して落とす）
  for r in
    select c.conrelid::regclass as tbl, c.conname
      from pg_constraint c
     where c.contype = 'f' and array_length(c.conkey, 1) = 1
       and c.confrelid in ('public.menu_sets'::regclass, 'public.dishes'::regclass, 'public.ingredients'::regclass)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;

  -- 2列の外部キー（再実行では同じ名前のものを落として付け直す）
  for r in
    select * from (values
      ('dishes',           'owner_menu_set_id', 'menu_sets',   'dishes_owner_menu_set_fkey',      'on delete cascade'),
      ('menu_sets',        'staple_dish_id',    'dishes',      'menu_sets_staple_dish_fkey',      'on delete set null (staple_dish_id)'),
      ('menu_sets',        'main_dish_id',      'dishes',      'menu_sets_main_dish_fkey',        'on delete set null (main_dish_id)'),
      ('menu_sets',        'side1_dish_id',     'dishes',      'menu_sets_side1_dish_fkey',       'on delete set null (side1_dish_id)'),
      ('menu_sets',        'side2_dish_id',     'dishes',      'menu_sets_side2_dish_fkey',       'on delete set null (side2_dish_id)'),
      ('menu_sets',        'soup_dish_id',      'dishes',      'menu_sets_soup_dish_fkey',        'on delete set null (soup_dish_id)'),
      ('dish_ingredients', 'dish_id',           'dishes',      'dish_ingredients_dish_fkey',      'on delete cascade'),
      ('dish_ingredients', 'ingredient_id',     'ingredients', 'dish_ingredients_ingredient_fkey', ''),
      ('daily_menus',      'breakfast_set_id',  'menu_sets',   'daily_menus_breakfast_set_fkey',  'on delete set null (breakfast_set_id)'),
      ('daily_menus',      'lunch_set_id',      'menu_sets',   'daily_menus_lunch_set_fkey',      'on delete set null (lunch_set_id)'),
      ('daily_menus',      'dinner_set_id',     'menu_sets',   'daily_menus_dinner_set_fkey',     'on delete set null (dinner_set_id)'),
      ('daily_menus',      'snack_dish_id',     'dishes',      'daily_menus_snack_dish_fkey',     'on delete set null (snack_dish_id)')
    ) v(child, col, parent, conname, act)
  loop
    execute format('alter table public.%I drop constraint if exists %I', r.child, r.conname);
    execute format('alter table public.%I add constraint %I foreign key (%I, facility_id)
                      references public.%I (id, facility_id) %s',
                   r.child, r.conname, r.col, r.parent, r.act);
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
-- 8. 食品成分表: 全施設で共有・読むだけ。読むのはログインした人（0008 の read_auth）
--    書き込みのポリシーは置かず、権限も剥がす（二重に断る）。admin の会員でも書けない。
--    更新は service role（RLS を通らない・権限は Supabase の既定のまま）だけ。
-- ─────────────────────────────────────────────
drop policy if exists "read_all"   on public.food_composition;
drop policy if exists "read_auth"  on public.food_composition;
drop policy if exists "write_auth" on public.food_composition;
drop policy if exists "admin_insert" on public.food_composition;
drop policy if exists "admin_update" on public.food_composition;
drop policy if exists "admin_delete" on public.food_composition;
create policy "read_auth" on public.food_composition for select to authenticated using (true);
revoke insert, update, delete, truncate on public.food_composition from anon, authenticated;
-- 旧い下書き（admin だけ直せる版）の補助関数が残っていれば消す
drop function if exists private.is_any_admin();

-- ─────────────────────────────────────────────
-- 9. replace_dish_recipe（0006）: security invoker のまま、施設を確かめてから入れ替える
--    ・料理は RLS を通して探す＝会員でない施設の料理は見つからず、例外で止まる
--    ・明細の facility_id は料理の施設を明示する（2施設の会員でも既定値の null に当たらない）
--    ・食材も同じ施設のものだけ（他施設の食材 id を指す明細を作らせない）。5b の外部キーでも断られるが、
--      ここで先に確かめて「権限なし（42501）」で止める（画面のエラーの出方を変えないため）
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
