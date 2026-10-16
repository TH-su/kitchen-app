-- 壊した版: 食品成分表をログインした人なら誰でも直せるようにする（0001 の write_auth の再来）→ 4-2〜4-4 が落ちるはず
create policy "write_auth" on public.food_composition for all to authenticated using (true) with check (true);
