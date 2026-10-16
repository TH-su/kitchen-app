-- 壊した版: menu_sets を誰でも読めるようにする（0001 の read_all の再来）→ 0-10・1-1・2a-1 が落ちるはず
create policy "read_all" on public.menu_sets for select using (true);
