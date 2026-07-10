-- 料理レシピ明細の入れ替え（DELETE→INSERT）を1トランザクション化する DB 関数。
-- 従来はクライアントから DELETE と INSERT を別リクエストで送っており、
-- DELETE 成功後の INSERT 失敗（通信断・制約違反）で既存レシピだけが消える窓があった。
-- 関数内は暗黙の単一トランザクションのため、INSERT 失敗時は DELETE も巻き戻る。
--
-- セマンティクスは従来の saveDishRecipe と同一:
--   ・p_rows が空配列 = レシピを空にする意図（全削除・正常系）
--   ・sort_order は呼び出し側が行順で採番したものをそのまま保存（表示順維持）
--   ・memo 列は従来の INSERT でも未設定（null）のため対象外
create or replace function replace_dish_recipe(p_dish_id bigint, p_rows jsonb)
returns void
language plpgsql
security invoker   -- RLS（write_auth ポリシー）を呼び出しユーザーの権限のまま適用する
set search_path = public
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;
  delete from dish_ingredients where dish_id = p_dish_id;
  insert into dish_ingredients (dish_id, ingredient_id, amount_g, sort_order)
  select p_dish_id,
         (r->>'ingredient_id')::bigint,
         (r->>'amount_g')::numeric,          -- jsonb null → SQL null（適量＝調味料）
         coalesce((r->>'sort_order')::int, 0)
  from jsonb_array_elements(p_rows) as r;
end;
$$;

-- 既定では public に EXECUTE が付与されるため、ログイン済みユーザーのみに限定する
revoke execute on function replace_dish_recipe(bigint, jsonb) from public;
grant execute on function replace_dish_recipe(bigint, jsonb) to authenticated;
