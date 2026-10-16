-- 0010 を当てる前に入っている「今あるデータ」と「今いる利用者」の架空の見本。
-- 0010 がこれらを既定の施設に割り当て、利用者を会員にすることを試験で確かめる。実データは使わない。

insert into auth.users (id) values
  ('00000000-0000-4000-8000-0000000000a1'),   -- 今いる利用者1（試験では既定の施設の会員 uA として使う）
  ('00000000-0000-4000-8000-0000000000a2'),   -- 今いる利用者2
  ('00000000-0000-4000-8000-0000000000a3');   -- 今いる利用者3（0010 の後に会員から外し、再実行で戻らないことを見る）

insert into food_composition (food_code, food_name, energy_kcal, protein_g, fat_g, carbohydrate_g, salt_g) values
  ('T0001', '見本 米', 156, 2.5, 0.3, 37.1, 0),
  ('T0002', '見本 魚', 200, 20, 10, 0.1, 0.2);

insert into ingredients (name, food_code) values ('見本の米', 'T0001'), ('見本の魚', 'T0002');
insert into menu_sets (code, category, seq_no) values ('見本1', '魚', 1);
insert into dishes (name, dish_type, owner_menu_set_id)
  select '見本の焼き魚', 'main', id from menu_sets where code = '見本1';
update menu_sets set main_dish_id = (select id from dishes where name = '見本の焼き魚') where code = '見本1';
insert into dish_ingredients (dish_id, ingredient_id, amount_g, sort_order)
  select d.id, i.id, 80, 0 from dishes d, ingredients i where d.name = '見本の焼き魚' and i.name = '見本の魚';
insert into daily_menus (menu_date, meal_count, lunch_set_id)
  select date '2099-01-01', 10, id from menu_sets where code = '見本1';
insert into report_staff (name, is_cook) values ('見本 調理員', true);
insert into app_settings (key, value) values ('facility_name', '見本の施設名');
