-- 試験専用: Supabase が最初から持っている役割と auth の仕組みを、素の PostgreSQL に真似て作る。
-- 本番の Supabase には流さない（本番には最初からある）。介護ツールの基盤（care-backend）の試験と同じ形。

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

-- Supabase と同じく、リクエストの JWT は request.jwt.claims に入る
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated, service_role;

-- ログインの利用者の表（0010 が会員の一斉登録で読み、facility_members が参照する）。
-- 試験に要る列だけを持つ（メールなどは持たない）
create table auth.users (
  id         uuid primary key,
  created_at timestamptz not null default now()
);

-- Supabase の public スキーマの既定権限（全部配る）を再現する。
-- 守りが RLS で効いているかを確かめるため、わざと緩い状態から始める。
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- 0002 が前提にしている realtime の配信先
create publication supabase_realtime;
