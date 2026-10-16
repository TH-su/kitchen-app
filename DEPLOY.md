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
ほかに変わること:
- 表どうしの参照（料理→献立セット、献立セット→料理、料理の材料→料理・食材、日ごとの献立→献立セット・料理）は
  同じ施設の中だけになります（2列の外部キー。SQL エディタ・service role からでも他施設の id は指せません）。
- 食品成分表は全施設で共有・読むだけになります。画面・ログインした人からは誰も（admin の会員でも）書けません。
  更新は service role の `scripts/seed-composition.mjs` だけです。
- 1人1施設になります（同じ人を2つの施設の会員に登録すると断られます）。

**画面の新しい版とセットです。** 画面は、献立セットの料理・日ごとの献立の献立セットを外部キーの名前で
読み（例 `main:dishes!menu_sets_main_dish_fkey(...)`）、保存の onConflict は `facility_id,…` です。
- SQL だけを先に当てると、旧い画面は献立の読み込みが失敗します（旧い画面の列名の指定 `main_dish_id(...)` は、
  2列の外部キーに当たらないため）。保存も失敗します。
- 画面だけを先に出すと、献立の読み込み（外部キーの名前がまだ無い）と保存が失敗します。
- 当てる → すぐに画面を公開、の間は読み込み・保存とも失敗します（数分）。利用の少ない時間に行ってください。

## 当てる順番

1. **前提の確認**: SQL エディタ（Supabase ダッシュボード → 対象のプロジェクト → 左の「SQL Editor」→「New query」）に次を貼って「Run」。
   `app_settings` と `report_staff` が出れば 0007・0009 まで当たっています。
   ```sql
   select table_name from information_schema.tables
    where table_schema = 'public' and table_name in ('report_staff', 'app_settings');
   ```
   続けて次を貼って「Run」。150000 以上（PostgreSQL 15 以上）なら当てられます。それより小さい時は 0010 が
   最初に止まります（何も変わりません。「料理を消すと主菜の欄だけ空にする」書き方が 15 からのため）。
   ```sql
   show server_version_num;
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

-- (3) ポリシー: 7表は facility_rw {authenticated} ALL だけ。food_composition は read_auth {authenticated} SELECT だけ。
--     roles が {public} の行が1つも無いこと
select tablename, policyname, roles, cmd from pg_policies where schemaname = 'public' order by 1, 2;

-- (3b) 食品成分表に書ける権限が anon・authenticated に無い（8 行とも has が false なら合格）
select r.role, p.priv, has_table_privilege(r.role, 'public.food_composition', p.priv) as has
  from unnest(array['anon', 'authenticated']) r(role),
       unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p(priv);

-- (3c) 表どうしの外部キーが 12 本とも2列（cols がすべて 2 で、12 行出る）
select conrelid::regclass as tbl, conname, array_length(conkey, 1) as cols
  from pg_constraint
 where contype = 'f' and confrelid in ('menu_sets'::regclass, 'dishes'::regclass, 'ingredients'::regclass)
 order by 1, 2;

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
- **role（member／admin）は今は権限の違いに使っていません**。食品成分表は admin の会員でも画面から書けず、
  更新は service role の `scripts/seed-composition.mjs` だけです。
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
- **別の施設へ移す**（1人1施設なので、外してから入れ直す）: 上の「会員から外す」を実行してから、
  「新しい施設を作り、会員を登録する」の2行目（insert）を移す先の施設の id で実行する。

### 注意

- **1人を2つの施設の会員にしない**。画面には施設の切り替えが無いので、2施設の会員は保存が断られ
  （既定値が決まらず、黙ってどちらかの施設へ書くことはしません）、読む画面もエラーになります
  （施設名などの設定が2施設分返り、1件のつもりの読み込みが失敗するため）。
  0010 は facility_members の user_id を一意にしているので、2つ目の施設への登録はエラー（duplicate key）で断られます。
- **SQL エディタで7つの表に行を入れる時は facility_id を書く**（SQL エディタはログインしていない扱いなので
  既定値が決まらず、書かないと not null で断られます）。0009 の施設名の投入は次の形になります。
  ```sql
  insert into app_settings (facility_id, key, value)
  values ('00000000-0000-4000-8000-000000000001', 'facility_name', '〇〇')
  on conflict (facility_id, key) do update set value = excluded.value, updated_at = now();
  ```
- **`scripts/` の書く・消すスクリプトは施設の指定が必須**です。`--facility=<施設の id>` か環境変数
  `KITCHEN_FACILITY_ID` で渡します（無い・形が違う・その施設が無い時は何もせずに止まります）。
  読む・消す・書くのは指定した施設の行だけです。対象: `seed.mjs`（`npm run seed -- --facility=…`）・
  `seed-composition.mjs`（成分表は全施設共有で更新、食材の紐付けは指定した施設だけ）・`import-daily.mjs`・
  `seed-test-kondate.mjs`・`verify-mutations.mjs`（試験用の利用者をその施設の会員にしてから試し、終わったら外す）・
  `cleanup-test.mjs`・`update-amounts.mjs`。
  ```bash
  node scripts/import-daily.mjs --facility=00000000-0000-4000-8000-000000000001
  ```
- **施設の指定を持たないスクリプト**（service role で RLS を通らないため、全施設の行が混ざって見えます）:
  - `inspect-set.mjs`・`diag-coverage.mjs`・`dump-ingredients.mjs`・`verify-nutrition.mjs` は読むだけで書き換えは
    しませんが、施設が2つ以上になると他施設の行も混ざって表示されます。
  - `verify-frontend.mjs`・`verify-resolve.mjs` は未ログイン（anon）で読むため、0008 以降はもともと 0 件です。
  - `test-user.mjs` が作る試験用の利用者は、上の「新しい利用者を…会員にする」で会員に登録するまで何も読めません。

## 戻し方

データが「既定の施設」だけにあるうちは戻せます（他の施設の行があれば、混ぜないよう最初に止まって何も変えません）。

1. `supabase/rollback/0010_back.sql` の全文を SQL エディタに貼って「Run」。
   表どうしの外部キーは1列に戻りますが、名前は 0010 の名前のままです。そのため新しい画面のままでも
   献立は読めます（外部キーの名前で読んでいるため）。ただし保存（onConflict `facility_id,…`）は失敗します。
2. 画面を 0010 の前の版に戻して公開する。0010 は2つのコミット（施設ごとの分割と、その直し）に分かれているので、
   新しい方から順に両方を戻す。**ターミナルに**次を入力（`<直しのコミット>`・`<0010 のコミット>` は git log で確かめた番号）:
   ```bash
   cd ~/Claude/Projects/kitchen-app && git revert --no-edit <直しのコミット> <0010 のコミット> && git push
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
