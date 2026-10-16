-- 壊した版: 食品成分表を施設の会員なら（admin でなくても）直せるようにする（旧い下書きの admin 書き込みの判定から役割を落とした形）
--   権限も戻す → 4-2〜4-7・4-10・4-11 が落ちるはず
grant insert, update, delete on public.food_composition to authenticated;
create policy "member_write" on public.food_composition for all to authenticated
  using (exists (select 1 from public.facility_members m where m.user_id = auth.uid()))
  with check (exists (select 1 from public.facility_members m where m.user_id = auth.uid()));
