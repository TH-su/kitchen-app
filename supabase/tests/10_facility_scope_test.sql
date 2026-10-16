-- 0010_facility_scope.sql の守りの試験。架空のデータだけを使う。
-- 前提: 00_supabase_stub.sql → 0001〜0009 → fixtures/05_before_0010.sql → 0010（2回）の順に流してある。
-- 判定は件数で行う（RLS は読めない行をエラーではなく「0件」で返すため）。
-- 書き込みの拒否は「例外になる」（挿入・with check 違反）か「0件しか変わらない」（using で見えない行）で見る。

\set ON_ERROR_STOP 1

-- ── 試験用の道具（care-backend の試験と同じ形） ──
create schema t;
grant usage on schema t to anon, authenticated, service_role;

create function t.eq(label text, got bigint, want bigint) returns void language plpgsql as $$
begin
  if got is not distinct from want then raise notice 'PASS %', label;
  else raise warning 'FAIL % (got %, want %)', label, got, want; end if;
end $$;

create function t.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if coalesce(cond, false) then raise notice 'PASS %', label;
  else raise warning 'FAIL %', label; end if;
end $$;

create function t.fails(label text, stmt text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'PASS % (%: %)', label, sqlstate, left(sqlerrm, 60);
    return;
  end;
  raise warning 'FAIL % (拒否されなかった)', label;
end $$;

create function t.fails_with(label text, stmt text, want_state text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = want_state then
      raise notice 'PASS % (%: %)', label, sqlstate, left(sqlerrm, 60);
    else
      raise warning 'FAIL % (別の理由で断られた %: %)', label, sqlstate, left(sqlerrm, 60);
    end if;
    return;
  end;
  raise warning 'FAIL % (拒否されなかった)', label;
end $$;

-- エラーの形（状態コード・文面・詳細の数字を伏せたもの）。断られなければ null
create function t.errsig(stmt text) returns text language plpgsql as $$
declare st text; msg text; det text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics st = returned_sqlstate, msg = message_text, det = pg_exception_detail;
    return st || ' | ' || regexp_replace(msg, '[0-9]+', 'N', 'g') || ' | ' || regexp_replace(coalesce(det, ''), '[0-9]+', 'N', 'g');
  end;
  return null;
end $$;

create function t.affects(label text, stmt text, want bigint) returns void language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  perform t.eq(label, n, want);
exception when others then
  raise warning 'FAIL % (エラー %: %)', label, sqlstate, left(sqlerrm, 60);
end $$;

create function t.cnt(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt into n;
  return n;
end $$;

-- ログインした人の JWT を入れる（同じトランザクションの中だけ効く）
create function t.login(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true)
$$;

-- 架空の施設と利用者の id
create function t.fd() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$; -- 既定の施設
create function t.fb() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-00000000000b'::uuid $$; -- 施設B
create function t.ua()    returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-0000000000a1'::uuid $$; -- 既存の利用者（既定の施設）
create function t.ua2()   returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-0000000000a2'::uuid $$; -- 既存の利用者2
create function t.ub()    returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-0000000000b1'::uuid $$; -- 施設Bの会員
create function t.unone() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-0000000000c1'::uuid $$; -- どこの会員でもない
create function t.uboth() returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-0000000000d1'::uuid $$; -- 2施設の会員
create function t.uadm()  returns uuid language sql immutable as $$ select '00000000-0000-4000-8000-0000000000e1'::uuid $$; -- 施設Bの admin

grant execute on all functions in schema t to anon, authenticated, service_role;

-- ═════ 0. 移行の結果（既存データ・既存利用者） ═════
select t.eq('0-1 既定の施設が1つだけできている', (select count(*) from facilities), 1);
select t.ok('0-2 既定の施設の名前', (select name from facilities where id = t.fd()) = '既定の施設');
select t.eq('0-3 既存の利用者が全員 既定の施設の会員（member）',
            (select count(*) from facility_members where facility_id = t.fd() and role = 'member'
                and user_id in (t.ua(), t.ua2())), 2);
select t.eq('0-4 '|| x.tb ||': 既存の行がすべて既定の施設に入っている',
            t.cnt(format('select count(*) from %I where facility_id is distinct from %L', x.tb, t.fd())), 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.ok('0-5 '|| x.tb ||': 既存の行が残っている（消えていない）',
            t.cnt(format('select count(*) from %I', x.tb)) > 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.eq('0-6 facility_id は7表とも not null', (
  select count(*) from information_schema.columns
   where table_schema = 'public' and column_name = 'facility_id' and is_nullable = 'NO'
     and table_name in ('ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings')), 7);
select t.eq('0-7 facility_id の既定値は7表とも current_facility_id()', (
  select count(*) from information_schema.columns
   where table_schema = 'public' and column_name = 'facility_id'
     and column_default = 'private.current_facility_id()'
     and table_name in ('ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings')), 7);
select t.eq('0-8 食品成分表には facility_id を足していない（全施設で共有）', (
  select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'food_composition' and column_name = 'facility_id'), 0);
select t.eq('0-9 旧来の read_auth/write_auth/read_all が7表に残っていない', (
  select count(*) from pg_policies where schemaname = 'public'
     and policyname in ('read_auth','write_auth','read_all')
     and tablename in ('ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings')), 0);
select t.eq('0-10 PUBLIC（未ログインを含む）に向いたポリシーが1つも無い', (
  select count(*) from pg_policies where schemaname = 'public' and 'public' = any(roles)), 0);
select t.eq('0-11 ビューは5本とも security_invoker=on のまま', (
  select count(*) from pg_class c where c.relkind = 'v' and c.relnamespace = 'public'::regnamespace
     and c.relname like 'v\_%' and 'security_invoker=on' = any(c.reloptions)), 5);
select t.ok('0-12 replace_dish_recipe は security invoker のまま',
            not (select prosecdef from pg_proc where proname = 'replace_dish_recipe'));

-- 再実行で、後から外した会員を戻さない（一斉登録は既定の施設を初めて作った時だけ）
-- run.sh が1回目と2回目の 0010 の間で、既存の利用者3（a3）の会員の行を外している
select t.eq('0-13 0010 の再実行で、外した会員が戻らない',
  (select count(*) from facility_members where user_id = '00000000-0000-4000-8000-0000000000a3'), 0);
select t.eq('0-14 0010 の再実行で施設が増えない', (select count(*) from facilities), 1);

select t.ok('0-15 1人1施設: facility_members の user_id に一意の索引がある', exists (
  select 1 from pg_index i where i.indrelid = 'public.facility_members'::regclass and i.indisunique
     and i.indnatts = 1 and i.indkey[0] = (select attnum from pg_attribute
       where attrelid = 'public.facility_members'::regclass and attname = 'user_id')));
select t.eq('0-16 参照される3表に unique (id, facility_id) がある', (
  select count(*) from pg_constraint where contype = 'u'
     and conname in ('menu_sets_id_facility_key','dishes_id_facility_key','ingredients_id_facility_key')), 3);
select t.eq('0-17 表どうしの外部キーは12本とも2列（参照先 id, facility_id）', (
  select count(*) from pg_constraint c where c.contype = 'f' and array_length(c.conkey, 1) = 2
     and c.confrelid in ('public.menu_sets'::regclass, 'public.dishes'::regclass, 'public.ingredients'::regclass)
     and c.conname in ('dishes_owner_menu_set_fkey','menu_sets_staple_dish_fkey','menu_sets_main_dish_fkey',
       'menu_sets_side1_dish_fkey','menu_sets_side2_dish_fkey','menu_sets_soup_dish_fkey','dish_ingredients_dish_fkey',
       'dish_ingredients_ingredient_fkey','daily_menus_breakfast_set_fkey','daily_menus_lunch_set_fkey',
       'daily_menus_dinner_set_fkey','daily_menus_snack_dish_fkey')), 12);
select t.eq('0-18 3表を指す1列の外部キーが残っていない', (
  select count(*) from pg_constraint c where c.contype = 'f' and array_length(c.conkey, 1) = 1
     and c.confrelid in ('public.menu_sets'::regclass, 'public.dishes'::regclass, 'public.ingredients'::regclass)), 0);
select t.eq('0-19 on delete の意味が 0001 と同じ（cascade 2・no action 1・set null 9）', (
  select count(*) from pg_constraint c where c.contype = 'f' and array_length(c.conkey, 1) = 2
     and c.confrelid in ('public.menu_sets'::regclass, 'public.dishes'::regclass, 'public.ingredients'::regclass)
     and ((c.conname in ('dishes_owner_menu_set_fkey','dish_ingredients_dish_fkey') and c.confdeltype = 'c')
       or (c.conname = 'dish_ingredients_ingredient_fkey' and c.confdeltype = 'a')
       or (c.confdeltype = 'n' and array_length(c.confdelsetcols, 1) = 1
           and c.confdelsetcols[1] = c.conkey[1]))), 12);
select t.ok('0-20 食品成分表を直す admin の判定関数は無い', to_regprocedure('private.is_any_admin()') is null);

-- ── 架空の施設B・利用者・Bのデータ（SQL エディタ＝postgres で登録する想定。facility_id は明示） ──
insert into facilities (id, name) values (t.fb(), '試験用 施設B');
insert into auth.users (id) values (t.ub()), (t.unone()), (t.uboth()), (t.uadm());
-- uboth（2施設の会員）は 1人1施設の制約で登録できないので、ここでは登録しない（3c で制約を外して試す）
insert into facility_members (user_id, facility_id, role) values
  (t.ub(),    t.fb(), 'member'),
  (t.uadm(),  t.fb(), 'admin');

-- Bのデータは既定の施設と同じ名前・番号・日付・キーにする（＝一意が施設ごとであることも確かめる）
insert into ingredients (facility_id, name, food_code) values (t.fb(), '見本の米', 'T0001');
insert into menu_sets (facility_id, code, category, seq_no) values (t.fb(), '見本1', '魚', 1);
insert into dishes (facility_id, name, dish_type, owner_menu_set_id)
  select t.fb(), 'Bの焼き魚', 'main', id from menu_sets where facility_id = t.fb() and code = '見本1';
update menu_sets set main_dish_id = (select id from dishes where name = 'Bの焼き魚')
 where facility_id = t.fb() and code = '見本1';
insert into dish_ingredients (facility_id, dish_id, ingredient_id, amount_g, sort_order)
  select t.fb(), d.id, i.id, 150, 0 from dishes d, ingredients i
   where d.name = 'Bの焼き魚' and i.facility_id = t.fb() and i.name = '見本の米';
insert into daily_menus (facility_id, menu_date, meal_count, lunch_set_id)
  select t.fb(), date '2099-01-01', 5, id from menu_sets where facility_id = t.fb() and code = '見本1';
insert into report_staff (facility_id, name, is_cook) values (t.fb(), '見本 調理員', true);
insert into app_settings (facility_id, key, value) values (t.fb(), 'facility_name', '見本の施設B');

select t.ok('U-1 一意は施設ごと: 同じ食材名・献立番号・日付・職員名・設定キーを2施設が持てる',
  (select count(*) from ingredients  where name = '見本の米')        = 2 and
  (select count(*) from menu_sets    where code = '見本1')           = 2 and
  (select count(*) from daily_menus  where menu_date = '2099-01-01') = 2 and
  (select count(*) from report_staff where name = '見本 調理員')     = 2 and
  (select count(*) from app_settings where key = 'facility_name')    = 2);
select t.fails('U-2 一意は施設の中では効く: 同じ施設に同じ日付は入らない',
  $$insert into daily_menus (facility_id, menu_date) values (t.fb(), '2099-01-01')$$);
select t.fails('U-3 一意は施設の中では効く: 同じ施設に同じ設定キーは入らない',
  $$insert into app_settings (facility_id, key, value) values (t.fd(), 'facility_name', 'x')$$);
select t.fails('U-4 一意は施設の中では効く: 同じ施設に同じ食材名は入らない',
  $$insert into ingredients (facility_id, name) values (t.fd(), '見本の米')$$);
select t.fails('U-5 一意は施設の中では効く: 同じ施設に同じ献立番号は入らない',
  $$insert into menu_sets (facility_id, code, category) values (t.fd(), '見本1', '魚')$$);
select t.fails('U-6 一意は施設の中では効く: 同じ施設に同じ職員名は入らない',
  $$insert into report_staff (facility_id, name) values (t.fd(), '見本 調理員')$$);
select t.fails('U-7 SQL エディタ（ログインなし）で facility_id を書かずに入れると断られる（既定値が null）',
  $$insert into report_staff (name) values ('見本 職員X')$$);

-- 施設Bの料理の id は postgres で控えておく（uA からは見えないので）
select set_config('t.b_dish', (select id::text from dishes where name = 'Bの焼き魚'), false);
select set_config('t.b_ing',  (select id::text from ingredients where facility_id = t.fb() and name = '見本の米'), false);
select set_config('t.a_dish', (select id::text from dishes where name = '見本の焼き魚'), false);
select set_config('t.a_ing',  (select id::text from ingredients where facility_id = t.fd() and name = '見本の米'), false);
select set_config('t.b_set',  (select id::text from menu_sets where facility_id = t.fb() and code = '見本1'), false);
select set_config('t.a_set',  (select id::text from menu_sets where facility_id = t.fd() and code = '見本1'), false);

-- ═════ 1. 未ログイン（anon）は全表を読めない・書けない ═════
begin;
set local role anon;
select t.eq('1-1 anon: '|| x.tb ||' を読めない（0件）', t.cnt(format('select count(*) from %I', x.tb)), 0)
  from unnest(array['food_composition','ingredients','menu_sets','dishes','dish_ingredients',
                    'daily_menus','report_staff','app_settings']) x(tb);
select t.fails('1-2 anon: 施設の表を読めない',       'select count(*) from facilities');
select t.fails('1-3 anon: 施設の会員の表を読めない', 'select count(*) from facility_members');
select t.eq('1-4 anon: ビュー '|| x.v ||' は0件', t.cnt(format('select count(*) from %I', x.v)), 0)
  from unnest(array['v_menu_set_dishes','v_dish_nutrition','v_menuset_nutrition',
                    'v_daily_nutrition','v_daily_ingredient_totals']) x(v);
select t.fails('1-5 anon: 食品成分表に書けない', $$insert into food_composition (food_code, food_name) values ('X1', 'x')$$);
select t.fails('1-6 anon: 食材に書けない',       $$insert into ingredients (facility_id, name) values (t.fd(), 'anon食材')$$);
select t.fails('1-7 anon: 献立セットに書けない', $$insert into menu_sets (facility_id, code, category) values (t.fd(), 'anon', '魚')$$);
select t.fails('1-8 anon: 料理に書けない',       $$insert into dishes (facility_id, name, dish_type) values (t.fd(), 'anon', 'main')$$);
select t.fails('1-9 anon: 明細に書けない',
  format('insert into dish_ingredients (facility_id, dish_id, ingredient_id) values (%L, %s, %s)', t.fd(), current_setting('t.a_dish'), current_setting('t.a_ing')));
select t.fails('1-10 anon: 日々の献立に書けない', $$insert into daily_menus (facility_id, menu_date) values (t.fd(), '2099-02-01')$$);
select t.fails('1-11 anon: 職員マスタに書けない', $$insert into report_staff (facility_id, name) values (t.fd(), 'anon')$$);
select t.fails('1-12 anon: 設定に書けない',       $$insert into app_settings (facility_id, key, value) values (t.fd(), 'anon', 'x')$$);
select t.fails('1-13 anon: 施設を作れない',       $$insert into facilities (name) values ('anon')$$);
select t.affects('1-14 anon: '|| x.tb ||' を直せない（0件）', format('update %I set facility_id = facility_id', x.tb), 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.fails('1-17 anon: 食品成分表を直せない（権限なし）', $$update food_composition set energy_kcal = 0$$);
select t.fails('1-18 anon: 食品成分表を消せない（権限なし）', $$delete from food_composition$$);
select t.affects('1-15 anon: '|| x.tb ||' を消せない（0件）', format('delete from %I', x.tb), 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.fails('1-16 anon: replace_dish_recipe は料理を見つけられず止まる',
  format($$select replace_dish_recipe(%s, '[]'::jsonb)$$, current_setting('t.a_dish')));
rollback;

-- ═════ 2. 施設の会員は自分の施設の行だけ読める・書ける ═════
-- 2a. 既定の施設の会員（uA）
begin;
set local role authenticated;
select t.login(t.ua());
select t.eq('2a-1 uA: '|| x.tb ||' の施設Bの行が見えない', t.cnt(format('select count(*) from %I where facility_id = %L', x.tb, t.fb())), 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.ok('2a-2 uA: '|| x.tb ||' の自分の施設の行は見える', t.cnt(format('select count(*) from %I where facility_id = %L', x.tb, t.fd())) > 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.ok('2a-3 uA: 設定 facility_name は自分の施設の値だけ（画面の maybeSingle が1件で通る）',
  (select count(*) from app_settings where key = 'facility_name') = 1 and
  (select value from app_settings where key = 'facility_name') = '見本の施設名');
select t.eq('2a-4 uA: 2099-01-01 の献立は自分の施設の1件だけ', (select count(*) from daily_menus where menu_date = '2099-01-01'), 1);
select t.affects('2a-5 uA: '|| x.tb ||' の施設Bの行を直せない（0件）',
  format('update %I set facility_id = facility_id where facility_id = %L', x.tb, t.fb()), 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.affects('2a-6 uA: '|| x.tb ||' の施設Bの行を消せない（0件）',
  format('delete from %I where facility_id = %L', x.tb, t.fb()), 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.fails('2a-7 uA: 施設Bへ食材を入れられない',       $$insert into ingredients (facility_id, name) values (t.fb(), 'A→B')$$);
select t.fails('2a-8 uA: 施設Bへ献立セットを入れられない', $$insert into menu_sets (facility_id, code, category) values (t.fb(), 'A→B', '魚')$$);
select t.fails('2a-9 uA: 施設Bへ料理を入れられない',       $$insert into dishes (facility_id, name, dish_type) values (t.fb(), 'A→B', 'main')$$);
select t.fails('2a-10 uA: 施設Bへ明細を入れられない',
  format('insert into dish_ingredients (facility_id, dish_id, ingredient_id) values (%L, %s, %s)', t.fb(), current_setting('t.a_dish'), current_setting('t.a_ing')));
select t.fails('2a-11 uA: 施設Bへ献立を入れられない',      $$insert into daily_menus (facility_id, menu_date) values (t.fb(), '2099-03-01')$$);
select t.fails('2a-12 uA: 施設Bへ職員を入れられない',      $$insert into report_staff (facility_id, name) values (t.fb(), 'A→B')$$);
select t.fails('2a-13 uA: 施設Bへ設定を入れられない',      $$insert into app_settings (facility_id, key, value) values (t.fb(), 'A→B', 'x')$$);
-- 一意に当たって落ちるのを避けるため、名前・日付・キーも一緒にずらしてから施設Bへ移そうとする（with check だけで断られることを見る）
select t.fails('2a-14 uA: '|| x.tb ||' の自分の行の facility_id を施設Bへ書き換えられない', format(x.stmt, t.fb(), t.fd()))
  from (values
    ('ingredients',      $$update ingredients  set facility_id = %L, name = name || '_移' where facility_id = %L$$),
    ('menu_sets',        $$update menu_sets    set facility_id = %L, code = code || '_移' where facility_id = %L$$),
    ('dishes',           $$update dishes       set facility_id = %L where facility_id = %L$$),
    ('dish_ingredients', $$update dish_ingredients set facility_id = %L where facility_id = %L$$),
    ('daily_menus',      $$update daily_menus  set facility_id = %L, menu_date = menu_date + 1000 where facility_id = %L$$),
    ('report_staff',     $$update report_staff set facility_id = %L, name = name || '_移' where facility_id = %L$$),
    ('app_settings',     $$update app_settings set facility_id = %L, key = key || '_移' where facility_id = %L$$)
  ) x(tb, stmt);
select t.affects('2a-15 uA: 自分の施設の献立は直せる', $$update daily_menus set meal_count = 11 where menu_date = '2099-01-01'$$, 1);
rollback;
select t.eq('2a-16 施設Bの献立の食数は変わっていない', (select meal_count from daily_menus where facility_id = t.fb() and menu_date = '2099-01-01'), 5);

-- 2b. 施設Bの会員（uB）は逆向きに同じ
begin;
set local role authenticated;
select t.login(t.ub());
select t.eq('2b-1 uB: '|| x.tb ||' の既定の施設の行が見えない', t.cnt(format('select count(*) from %I where facility_id = %L', x.tb, t.fd())), 0)
  from unnest(array['ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
select t.ok('2b-2 uB: 設定 facility_name は施設Bの値だけ',
  (select count(*) from app_settings where key = 'facility_name') = 1 and
  (select value from app_settings where key = 'facility_name') = '見本の施設B');
select t.affects('2b-3 uB: 既定の施設の献立を消せない（0件）', $$delete from daily_menus where facility_id = t.fd()$$, 0);
select t.fails('2b-4 uB: 自分の献立を既定の施設へ移せない', $$update daily_menus set facility_id = t.fd(), menu_date = menu_date + 1000$$);
rollback;

-- ═════ 3. 既定値で自分の施設に入る／会員でない・2施設の会員は断られる ═════
begin;
set local role authenticated;
select t.login(t.ua());
insert into daily_menus (menu_date, meal_count) values ('2099-04-01', 3);
insert into report_staff (name) values ('既定値の職員');
select t.eq('3-1 uA: facility_id を書かずに入れた献立は既定の施設に入る',
  (select count(*) from daily_menus where menu_date = '2099-04-01' and facility_id = t.fd()), 1);
select t.eq('3-2 uA: facility_id を書かずに入れた職員は既定の施設に入る',
  (select count(*) from report_staff where name = '既定値の職員' and facility_id = t.fd()), 1);
-- 画面の upsert（onConflict: facility_id,menu_date）と同じ形。facility_id は既定値で埋まり、組で衝突を判定する
insert into daily_menus (menu_date, meal_count) values ('2099-01-01', 12)
  on conflict (facility_id, menu_date) do update set meal_count = excluded.meal_count;
select t.eq('3-3 uA: upsert（facility_id,menu_date）は自分の施設の行を更新する',
  (select meal_count from daily_menus where menu_date = '2099-01-01'), 12);
insert into ingredients (name) values ('見本の米') on conflict (facility_id, name) do update set name = excluded.name;
select t.eq('3-4 uA: upsert（facility_id,name）で食材が増えない', (select count(*) from ingredients where name = '見本の米'), 1);
rollback;
select t.eq('3-5 uA の upsert で施設Bの同じ日付の献立は変わっていない',
  (select meal_count from daily_menus where facility_id = t.fb() and menu_date = '2099-01-01'), 5);

begin;
set local role authenticated;
select t.login(t.ub());
insert into daily_menus (menu_date) values ('2099-04-01');
select t.eq('3-6 uB: 既定値で施設Bに入る（同じ日付を別施設が持てる）',
  (select count(*) from daily_menus where menu_date = '2099-04-01' and facility_id = t.fb()), 1);
rollback;

begin;
set local role authenticated;
select t.login(t.unone());
select t.ok('3-7 会員でない人: 既定値は null', private.current_facility_id() is null);
select t.fails('3-8 会員でない人: 献立を入れられない（not null に当たる）', $$insert into daily_menus (menu_date) values ('2099-05-01')$$);
select t.fails('3-9 会員でない人: facility_id を書いても入れられない', $$insert into daily_menus (facility_id, menu_date) values (t.fd(), '2099-05-01')$$);
select t.eq('3-10 会員でない人: 何も読めない', (select count(*) from daily_menus) + (select count(*) from dishes), 0);
select t.ok('3-11 会員でない人もログインしていれば食品成分表は読める', (select count(*) from food_composition) > 0);
rollback;

-- 3c. 2施設の会員（1人1施設の一意を、この取引の中だけ外して作る）
--     DB の一意が外れても、黙ってどちらかの施設へ書かない（既定値の二重の守り）ことを見る
begin;
drop index public.facility_members_user_uidx;
insert into facility_members (user_id, facility_id) values (t.uboth(), t.fd()), (t.uboth(), t.fb());
set local role authenticated;
select t.login(t.uboth());
select t.ok('3-12 2施設の会員: 既定値は null', private.current_facility_id() is null);
select t.fails('3-13 2施設の会員: facility_id を書かずに入れると断られる', $$insert into daily_menus (menu_date) values ('2099-05-01')$$);
select t.affects('3-14 2施設の会員: facility_id を書けば入れられる',
  $$insert into daily_menus (facility_id, menu_date) values (t.fb(), '2099-05-01')$$, 1);
select t.eq('3-15 2施設の会員: 両方の施設の行が読める', (select count(*) from daily_menus where menu_date = '2099-01-01'), 2);
select replace_dish_recipe(current_setting('t.b_dish')::bigint,
  format('[{"ingredient_id": %s, "amount_g": 70}]', current_setting('t.b_ing'))::jsonb);
select t.eq('5-19 2施設の会員: replace_dish_recipe は料理の施設で明細を書く（既定値の null に当たらない）',
  (select count(*) from dish_ingredients where dish_id = current_setting('t.b_dish')::bigint and facility_id = t.fb() and amount_g = 70), 1);
select t.eq('6-7 2施設の会員: 会員の表は自分の2行', (select count(*) from facility_members), 2);
select t.eq('6-8 2施設の会員: 施設の表は2施設', (select count(*) from facilities), 2);
rollback;
select t.ok('3-16 3c の後: 1人1施設の一意の索引は戻っている',
  to_regclass('public.facility_members_user_uidx') is not null);

-- ═════ 4. 食品成分表: 全施設で共有・読むだけ（ログインで読める・admin でも書けない・更新は service role） ═════
begin;
set local role authenticated;
select t.login(t.ua());
select t.eq('4-1 member: 食品成分表を読める', (select count(*) from food_composition), 2);
select t.fails('4-2 member: 食品成分表に入れられない', $$insert into food_composition (food_code, food_name) values ('X2', 'x')$$);
select t.fails('4-3 member: 食品成分表を直せない', $$update food_composition set energy_kcal = 0$$);
select t.fails('4-4 member: 食品成分表を消せない', $$delete from food_composition where food_code = 'T0002'$$);
rollback;

begin;
set local role authenticated;
select t.login(t.uadm());
select t.eq('4-5a admin: 食品成分表を読める', (select count(*) from food_composition), 2);
select t.fails('4-5 admin でも食品成分表に入れられない', $$insert into food_composition (food_code, food_name) values ('X3', 'x')$$);
select t.fails('4-6 admin でも食品成分表を直せない', $$update food_composition set energy_kcal = 1 where food_code = 'T0001'$$);
select t.fails('4-7 admin でも食品成分表を消せない', $$delete from food_composition where food_code = 'T0002'$$);
select t.eq('4-8 admin でも他施設（既定の施設）の献立は見えない', (select count(*) from daily_menus where facility_id = t.fd()), 0);
rollback;
select t.eq('4-9 食品成分表は変わっていない（2行・T0001 は 156kcal）',
  (select count(*) from food_composition where food_code in ('T0001','T0002')) +
  (select count(*) from food_composition where food_code = 'T0001' and energy_kcal = 156), 3);
select t.eq('4-10 anon・authenticated に食品成分表の insert/update/delete/truncate の権限が無い', (
  select count(*) from unnest(array['anon','authenticated']) r(role), unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) p(priv)
   where has_table_privilege(r.role, 'public.food_composition', p.priv)), 0);
select t.eq('4-11 食品成分表のポリシーは read_auth（select・authenticated）だけ', (
  select count(*) from pg_policies where schemaname = 'public' and tablename = 'food_composition'
     and not (policyname = 'read_auth' and cmd = 'SELECT' and roles = '{authenticated}')), 0);
begin;
set local role service_role;
select t.affects('4-12 service role: 食品成分表に入れられる', $$insert into food_composition (food_code, food_name) values ('X4', 'x')$$, 1);
select t.affects('4-13 service role: 食品成分表を直せる', $$update food_composition set energy_kcal = 1 where food_code = 'X4'$$, 1);
select t.affects('4-14 service role: 食品成分表を消せる', $$delete from food_composition where food_code = 'X4'$$, 1);
rollback;

-- ═════ 5. ビューと replace_dish_recipe は施設で絞られる ═════
begin;
set local role authenticated;
select t.login(t.ua());
select t.eq('5-8 uA: v_daily_nutrition は自分の施設の献立だけ', (select count(*) from v_daily_nutrition), 1);
select t.eq('5-9 uA: v_dish_nutrition は自分の施設の料理だけ',
  (select count(*) from v_dish_nutrition v join dishes d on d.id = v.dish_id), (select count(*) from v_dish_nutrition));
select t.eq('5-10 uA: v_dish_nutrition に施設Bの料理が出ない',
  (select count(*) from v_dish_nutrition where dish_id = (select id from dishes where name = 'Bの焼き魚')), 0);
select t.eq('5-11 uA: v_menu_set_dishes は自分の施設の献立セットだけ', (select count(*) from v_menu_set_dishes), 1);
select t.eq('5-12 uA: v_menuset_nutrition は自分の施設の献立セットだけ', (select count(*) from v_menuset_nutrition), 1);
select t.ok('5-13 uA: v_daily_ingredient_totals は自分の施設の食材だけ（見本の魚 80g×10食）',
  (select count(*) from v_daily_ingredient_totals) = 1 and
  (select total_g from v_daily_ingredient_totals) = 800);
rollback;

begin;
set local role authenticated;
select t.login(t.ua());
select t.fails('5-14 uA: replace_dish_recipe で施設Bの料理を書けない',
  format($$select replace_dish_recipe(%s, '[{"ingredient_id": %s, "amount_g": 1}]'::jsonb)$$,
         current_setting('t.b_dish'), current_setting('t.a_ing')));
select t.fails('5-15 uA: replace_dish_recipe で施設Bの料理を空にできない',
  format($$select replace_dish_recipe(%s, '[]'::jsonb)$$, current_setting('t.b_dish')));
select t.fails('5-16 uA: replace_dish_recipe で施設Bの食材を自分の料理に入れられない',
  format($$select replace_dish_recipe(%s, '[{"ingredient_id": %s, "amount_g": 1}]'::jsonb)$$,
         current_setting('t.a_dish'), current_setting('t.b_ing')));
select replace_dish_recipe(current_setting('t.a_dish')::bigint,
  format('[{"ingredient_id": %s, "amount_g": 90, "sort_order": 0}]', current_setting('t.a_ing'))::jsonb);
select t.ok('5-17 uA: replace_dish_recipe で自分の料理は入れ替えられ、明細は自分の施設に入る',
  (select count(*) from dish_ingredients where dish_id = current_setting('t.a_dish')::bigint) = 1 and
  (select facility_id from dish_ingredients where dish_id = current_setting('t.a_dish')::bigint) = t.fd() and
  (select amount_g from dish_ingredients where dish_id = current_setting('t.a_dish')::bigint) = 90);
rollback;
select t.ok('5-18 施設Bの料理のレシピは変わっていない（1行・150g）',
  (select count(*) from dish_ingredients where dish_id = current_setting('t.b_dish')::bigint) = 1 and
  (select amount_g from dish_ingredients where dish_id = current_setting('t.b_dish')::bigint) = 150);


-- ═════ 6. 施設・会員の表 ═════
begin;
set local role authenticated;
select t.login(t.ua());
select t.eq('6-1 uA: 会員の表は自分の行だけ読める', (select count(*) from facility_members), 1);
select t.eq('6-2 uA: 施設の表は自分が会員の施設だけ読める', (select count(*) from facilities), 1);
select t.fails('6-3 uA: 自分を施設Bの会員にできない', $$insert into facility_members (user_id, facility_id) values (t.ua(), t.fb())$$);
select t.fails('6-4 uA: 自分を admin にできない', $$update facility_members set role = 'admin'$$);
select t.fails('6-5 uA: 会員の行を消せない', $$delete from facility_members$$);
select t.fails('6-6 uA: 施設を作れない', $$insert into facilities (name) values ('勝手な施設')$$);
rollback;

-- 1人1施設（SQL エディタ＝postgres で登録しても断られる）
select t.fails_with('6-9 1人1施設: 既定の施設の会員を施設Bの会員にも登録できない',
  $$insert into facility_members (user_id, facility_id) values (t.ua(), t.fb())$$, '23505');
begin;
delete from facility_members where user_id = t.ua();
insert into facility_members (user_id, facility_id) values (t.ua(), t.fb());
select t.eq('6-10 1人1施設: 施設を移す時は消してから入れ直せる',
  (select count(*) from facility_members where user_id = t.ua() and facility_id = t.fb()), 1);
rollback;

-- ═════ 7. 表どうしの参照は同じ施設の中だけ（2列の外部キー） ═════
-- 自分の施設の行（facility_id = 既定の施設）から、施設Bの id を指す insert／update。
-- RLS（with check）は通る形なので、断るのは外部キー（23503）であることを状態コードで確かめる。
-- uA（ログイン・RLS あり）と postgres（SQL エディタ・service role と同じく RLS を通らない）の両方で試す。
create table t.xref (n int, label text, stmt text);
insert into t.xref values
  (1,  '料理→献立セット（insert）',
       format($$insert into dishes (facility_id, name, dish_type, owner_menu_set_id) values (%L, 'A→Bのセット', 'main', %s)$$, t.fd(), current_setting('t.b_set'))),
  (2,  '料理→献立セット（update）',
       format($$update dishes set owner_menu_set_id = %s where id = %s$$, current_setting('t.b_set'), current_setting('t.a_dish'))),
  (3,  '献立セット→主食（update）', format($$update menu_sets set staple_dish_id = %s where id = %s$$, current_setting('t.b_dish'), current_setting('t.a_set'))),
  (4,  '献立セット→主菜（update）', format($$update menu_sets set main_dish_id = %s where id = %s$$, current_setting('t.b_dish'), current_setting('t.a_set'))),
  (5,  '献立セット→副1（update）',  format($$update menu_sets set side1_dish_id = %s where id = %s$$, current_setting('t.b_dish'), current_setting('t.a_set'))),
  (6,  '献立セット→副2（update）',  format($$update menu_sets set side2_dish_id = %s where id = %s$$, current_setting('t.b_dish'), current_setting('t.a_set'))),
  (7,  '献立セット→汁（update）',   format($$update menu_sets set soup_dish_id = %s where id = %s$$, current_setting('t.b_dish'), current_setting('t.a_set'))),
  (8,  '献立セット→主菜（insert）',
       format($$insert into menu_sets (facility_id, code, category, main_dish_id) values (%L, 'A→B', '魚', %s)$$, t.fd(), current_setting('t.b_dish'))),
  (9,  '料理の材料→食材（insert）',
       format($$insert into dish_ingredients (facility_id, dish_id, ingredient_id) values (%L, %s, %s)$$, t.fd(), current_setting('t.a_dish'), current_setting('t.b_ing'))),
  (10, '料理の材料→食材（update）',
       format($$update dish_ingredients set ingredient_id = %s where dish_id = %s$$, current_setting('t.b_ing'), current_setting('t.a_dish'))),
  (11, '料理の材料→料理（insert）',
       format($$insert into dish_ingredients (facility_id, dish_id, ingredient_id) values (%L, %s, %s)$$, t.fd(), current_setting('t.b_dish'), current_setting('t.a_ing'))),
  (12, '料理の材料→料理（update）',
       format($$update dish_ingredients set dish_id = %s where dish_id = %s$$, current_setting('t.b_dish'), current_setting('t.a_dish'))),
  (13, '日ごとの献立→朝（insert）',
       format($$insert into daily_menus (facility_id, menu_date, breakfast_set_id) values (%L, '2099-07-01', %s)$$, t.fd(), current_setting('t.b_set'))),
  (14, '日ごとの献立→昼（insert）',
       format($$insert into daily_menus (facility_id, menu_date, lunch_set_id) values (%L, '2099-07-02', %s)$$, t.fd(), current_setting('t.b_set'))),
  (15, '日ごとの献立→夕（insert）',
       format($$insert into daily_menus (facility_id, menu_date, dinner_set_id) values (%L, '2099-07-03', %s)$$, t.fd(), current_setting('t.b_set'))),
  (16, '日ごとの献立→おやつ（insert）',
       format($$insert into daily_menus (facility_id, menu_date, snack_dish_id) values (%L, '2099-07-04', %s)$$, t.fd(), current_setting('t.b_dish'))),
  (17, '日ごとの献立→朝（update）',
       format($$update daily_menus set breakfast_set_id = %s where facility_id = %L and menu_date = '2099-01-01'$$, current_setting('t.b_set'), t.fd())),
  (18, '日ごとの献立→昼（update）',
       format($$update daily_menus set lunch_set_id = %s where facility_id = %L and menu_date = '2099-01-01'$$, current_setting('t.b_set'), t.fd())),
  (19, '日ごとの献立→夕（update）',
       format($$update daily_menus set dinner_set_id = %s where facility_id = %L and menu_date = '2099-01-01'$$, current_setting('t.b_set'), t.fd())),
  (20, '日ごとの献立→おやつ（update）',
       format($$update daily_menus set snack_dish_id = %s where facility_id = %L and menu_date = '2099-01-01'$$, current_setting('t.b_dish'), t.fd()));
grant select on t.xref to authenticated;

begin;
set local role authenticated;
select t.login(t.ua());
select t.fails_with('7-'|| x.n ||' uA: '|| x.label ||' で施設Bの id を指せない', x.stmt, '23503') from t.xref x order by x.n;
-- 他施設の id があるかどうかは、エラーの違いで分からない（無い id と同じ形で断られる）
select t.ok('7-21 uA: 施設Bの献立セット id と、どこにも無い id で、断られ方が同じ',
  t.errsig(format($$insert into dishes (name, dish_type, owner_menu_set_id) values ('x', 'main', %s)$$, current_setting('t.b_set')))
  = t.errsig($$insert into dishes (name, dish_type, owner_menu_set_id) values ('x', 'main', 987654321)$$)
  and t.errsig($$insert into dishes (name, dish_type, owner_menu_set_id) values ('x', 'main', 987654321)$$) like '23503 |%');
select t.ok('7-22 uA: 施設Bの料理 id と、どこにも無い id で、献立セットの更新の断られ方が同じ',
  t.errsig(format($$update menu_sets set main_dish_id = %s where id = %s$$, current_setting('t.b_dish'), current_setting('t.a_set')))
  = t.errsig(format($$update menu_sets set main_dish_id = 987654321 where id = %s$$, current_setting('t.a_set'))));
rollback;

begin;
select t.fails_with('7-'|| (x.n + 100) ||' postgres（RLS なし）: '|| x.label ||' で施設Bの id を指せない', x.stmt, '23503')
  from t.xref x order by x.n;
rollback;

-- 同じ施設の中なら指せる（2列の外部キーが自分の施設の参照まで止めていないこと）
begin;
set local role authenticated;
select t.login(t.ua());
select t.affects('7-30 uA: 自分の献立セットの主菜を自分の料理に付け替えられる',
  format($$update menu_sets set main_dish_id = %s where id = %s$$, current_setting('t.a_dish'), current_setting('t.a_set')), 1);
select t.affects('7-31 uA: 自分の施設の献立セットで日ごとの献立を入れられる',
  format($$insert into daily_menus (menu_date, lunch_set_id) values ('2099-07-10', %s)$$, current_setting('t.a_set')), 1);
select t.affects('7-32 uA: 自分の料理・食材で明細を入れられる',
  format($$insert into dish_ingredients (dish_id, ingredient_id, amount_g) values (%s, %s, 1)$$, current_setting('t.a_dish'), current_setting('t.a_ing')), 1);
rollback;

-- 親の facility_id を、子が指しているまま他施設へ移せない（on update は no action）
select t.fails_with('7-33 postgres: 子に指されている施設Bの献立セットを既定の施設へ移せない',
  format($$update menu_sets set facility_id = %L, code = 'B移' where id = %s$$, t.fd(), current_setting('t.b_set')), '23503');

-- on delete の意味は 0001 と同じ（set null はその列だけ空にし、facility_id は残す）
begin;
delete from dishes where id = current_setting('t.b_dish')::bigint;
select t.ok('7-34 料理を消すと献立セットの主菜だけ空になり、セットは施設Bに残る（set null (列)）',
  (select main_dish_id is null and facility_id = t.fb() from menu_sets where id = current_setting('t.b_set')::bigint));
select t.eq('7-35 料理を消すと明細も消える（cascade）',
  (select count(*) from dish_ingredients where dish_id = current_setting('t.b_dish')::bigint), 0);
rollback;
begin;
delete from menu_sets where id = current_setting('t.b_set')::bigint;
select t.ok('7-36 献立セットを消すと日ごとの献立の昼だけ空になり、献立は施設Bに残る（set null (列)）',
  (select lunch_set_id is null and facility_id = t.fb() from daily_menus where facility_id = t.fb() and menu_date = '2099-01-01'));
select t.eq('7-37 献立セットを消すとセットの料理も消える（cascade）',
  (select count(*) from dishes where id = current_setting('t.b_dish')::bigint), 0);
rollback;
select t.fails_with('7-38 明細に使われている食材は消せない（no action）',
  format('delete from ingredients where id = %s', current_setting('t.b_ing')), '23503');
