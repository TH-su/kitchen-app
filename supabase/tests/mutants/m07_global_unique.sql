-- 壊した版: 献立の日付を全体で一意のままにする → 別施設の同じ日付が入らず落ちるはず
create unique index daily_menus_menu_date_global on public.daily_menus (menu_date);
