-- 壊した版: 料理→献立セット（dishes.owner_menu_set_id） の外部キーを1列（owner_menu_set_id だけ）に戻す（他施設の id を指せる）→ 7-1・7-2・7-101・7-102 が落ちるはず
alter table public.dishes drop constraint dishes_owner_menu_set_fkey;
alter table public.dishes add constraint dishes_owner_menu_set_fkey foreign key (owner_menu_set_id) references public.menu_sets (id) on delete cascade;
