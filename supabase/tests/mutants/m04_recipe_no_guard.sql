-- 壊した版: replace_dish_recipe から施設の確かめを抜く（明細の施設は既定値任せ）→ 5-14・5-16・5-19 が落ちるはず
create or replace function replace_dish_recipe(p_dish_id bigint, p_rows jsonb)
returns void language plpgsql security invoker set search_path = public
as $$
begin
  delete from dish_ingredients where dish_id = p_dish_id;
  insert into dish_ingredients (dish_id, ingredient_id, amount_g, sort_order)
  select p_dish_id, (r->>'ingredient_id')::bigint, (r->>'amount_g')::numeric, coalesce((r->>'sort_order')::int, 0)
  from jsonb_array_elements(p_rows) as r;
end;
$$;
