-- =====================================================================
-- 厨房メニュー管理アプリ 初期スキーマ
-- 適用方法: Supabase ダッシュボード > SQL Editor に貼り付けて実行
--           （または supabase CLI: supabase db push）
-- =====================================================================

-- ---------- マスタ ----------

-- 食品成分表（100gあたり）日本食品標準成分表2020年版(八訂)ベース
create table if not exists food_composition (
  id             bigint generated always as identity primary key,
  food_code      text unique not null,            -- 食品番号
  food_name      text not null,
  energy_kcal    numeric,
  protein_g      numeric,
  fat_g          numeric,
  carbohydrate_g numeric,
  salt_g         numeric,                          -- 食塩相当量
  created_at     timestamptz default now()
);

-- 食材マスタ
create table if not exists ingredients (
  id            bigint generated always as identity primary key,
  name          text unique not null,             -- 正規化後の食材名
  kana          text,
  default_unit  text default 'g',
  food_code     text references food_composition(food_code) on delete set null,  -- 成分表との紐付け（任意）
  category      text,                             -- 野菜/肉/魚/調味料 など（任意）
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 献立セット（番号: 魚⑨, 朝① など）= 現Excel「all」
create table if not exists menu_sets (
  id            bigint generated always as identity primary key,
  code          text unique not null,             -- 表示用番号（魚⑨）
  category      text not null,                    -- 朝/魚/豚/鶏/牛/ミンチ/めん/行事/その他
  seq_no        int,                              -- 並び順用（9）
  staple_dish_id bigint,                          -- 主食
  main_dish_id   bigint,                          -- メイン
  side1_dish_id  bigint,                          -- 副①
  side2_dish_id  bigint,                          -- 副②
  soup_dish_id   bigint,                          -- 汁
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 料理（主食/メイン/副/汁/おやつ）
create table if not exists dishes (
  id                bigint generated always as identity primary key,
  name              text not null,
  dish_type         text not null check (dish_type in ('staple','main','side','soup','snack')),
  owner_menu_set_id bigint references menu_sets(id) on delete cascade,  -- セット内料理は番号スコープ（同名異レシピ対応）
  code              text,                          -- おやつ(お56)/副菜(副③)の再利用番号（任意）
  notes             text,                          -- 調理メモ
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- menu_sets のスロット参照に FK を後付け（dishes と相互参照のため）
alter table menu_sets
  add constraint fk_ms_staple foreign key (staple_dish_id) references dishes(id) on delete set null,
  add constraint fk_ms_main   foreign key (main_dish_id)   references dishes(id) on delete set null,
  add constraint fk_ms_side1  foreign key (side1_dish_id)  references dishes(id) on delete set null,
  add constraint fk_ms_side2  foreign key (side2_dish_id)  references dishes(id) on delete set null,
  add constraint fk_ms_soup   foreign key (soup_dish_id)   references dishes(id) on delete set null;

-- レシピ明細（料理 × 食材 × 1人分分量）= 現Excel「all指示書」
create table if not exists dish_ingredients (
  id            bigint generated always as identity primary key,
  dish_id       bigint not null references dishes(id) on delete cascade,
  ingredient_id bigint not null references ingredients(id),
  amount_g      numeric,                          -- 1人分(g)。null = 適量（調味料）
  sort_order    int default 0,
  memo          text
);

-- 日々の献立（作業指示書1日分）
create table if not exists daily_menus (
  id               bigint generated always as identity primary key,
  menu_date        date unique not null,
  meal_count       int default 1,                 -- 食数（人数）
  breakfast_set_id bigint references menu_sets(id) on delete set null,
  lunch_set_id     bigint references menu_sets(id) on delete set null,
  dinner_set_id    bigint references menu_sets(id) on delete set null,
  snack_dish_id    bigint references dishes(id)    on delete set null,
  note             text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists idx_dishes_owner on dishes(owner_menu_set_id);
create index if not exists idx_dishes_type  on dishes(dish_type);
create index if not exists idx_dishes_code  on dishes(code);
create index if not exists idx_dish_ing_dish on dish_ingredients(dish_id);
create index if not exists idx_menu_sets_cat on menu_sets(category);

-- ---------- updated_at 自動更新 ----------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  foreach t in array array['ingredients','menu_sets','dishes','daily_menus'] loop
    execute format('drop trigger if exists trg_updated_%I on %I;', t, t);
    execute format('create trigger trg_updated_%I before update on %I
                    for each row execute function set_updated_at();', t, t);
  end loop;
end $$;

-- =====================================================================
-- 集計ビュー（栄養・分量）  security_invoker=on で基テーブルのRLSを尊重
-- =====================================================================

-- 献立セット → スロット料理の展開（ヘルパー）
create or replace view v_menu_set_dishes with (security_invoker=on) as
select ms.id as menu_set_id, slot.dish_id
from menu_sets ms
join lateral (values
  (ms.staple_dish_id),(ms.main_dish_id),(ms.side1_dish_id),(ms.side2_dish_id),(ms.soup_dish_id)
) slot(dish_id) on true
where slot.dish_id is not null;

-- 料理1人分の栄養（食材 × 成分表）
create or replace view v_dish_nutrition with (security_invoker=on) as
select
  di.dish_id,
  sum(di.amount_g/100.0 * fc.energy_kcal)    as energy_kcal,
  sum(di.amount_g/100.0 * fc.protein_g)      as protein_g,
  sum(di.amount_g/100.0 * fc.fat_g)          as fat_g,
  sum(di.amount_g/100.0 * fc.carbohydrate_g) as carbohydrate_g,
  sum(di.amount_g/100.0 * fc.salt_g)         as salt_g
from dish_ingredients di
join ingredients ing      on ing.id = di.ingredient_id
join food_composition fc  on fc.food_code = ing.food_code
where di.amount_g is not null
group by di.dish_id;

-- 献立セット1食分の栄養
create or replace view v_menuset_nutrition with (security_invoker=on) as
select
  msd.menu_set_id,
  sum(dn.energy_kcal)    as energy_kcal,
  sum(dn.protein_g)      as protein_g,
  sum(dn.fat_g)          as fat_g,
  sum(dn.carbohydrate_g) as carbohydrate_g,
  sum(dn.salt_g)         as salt_g
from v_menu_set_dishes msd
join v_dish_nutrition dn on dn.dish_id = msd.dish_id
group by msd.menu_set_id;

-- 1日トータルの栄養（朝+昼+夕+おやつ）= 要件5
create or replace view v_daily_nutrition with (security_invoker=on) as
select
  dm.id as daily_menu_id,
  dm.menu_date,
  coalesce(b.energy_kcal,0)+coalesce(l.energy_kcal,0)+coalesce(d.energy_kcal,0)+coalesce(sn.energy_kcal,0) as energy_kcal,
  coalesce(b.protein_g,0)+coalesce(l.protein_g,0)+coalesce(d.protein_g,0)+coalesce(sn.protein_g,0)         as protein_g,
  coalesce(b.fat_g,0)+coalesce(l.fat_g,0)+coalesce(d.fat_g,0)+coalesce(sn.fat_g,0)                         as fat_g,
  coalesce(b.carbohydrate_g,0)+coalesce(l.carbohydrate_g,0)+coalesce(d.carbohydrate_g,0)+coalesce(sn.carbohydrate_g,0) as carbohydrate_g,
  coalesce(b.salt_g,0)+coalesce(l.salt_g,0)+coalesce(d.salt_g,0)+coalesce(sn.salt_g,0)                     as salt_g
from daily_menus dm
left join v_menuset_nutrition b  on b.menu_set_id = dm.breakfast_set_id
left join v_menuset_nutrition l  on l.menu_set_id = dm.lunch_set_id
left join v_menuset_nutrition d  on d.menu_set_id = dm.dinner_set_id
left join v_dish_nutrition    sn on sn.dish_id     = dm.snack_dish_id;

-- 食材別の総使用量（食数連動）= 要件4
create or replace view v_daily_ingredient_totals with (security_invoker=on) as
with day_dishes as (
  select dm.id as daily_menu_id, dm.meal_count, msd.dish_id
  from daily_menus dm
  join v_menu_set_dishes msd
    on msd.menu_set_id in (dm.breakfast_set_id, dm.lunch_set_id, dm.dinner_set_id)
  union all
  select dm.id, dm.meal_count, dm.snack_dish_id
  from daily_menus dm
  where dm.snack_dish_id is not null
)
select
  dd.daily_menu_id,
  di.ingredient_id,
  ing.name                          as ingredient_name,
  sum(di.amount_g)                  as per_person_g,
  sum(di.amount_g * dd.meal_count)  as total_g
from day_dishes dd
join dish_ingredients di on di.dish_id = dd.dish_id
join ingredients ing     on ing.id = di.ingredient_id
where di.amount_g is not null
group by dd.daily_menu_id, di.ingredient_id, ing.name;

-- =====================================================================
-- RLS（厨房内ツール・メニューに個人情報なし）
--   読み取り: 誰でも可 / 書き込み: 認証済みユーザーのみ
-- =====================================================================
alter table food_composition enable row level security;
alter table ingredients      enable row level security;
alter table menu_sets        enable row level security;
alter table dishes           enable row level security;
alter table dish_ingredients enable row level security;
alter table daily_menus      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['food_composition','ingredients','menu_sets','dishes','dish_ingredients','daily_menus'] loop
    execute format('drop policy if exists "read_all" on %I;', t);
    execute format('drop policy if exists "write_auth" on %I;', t);
    execute format('create policy "read_all" on %I for select using (true);', t);
    execute format('create policy "write_auth" on %I for all to authenticated using (true) with check (true);', t);
  end loop;
end $$;
