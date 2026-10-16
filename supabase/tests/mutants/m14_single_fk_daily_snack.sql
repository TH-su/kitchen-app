-- 壊した版: 日ごとの献立→おやつ（daily_menus.snack_dish_id） の外部キーを1列（snack_dish_id だけ）に戻す（他施設の id を指せる）→ 7-16・7-20・7-116・7-120 が落ちるはず
alter table public.daily_menus drop constraint daily_menus_snack_dish_fkey;
alter table public.daily_menus add constraint daily_menus_snack_dish_fkey foreign key (snack_dish_id) references public.dishes (id) on delete set null;
