-- =====================================================================
-- v_daily_ingredient_totals の修正（任意）
--   旧版は IN 結合のため、同一献立セットを複数の食事に割り当てると
--   その食材を1回分しか計上しなかった。食事スロットを行展開して
--   回数ぶん計上するよう修正（アプリのクライアント集計と一致させる）。
--   ※アプリ画面はクライアント側で集計しているため、このビューは
--     SQL帳票・外部レポート用。未実行でもアプリ動作に影響なし。
-- 適用方法: Supabase SQL Editor に貼り付けて実行
-- =====================================================================
create or replace view v_daily_ingredient_totals with (security_invoker=on) as
with day_dishes as (
  select dm.id as daily_menu_id, dm.meal_count, msd.dish_id
  from daily_menus dm
  cross join lateral (values (dm.breakfast_set_id), (dm.lunch_set_id), (dm.dinner_set_id)) slot(set_id)
  join v_menu_set_dishes msd on msd.menu_set_id = slot.set_id
  where slot.set_id is not null
  union all
  select dm.id, dm.meal_count, dm.snack_dish_id
  from daily_menus dm
  where dm.snack_dish_id is not null
)
select
  dd.daily_menu_id,
  di.ingredient_id,
  ing.name as ingredient_name,
  sum(di.amount_g) as per_person_g,
  sum(di.amount_g * dd.meal_count) as total_g
from day_dishes dd
join dish_ingredients di on di.dish_id = dd.dish_id
join ingredients ing on ing.id = di.ingredient_id
where di.amount_g is not null
group by dd.daily_menu_id, di.ingredient_id, ing.name;
