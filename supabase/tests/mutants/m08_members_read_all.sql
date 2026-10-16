-- 壊した版: 会員の表を誰の行でも読めるようにする → 6-1 が落ちるはず
create policy "read_all_members" on public.facility_members for select to authenticated using (true);
