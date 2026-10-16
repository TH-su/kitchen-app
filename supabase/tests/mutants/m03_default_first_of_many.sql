-- 壊した版: 2施設の会員でも1つ目の施設を既定値にする（黙ってどちらかへ書く）→ 3-12・3-13 が落ちるはず
create or replace function private.current_facility_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select (array_agg(m.facility_id order by m.facility_id))[1]
    from public.facility_members m where m.user_id = auth.uid()
$$;
