-- 0025_food_catalog.sql  (PROPOSED — not applied)
-- One catalog of foods used by recipes and entries. Entries keep their macro snapshot.
-- Global foods (owner_id null) = generic ingredients. Scanned barcode products are per user.
-- Non-destructive: `ingredients` stays in place until clients move to `foods`.

begin;

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete cascade,      -- null = global generic food (e.g. "banana, raw"); set = personal
  name text not null check (length(trim(name)) > 0),
  brand text not null default '',
  barcode text,
  source text not null default 'user' check (source in ('user', 'openfoodfacts', 'usda', 'generic', 'import')),
  icon text not null default 'fa-seedling',
  -- per 100 g; decimals, null = unknown
  kcal_100g numeric(7,1) not null default 0,
  protein_100g numeric(7,1) not null default 0,
  carbs_100g numeric(7,1) not null default 0,
  fat_100g numeric(7,1) not null default 0,
  fiber_100g numeric(7,1),
  caffeine_mg_100g numeric(7,1),
  extra_nutrients jsonb not null default '{}'::jsonb,              -- e.g. {"sodium_mg": 480, "sugar_g": 3.2}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Scanned barcode products always belong to the user who scanned them
  constraint foods_barcode_is_personal check (barcode is null or owner_id is not null),
  -- Global foods are generic ingredients only (seeded with the service role)
  constraint foods_global_is_generic check (owner_id is not null or source in ('generic', 'usda'))
);
create unique index if not exists foods_owner_name_brand_uq on public.foods (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)), lower(brand));
create unique index if not exists foods_owner_barcode_uq on public.foods (owner_id, barcode) where barcode is not null;
create index if not exists foods_owner_idx on public.foods (owner_id);

create table if not exists public.food_servings (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods (id) on delete cascade,
  label text not null,                 -- "1 mug", "1 bar", "1 cup cooked"
  grams numeric(7,1) not null check (grams > 0),
  is_default boolean not null default false,
  sort_order int not null default 0
);
create index if not exists food_servings_food_idx on public.food_servings (food_id);

alter table public.foods enable row level security;
alter table public.food_servings enable row level security;
create policy "Read catalog and own foods" on public.foods for select to authenticated using (owner_id is null or owner_id = (select auth.uid()));
create policy "Insert own foods" on public.foods for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Update own foods" on public.foods for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Delete own foods" on public.foods for delete to authenticated using (owner_id = (select auth.uid()));
create policy "Read servings of visible foods" on public.food_servings for select to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id and (f.owner_id is null or f.owner_id = (select auth.uid()))));
create policy "Write servings of own foods" on public.food_servings for all to authenticated
  using (exists (select 1 from public.foods f where f.id = food_id and f.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.foods f where f.id = food_id and f.owner_id = (select auth.uid())));

-- Backfill: one food per (user, name) from ingredients, keeping the newest row. Ids reused so links survive.
insert into public.foods (id, owner_id, name, icon, kcal_100g, protein_100g, carbs_100g, fat_100g, fiber_100g, caffeine_mg_100g, created_at, updated_at)
select distinct on (user_id, lower(trim(name)))
  id, user_id, trim(name), icon, per_100g_calories, per_100g_protein, per_100g_carbs, per_100g_fat, per_100g_fiber, per_100g_caffeine, created_at, updated_at
from public.ingredients
order by user_id, lower(trim(name)), updated_at desc
on conflict do nothing;

-- Recipe lines point at foods (same id where the ingredient was kept; duplicates re-pointed by name)
alter table public.recipe_ingredients add column if not exists food_id uuid references public.foods (id);
update public.recipe_ingredients ri set food_id = f.id
from public.ingredients i join public.foods f on f.owner_id = i.user_id and lower(trim(f.name)) = lower(trim(i.name))
where ri.ingredient_id = i.id and ri.food_id is null;
create index if not exists recipe_ingredients_food_idx on public.recipe_ingredients (food_id);

-- Entries: link to a food or recipe, record portion in grams, separate meal time from audit time
alter table public.food_entries
  add column if not exists food_id uuid references public.foods (id) on delete set null,
  add column if not exists serving_id uuid references public.food_servings (id) on delete set null,
  add column if not exists quantity_grams numeric(8,1) check (quantity_grams is null or quantity_grams > 0),
  add column if not exists logged_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists extra_nutrients jsonb not null default '{}'::jsonb;
update public.food_entries set logged_at = created_at where logged_at is null;
alter table public.food_entries alter column logged_at set default now();
alter table public.food_entries alter column logged_at set not null;
create index if not exists food_entries_food_idx on public.food_entries (food_id);
create index if not exists food_entries_user_logged_idx on public.food_entries (user_id, logged_at desc);

-- Quick win: link past entries to the user's food with the exact same name
update public.food_entries e set food_id = f.id
from public.foods f
where e.food_id is null and e.recipe_id is null and f.owner_id = e.user_id and lower(trim(f.name)) = lower(trim(e.name));

-- "Save as food" candidates: names logged 3+ times with no food or recipe
create or replace view public.food_save_suggestions with (security_invoker = true) as
select user_id, lower(trim(name)) as name_key, min(name) as name, count(*) as times_logged,
       round(avg(calories)) as avg_kcal, max(logged_at) as last_logged
from public.food_entries
where food_id is null and recipe_id is null
group by user_id, lower(trim(name))
having count(*) >= 3;

-- Recipe totals computed from linked foods (per batch)
create or replace view public.recipe_totals with (security_invoker = true) as
select ri.recipe_id,
  round(sum(coalesce(f.kcal_100g * ri.amount_grams / 100, ri.calories))::numeric, 1) as kcal,
  round(sum(coalesce(f.protein_100g * ri.amount_grams / 100, ri.protein))::numeric, 1) as protein,
  round(sum(coalesce(f.carbs_100g * ri.amount_grams / 100, ri.carbs))::numeric, 1) as carbs,
  round(sum(coalesce(f.fat_100g * ri.amount_grams / 100, ri.fat))::numeric, 1) as fat,
  count(*) filter (where ri.food_id is null or ri.amount_grams is null) as unlinked_lines
from public.recipe_ingredients ri left join public.foods f on f.id = ri.food_id
group by ri.recipe_id;

commit;
