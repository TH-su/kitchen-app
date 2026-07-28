-- =====================================================================
-- 検食簿・給食日誌の職員マスタ（検食者・調理員の候補をアプリ内で追加/整理できるようにする）
--   適用方法: Supabase ダッシュボード > SQL Editor に貼り付けて実行（冪等）
--
-- ・1人1行。is_cook / is_inspector の2フラグで兼任を表す。
-- ・active=false は「使用停止」＝プルダウン候補から外すがマスタには残す（後から復帰可）。
-- ・★氏名を含むため read も authenticated 限定にする（他テーブルの read_all とは別方針）。
--   未適用・未ログイン時はアプリが env（VITE_REPORT_INSPECTORS/COOKS）へフォールバックするため
--   このテーブルが無くても画面は壊れない。
-- ・帳票（daily_menus.kenshoku/nisshi）は氏名を文字列で保存済み。マスタから消しても記録は消えない。
-- =====================================================================
create table if not exists report_staff (
  id           bigserial primary key,
  name         text    not null,
  is_cook      boolean not null default false, -- 調理員
  is_inspector boolean not null default false, -- 検食者（1人が両方を兼ねられる）
  active       boolean not null default true,  -- false=使用停止（候補から外す）
  sort_order   int     not null default 0,
  created_at   timestamptz not null default now()
);

-- 同名の重複登録を防ぐ
create unique index if not exists report_staff_name_uidx on report_staff (name);

alter table report_staff enable row level security;

drop policy if exists "read_auth"  on report_staff;
drop policy if exists "write_auth" on report_staff;
-- read も authenticated 限定＝匿名では氏名を読めない
create policy "read_auth"  on report_staff for select to authenticated using (true);
create policy "write_auth" on report_staff for all    to authenticated using (true) with check (true);

-- PostgREST のスキーマキャッシュを即時リロード（適用直後の 404/PGRST205 期間を短縮）
notify pgrst, 'reload schema';
