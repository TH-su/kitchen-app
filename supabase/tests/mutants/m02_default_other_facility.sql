-- 壊した版: 既定値が「自分が会員でない施設」を返す → 3-1 が落ちるはず
create or replace function private.current_facility_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select f.id from public.facilities f
   where not (f.id = any (private.my_facility_ids()))
   order by f.id desc limit 1
$$;
