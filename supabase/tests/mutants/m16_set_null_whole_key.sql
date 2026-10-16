-- 壊した版: 献立セット→主菜の set null を列の指定なしにする（料理を消すと facility_id まで null にしようとして not null に当たる）
--   → 0-19・7-34 が落ちるはず
alter table public.menu_sets drop constraint menu_sets_main_dish_fkey;
alter table public.menu_sets add constraint menu_sets_main_dish_fkey foreign key (main_dish_id, facility_id)
  references public.dishes (id, facility_id) on delete set null;
