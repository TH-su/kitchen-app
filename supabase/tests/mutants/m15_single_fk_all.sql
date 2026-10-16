-- 壊した版: 表どうしの外部キー12本をすべて1列（0001 の形）に戻す → 0-17〜0-19・7-1〜7-20・7-101〜7-120 が落ちるはず
do $$
declare r record;
begin
  for r in
    select * from (values
      ('dishes',           'owner_menu_set_id', 'menu_sets',   'dishes_owner_menu_set_fkey',      'on delete cascade'),
      ('menu_sets',        'staple_dish_id',    'dishes',      'menu_sets_staple_dish_fkey',      'on delete set null'),
      ('menu_sets',        'main_dish_id',      'dishes',      'menu_sets_main_dish_fkey',        'on delete set null'),
      ('menu_sets',        'side1_dish_id',     'dishes',      'menu_sets_side1_dish_fkey',       'on delete set null'),
      ('menu_sets',        'side2_dish_id',     'dishes',      'menu_sets_side2_dish_fkey',       'on delete set null'),
      ('menu_sets',        'soup_dish_id',      'dishes',      'menu_sets_soup_dish_fkey',        'on delete set null'),
      ('dish_ingredients', 'dish_id',           'dishes',      'dish_ingredients_dish_fkey',      'on delete cascade'),
      ('dish_ingredients', 'ingredient_id',     'ingredients', 'dish_ingredients_ingredient_fkey', ''),
      ('daily_menus',      'breakfast_set_id',  'menu_sets',   'daily_menus_breakfast_set_fkey',  'on delete set null'),
      ('daily_menus',      'lunch_set_id',      'menu_sets',   'daily_menus_lunch_set_fkey',      'on delete set null'),
      ('daily_menus',      'dinner_set_id',     'menu_sets',   'daily_menus_dinner_set_fkey',     'on delete set null'),
      ('daily_menus',      'snack_dish_id',     'dishes',      'daily_menus_snack_dish_fkey',     'on delete set null')
    ) v(child, col, parent, conname, act)
  loop
    execute format('alter table public.%I drop constraint %I', r.child, r.conname);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I (id) %s',
                   r.child, r.conname, r.col, r.parent, r.act);
  end loop;
end $$;
