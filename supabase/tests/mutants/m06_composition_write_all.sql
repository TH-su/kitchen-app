-- 壊した版: 食品成分表をログインした人なら誰でも直せるようにする（0001 の write_auth と既定の権限の再来）
--   ポリシーだけ・権限だけでは書けない（二重に断っている）ので、両方を戻す → 4-2〜4-7・4-10・4-11 が落ちるはず
grant insert, update, delete on public.food_composition to authenticated;
create policy "write_auth" on public.food_composition for all to authenticated using (true) with check (true);
