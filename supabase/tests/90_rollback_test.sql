-- 戻し（rollback/0010_back.sql）の試験。10 の試験の後に、施設Bのデータを片付けてから戻す。
-- 戻した後は 0009 までと同じ「ログインした人なら全部読み書き」になり、既存データが残っていることを見る。
\set ON_ERROR_STOP 1

-- 料理・食材の id を控える（10 とは別の接続なので取り直す）
select set_config('t.a_dish', (select id::text from dishes where name = '見本の焼き魚'), false);
select set_config('t.a_ing',  (select id::text from ingredients where facility_id = t.fd() and name = '見本の米'), false);

-- 施設Bの行が残っている間に戻しを流すと止まる（run.sh が 9-1 として別に流して確かめる）
select t.ok('9-2 止まった戻しは何も変えていない（facility_id も施設Bも残る）',
  to_regclass('public.facilities') is not null and (select count(*) from daily_menus where facility_id = t.fb()) = 1);

-- 施設Bを片付けて戻す
update menu_sets set main_dish_id = null where facility_id = t.fb();
delete from dish_ingredients where facility_id = t.fb();
delete from daily_menus where facility_id = t.fb();
delete from dishes where facility_id = t.fb();
delete from menu_sets where facility_id = t.fb();
delete from ingredients where facility_id = t.fb();
delete from report_staff where facility_id = t.fb();
delete from app_settings where facility_id = t.fb();
\ir ../rollback/0010_back.sql

select t.eq('9-3 戻した後: facility_id の列が無い',
  (select count(*) from information_schema.columns where table_schema = 'public' and column_name = 'facility_id'), 0);
select t.ok('9-4 戻した後: 施設・会員の表が無い',
  to_regclass('public.facilities') is null and to_regclass('public.facility_members') is null);
select t.ok('9-5 戻した後: 既存データが残っている',
  (select count(*) from daily_menus) = 1 and (select count(*) from dish_ingredients) = 1 and (select count(*) from app_settings) = 1);
select t.fails('9-6 戻した後: 日付の一意は全体に戻る', $$insert into daily_menus (menu_date) values ('2099-01-01')$$);
begin;
set local role authenticated;
select t.login(t.ub());
select t.ok('9-7 戻した後: ログインした人なら全部読める', (select count(*) from daily_menus) = 1);
insert into daily_menus (menu_date) values ('2099-06-01') on conflict (menu_date) do update set note = 'x';
select t.eq('9-8 戻した後: 旧来の upsert（onConflict: menu_date）が通る', (select count(*) from daily_menus where menu_date = '2099-06-01'), 1);
select replace_dish_recipe(current_setting('t.a_dish')::bigint, format('[{"ingredient_id": %s, "amount_g": 5}]', current_setting('t.a_ing'))::jsonb);
select t.eq('9-9 戻した後: replace_dish_recipe が動く', (select count(*) from dish_ingredients where amount_g = 5), 1);
rollback;
begin;
set local role anon;
select t.eq('9-10 戻した後も未ログインは読めない', (select count(*) from daily_menus), 0);
rollback;

-- もう一度当て直せる（戻した後に 0010 を再適用）
\ir ../migrations/0010_facility_scope.sql
select t.ok('9-11 戻した後に 0010 を当て直せる（既存データは既定の施設へ）',
  (select count(*) from daily_menus where facility_id = t.fd()) = 1 and
  (select count(*) from facility_members where facility_id = t.fd()) >= 2);
