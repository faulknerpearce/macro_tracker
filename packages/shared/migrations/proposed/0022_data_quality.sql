-- 0022_data_quality.sql  (PROPOSED — not applied)
-- Decimal macros, unknown-vs-zero for optional nutrients, updated_at triggers, sanity view.
-- Column type changes rewrite the tables (1k rows: instant at today's size).

begin;

-- views from 0020 depend on these columns; drop and recreate around the type change
drop view if exists public.food_save_suggestions;
drop view if exists public.recipe_totals;

alter table public.food_entries
  alter column calories type numeric(7,1), alter column protein type numeric(7,1),
  alter column carbs type numeric(7,1), alter column fat type numeric(7,1),
  alter column fiber type numeric(7,1), alter column caffeine type numeric(7,1);
alter table public.recipe_ingredients
  alter column calories type numeric(7,1), alter column protein type numeric(7,1),
  alter column carbs type numeric(7,1), alter column fat type numeric(7,1),
  alter column fiber type numeric(7,1), alter column caffeine type numeric(7,1);

-- Optional nutrients: allow null = "not recorded". Existing zeros are kept (we can't tell which were real).
alter table public.food_entries alter column fiber drop not null, alter column fiber drop default;
alter table public.food_entries alter column caffeine drop not null, alter column caffeine drop default;

-- updated_at maintenance
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['food_entries','recipes','workouts','foods','user_nutrient_goals','daily_metrics'] loop
    if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('drop trigger if exists touch_updated_at on public.%I', t);
      execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
    end if;
  end loop; end $$;

-- Entries whose macros disagree with their calories by >25% (for a "check this entry" hint)
create or replace view public.entry_macro_mismatch with (security_invoker = true) as
select id, user_id, entry_date, name, calories, (protein * 4 + carbs * 4 + fat * 9) as macro_kcal
from public.food_entries
where calories > 20 and abs((protein * 4 + carbs * 4 + fat * 9) - calories) > calories * 0.25;

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

-- Later, after clients stop writing them:
-- alter table public.food_entries drop column servings_logged;   -- superseded by portion_quantity
-- alter table public.food_entries drop column icon_bg, drop column icon_color;  -- colors come from the theme
-- Text → uuid ids for food_entries/activities (and the share FKs) need a coordinated client release; plan separately.
