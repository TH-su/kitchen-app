-- 壊した版: ビューの security_invoker を外す（所有者の権限で読む＝RLS を素通り）→ 1-4・5-8 が落ちるはず
alter view public.v_daily_nutrition set (security_invoker = off);
