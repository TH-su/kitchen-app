-- =====================================================================
-- 0008: 読み取りをログイン済みユーザーに限定する
--
-- 背景:
--   0001_init.sql:215 の read_all は `to <role>` を指定していないため PUBLIC ロール
--   ＝未ログイン(anon)にも適用されていた。anon キーは公開バンドルに埋め込まれて配信
--   されるため、URLとキーを拾えば誰でも PostgREST を直接叩いて全件取得できる状態だった。
--   0005 で daily_menus に kenshoku / nisshi（検食者・調理担当者の氏名、検食所見）を
--   格納し始めており、実在職員の氏名が無認証で読める状態になっていた。
--   0007 は report_staff だけ `to authenticated` にしていたが、実データが溜まる
--   daily_menus 側が取り残されていた。
--
-- 画面への影響:
--   なし。App.tsx が未ログインを全面的にログイン画面へ倒しており、匿名で読めていた
--   経路はアプリ内では使われていない（匿名閲覧の運用が無いことを 2026-08-10 に確認済み）。
--
-- 適用手順:
--   Supabase ダッシュボード > SQL Editor にこのファイルの内容を貼り付けて実行する。
--
-- ロールバック:
--   下部のコメント内の SQL を実行すると 0001 時点の挙動へ戻る。
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'food_composition','ingredients','menu_sets','dishes','dish_ingredients','daily_menus'
  ] loop
    execute format('drop policy if exists "read_all" on %I;', t);
    execute format('create policy "read_auth" on %I for select to authenticated using (true);', t);
  end loop;
end $$;

-- 検証: 未ログイン(anon)で読めないこと・ログイン済みで従来どおり読めることを確認する。
--   select tablename, policyname, roles, cmd from pg_policies
--   where schemaname = 'public' order by tablename, policyname;
--   → 各テーブルに read_auth {authenticated} SELECT と write_auth {authenticated} ALL が並び、
--     roles が {public} の行が1つも無いこと。

-- ---------------------------------------------------------------------
-- ロールバック（0001 の挙動に戻す。※匿名読み取りが再び開くので通常は使わない）
--   do $$
--   declare t text;
--   begin
--     foreach t in array array[
--       'food_composition','ingredients','menu_sets','dishes','dish_ingredients','daily_menus'
--     ] loop
--       execute format('drop policy if exists "read_auth" on %I;', t);
--       execute format('create policy "read_all" on %I for select using (true);', t);
--     end loop;
--   end $$;
-- ---------------------------------------------------------------------
