-- 壊した版: 料理の材料→食材（dish_ingredients.ingredient_id） の外部キーを1列（ingredient_id だけ）に戻す（他施設の id を指せる）→ 7-9・7-10・7-109・7-110 が落ちるはず
alter table public.dish_ingredients drop constraint dish_ingredients_ingredient_fkey;
alter table public.dish_ingredients add constraint dish_ingredients_ingredient_fkey foreign key (ingredient_id) references public.ingredients (id) ;
