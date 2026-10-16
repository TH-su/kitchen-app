-- 0010_facility_scope.sql の守りの試験。架空のデータだけを使う。
-- 前提: 00_supabase_stub.sql → 0001〜0009 → fixtures/05_before_0010.sql → 0010（2回）の順に流してある。
-- 判定は件数で行う（RLS は読めない行をエラーではなく「0件」で返すため）。
-- 書き込みの拒否は「例外になる」（挿入・with check 違反）か「0件しか変わらない」（using で見えない行）で見る。

\set ON_ERROR_STOP 1

-- ── 試験用の道具（care-backend の試験と同じ形） ──
create schema t;
grant usage on schema t to anon, authenticated;

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

grant execute on all functions in schema t to anon, authenticated;

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

-- ── 架空の施設B・利用者・Bのデータ（SQL エディタ＝postgres で登録する想定。facility_id は明示） ──
insert into facilities (id, name) values (t.fb(), '試験用 施設B');
insert into auth.users (id) values (t.ub()), (t.unone()), (t.uboth()), (t.uadm());
insert into facility_members (user_id, facility_id, role) values
  (t.ub(),    t.fb(), 'member'),
  (t.uboth(), t.fd(), 'member'),
  (t.uboth(), t.fb(), 'member'),
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
select t.affects('1-15 anon: '|| x.tb ||' を消せない（0件）', format('delete from %I', x.tb), 0)
  from unnest(array['food_composition','ingredients','menu_sets','dishes','dish_ingredients','daily_menus','report_staff','app_settings']) x(tb);
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

begin;
set local role authenticated;
select t.login(t.uboth());
select t.ok('3-12 2施設の会員: 既定値は null', private.current_facility_id() is null);
select t.fails('3-13 2施設の会員: facility_id を書かずに入れると断られる', $$insert into daily_menus (menu_date) values ('2099-05-01')$$);
select t.affects('3-14 2施設の会員: facility_id を書けば入れられる',
  $$insert into daily_menus (facility_id, menu_date) values (t.fb(), '2099-05-01')$$, 1);
select t.eq('3-15 2施設の会員: 両方の施設の行が読める', (select count(*) from daily_menus where menu_date = '2099-01-01'), 2);
rollback;

-- ═════ 4. 食品成分表: ログインで読める・admin の会員だけ書ける ═════
begin;
set local role authenticated;
select t.login(t.ua());
select t.eq('4-1 member: 食品成分表を読める', (select count(*) from food_composition), 2);
select t.fails('4-2 member: 食品成分表に入れられない', $$insert into food_composition (food_code, food_name) values ('X2', 'x')$$);
select t.affects('4-3 member: 食品成分表を直せない（0件）', $$update food_composition set energy_kcal = 0$$, 0);
select t.affects('4-4 member: 食品成分表を消せない（0件）', $$delete from food_composition where food_code = 'T0002'$$, 0);
rollback;

begin;
set local role authenticated;
select t.login(t.uadm());
select t.affects('4-5 admin: 食品成分表に入れられる', $$insert into food_composition (food_code, food_name) values ('X3', 'x')$$, 1);
select t.affects('4-6 admin: 食品成分表を直せる', $$update food_composition set energy_kcal = 1 where food_code = 'X3'$$, 1);
select t.affects('4-7 admin: 食品成分表を消せる', $$delete from food_composition where food_code = 'X3'$$, 1);
select t.eq('4-8 admin でも他施設（既定の施設）の献立は見えない', (select count(*) from daily_menus where facility_id = t.fd()), 0);
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

begin;
set local role authenticated;
select t.login(t.uboth());
select replace_dish_recipe(current_setting('t.b_dish')::bigint,
  format('[{"ingredient_id": %s, "amount_g": 70}]', current_setting('t.b_ing'))::jsonb);
select t.eq('5-19 2施設の会員: replace_dish_recipe は料理の施設で明細を書く（既定値の null に当たらない）',
  (select count(*) from dish_ingredients where dish_id = current_setting('t.b_dish')::bigint and facility_id = t.fb() and amount_g = 70), 1);
rollback;

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

begin;
set local role authenticated;
select t.login(t.uboth());
select t.eq('6-7 2施設の会員: 会員の表は自分の2行', (select count(*) from facility_members), 2);
select t.eq('6-8 2施設の会員: 施設の表は2施設', (select count(*) from facilities), 2);
rollback;
