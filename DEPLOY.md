# GitHub Pages へのデプロイ手順（厨房メニュー管理アプリ）

push すると `.github/workflows/deploy.yml` が自動でビルド＆公開します。
初回のみ以下の設定が必要です。

## 1. GitHub にリポジトリを作成
- GitHub で新規リポジトリを作成（例: `kitchen-app`）。
- **Public** を推奨（無料アカウントで Pages を使うため。献立データに個人情報は無いので公開可）。
  - Private で公開したい場合は GitHub Pro が必要。

## 2. このフォルダを push
ターミナルで（このフォルダ `施設厨房アプリ` で）:
```bash
git remote add origin https://github.com/<ユーザー名>/kitchen-app.git
git push -u origin main
```

## 3. リポジトリに Secrets を2つ登録
リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で、
ローカルの `.env` と同じ値を登録:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

※ anon キーは公開前提の安全なキー（service_role キーは登録しない・使わない）。

## 4. Pages を有効化
**Settings → Pages → Build and deployment → Source = "GitHub Actions"** を選択。

## 5. 公開
- 上記後に `main` へ push（または Actions タブから手動実行）すると自動デプロイ。
- 公開URL: `https://<ユーザー名>.github.io/kitchen-app/`
- 以降は push するたびに自動更新されます。

## 補足
- ルーティングは HashRouter（URL に `#` が入る）なので Pages のサブパスでも 404 になりません。
- 閲覧は誰でも可・編集は Supabase ログイン必須（RLS で保護）。

---

# 施設ごとの分割（migration 0010）を本番に当てる手順

`supabase/migrations/0010_facility_scope.sql` は、厨房メニューの表を施設ごとに分けます。
今あるデータはすべて「既定の施設」（id `00000000-0000-4000-8000-000000000001`）に入り、
今いるログインの利用者は全員その施設の会員になります（＝当てた直後の見え方・使い方は今と同じ）。

**画面の新しい版（upsert の onConflict を `facility_id,…` に直した版）とセットです。**
SQL だけ・画面だけを先に出すと、献立・検食簿・給食日誌・食材の保存が失敗します（読むのは平気）。

## 当てる順番

1. **前提の確認**: SQL エディタ（Supabase ダッシュボード → 対象のプロジェクト → 左の「SQL Editor」→「New query」）に次を貼って「Run」。
   `app_settings` と `report_staff` が出れば 0007・0009 まで当たっています。
   ```sql
   select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('report_staff', 'app_settings');
   ```
2. **当てる前の行数を控える**（当てた後に同じ数か比べるため）。結果の表をコピーして残す。
   ```sql
   select 'ingredients' t, count(*) from ingredients union all
   select 'menu_sets', count(*) from menu_sets union all
   select 'dishes', count(*) from dishes union all
   select 'dish_ingredients', count(*) from dish_ingredients union all
   select 'daily_menus', count(*) from daily_menus union all
   select 'report_staff', count(*) from report_staff union all
   select 'app_settings', count(*) from app_settings union all
   select 'auth.users', count(*) from auth.users;
   ```
3. **0010 を当てる**: `supabase/migrations/0010_facility_scope.sql` の全文を新しいクエリに貼って「Run」。
   「Success. No rows returned」と出れば成功。エラーが出た時は全部取り消されている（何も変わっていない）。
4. **すぐに画面を公開し直す**: 0010 と同じコミットの画面を main へ push し、GitHub の Actions タブで
   「Deploy to GitHub Pages」が緑になるまで待つ（数分。この間は保存が失敗する）。
5. **当てた後に確かめる**（下の SQL）。
6. 画面でログインし、献立を1件保存できること・検食簿を1件保存できることを確かめる。

## 当てた後に確かめる SQL

```sql
-- (1) 施設が1つ・会員の数が利用者の数と同じ
select (select count(*) from facilities) as facilities,
       (select count(*) from auth.users) as users,
       (select count(*) from facility_members
         where facility_id = '00000000-0000-4000-8000-000000000001') as members;

-- (2) 7表の行数が手順2と同じで、すべて既定の施設に入っている（other が全部 0）
select 'ingredients' t, count(*), count(*) filter (where facility_id <> '00000000-0000-4000-8000-000000000001') other from ingredients union all
select 'menu_sets', count(*), count(*) filter (where facility_id <> '00000000-0000-4000-8000-000000000001') from menu_sets union all
select 'dishes', count(*), count(*) filter (where facility_id <> '00000000-0000-4000-8000-000000000001') from dishes union all
select 'dish_ingredients', count(*), count(*) filter (where facility_id <> '00000000-0000-4000-8000-000000000001') from dish_ingredients union all
select 'daily_menus', count(*), count(*) filter (where facility_id <> '00000000-0000-4000-8000-000000000001') from daily_menus union all
select 'report_staff', count(*), count(*) filter (where facility_id <> '00000000-0000-4000-8000-000000000001') from report_staff union all
select 'app_settings', count(*), count(*) filter (where facility_id <> '00000000-0000-4000-8000-000000000001') from app_settings;

-- (3) ポリシー: 7表は facility_rw {authenticated} ALL だけ。food_composition は read_auth と admin_insert/update/delete。
--     roles が {public} の行が1つも無いこと
select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by 1, 2;

-- (4) 一意が施設ごとになっている（4つの索引と app_settings_pkey が出る）
select indexname, indexdef from pg_indexes
 where schemaname = 'public'
   and (indexname like '%facility_%uidx' or indexname = 'app_settings_pkey');
```

## 施設・会員の登録の仕方（SQL エディタで行う）

画面には登録の入口がありません。SQL エディタ（管理者の権限で動く）で行います。

- **新しい利用者を既定の施設の会員にする**（0010 の後に作った利用者は、登録するまで何も読めず・保存できません）
  ```sql
  insert into facility_members (user_id, facility_id)
  select id, '00000000-0000-4000-8000-000000000001' from auth.users where email = '利用者のメールアドレス';
  ```
- **食品成分表を直せる人（admin）にする**
  ```sql
  update facility_members set role = 'admin'
   where user_id = (select id from auth.users where email = '利用者のメールアドレス');
  ```
- **新しい施設を作り、会員を登録する**（返ってきた id を次の行で使う）
  ```sql
  insert into facilities (name) values ('施設の名前') returning id;
  insert into facility_members (user_id, facility_id)
  select id, '上で返ってきた id' from auth.users where email = '利用者のメールアドレス';
  ```
- **会員から外す**
  ```sql
  delete from facility_members
   where user_id = (select id from auth.users where email = '利用者のメールアドレス')
     and facility_id = '外す施設の id';
  ```

### 注意

- **1人を2つの施設の会員にしない**。画面には施設の切り替えが無いので、2施設の会員は保存が断られます
  （既定値が決まらず、黙ってどちらかの施設へ書くことはしません）。読むのは両方の施設が見えます。
- **SQL エディタで7つの表に行を入れる時は facility_id を書く**（SQL エディタはログインしていない扱いなので
  既定値が決まらず、書かないと not null で断られます）。0009 の施設名の投入は次の形になります。
  ```sql
  insert into app_settings (facility_id, key, value)
  values ('00000000-0000-4000-8000-000000000001', 'facility_name', '〇〇')
  on conflict (facility_id, key) do update set value = excluded.value, updated_at = now();
  ```
- `scripts/` の投入・保守スクリプト（service role で動くもの）は facility_id を書いていないため、
  0010 の後は新しい行の投入が断られます（読む・直すだけのものは動きます）。

## 戻し方

データが「既定の施設」だけにあるうちは戻せます（他の施設の行があれば、混ぜないよう最初に止まって何も変えません）。

1. `supabase/rollback/0010_back.sql` の全文を SQL エディタに貼って「Run」。
2. 画面を 0010 の前の版に戻して公開する。**ターミナルに**次を入力（`<0010 のコミット>` は git log で確かめたコミットの番号）:
   ```bash
   cd ~/Claude/Projects/kitchen-app && git revert --no-edit <0010 のコミット> && git push
   ```
   GitHub の Actions タブで「Deploy to GitHub Pages」が緑になれば戻り完了。

## 試験（本番に当てる前に手元で）

0010 の守りは `supabase/tests/` の SQL の試験で固定しています（素の PostgreSQL＋Supabase の真似・実データは使わない）。
**ターミナルに**次を入力し、最後に「不合格 0 / エラー 0」と出れば合格:
```bash
cd ~/Claude/Projects/kitchen-app && bash supabase/tests/run.sh
```
わざと壊した版（with check を外す等）で試験が落ちることは次で確かめます（最後に「見逃し 0 本」なら合格）:
```bash
cd ~/Claude/Projects/kitchen-app && bash supabase/tests/mutants.sh
```
