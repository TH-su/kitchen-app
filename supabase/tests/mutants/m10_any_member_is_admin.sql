-- 壊した版: admin の判定で役割を見ない（会員なら誰でも食品成分表を直せる）→ 4-2〜4-4 が落ちるはず
create or replace function private.is_any_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.facility_members m where m.user_id = auth.uid()) $$;
