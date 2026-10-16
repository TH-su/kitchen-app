-- 壊した版: daily_menus の with check を外す（他施設へ入れる・移せる）→ 2a-11・2a-14 が落ちるはず
drop policy "facility_rw" on public.daily_menus;
create policy "facility_rw" on public.daily_menus for all to authenticated
  using (facility_id = any ((select private.my_facility_ids())::uuid[])) with check (true);
