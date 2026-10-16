-- 壊した版: 1人1施設の一意を外す（1人を2施設の会員にできる）→ 0-15・6-9 が落ちるはず
drop index public.facility_members_user_uidx;
