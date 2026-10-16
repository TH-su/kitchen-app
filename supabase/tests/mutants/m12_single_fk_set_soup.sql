-- 壊した版: 献立セット→汁（menu_sets.soup_dish_id） の外部キーを1列（soup_dish_id だけ）に戻す（他施設の id を指せる）→ 7-7・7-107 が落ちるはず
alter table public.menu_sets drop constraint menu_sets_soup_dish_fkey;
alter table public.menu_sets add constraint menu_sets_soup_dish_fkey foreign key (soup_dish_id) references public.dishes (id) on delete set null;
