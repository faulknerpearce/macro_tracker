-- 0026_personalization.sql  (PROPOSED — not applied)
-- Tracked nutrients with goal types, net target, objectives, weight history, daily metrics.

begin;

create table if not exists public.nutrients (
  key text primary key,                       -- 'protein', 'sodium'
  label text not null,
  unit text not null,                         -- 'g', 'mg', 'kcal', 'ml'
  kcal_per_unit numeric(4,1),                 -- protein 4, carbs 4, fat 9, alcohol 7
  default_goal_type text not null check (default_goal_type in ('range', 'min', 'max')),
  is_core boolean not null default false,     -- stored as a column on entries/foods
  sort_order int not null default 100
);
insert into public.nutrients (key, label, unit, kcal_per_unit, default_goal_type, is_core, sort_order) values
 ('calories', 'Calories', 'kcal', null, 'range', true, 0),
 ('protein', 'Protein', 'g', 4, 'min', true, 1),
 ('carbs', 'Carbs', 'g', 4, 'range', true, 2),
 ('fat', 'Fat', 'g', 9, 'range', true, 3),
 ('fiber', 'Fiber', 'g', null, 'min', true, 4),
 ('caffeine', 'Caffeine', 'mg', null, 'max', true, 5),
 ('sodium', 'Sodium', 'mg', null, 'max', false, 10),
 ('sugar', 'Sugar', 'g', null, 'max', false, 11),
 ('added_sugar', 'Added sugar', 'g', null, 'max', false, 12),
 ('saturated_fat', 'Saturated fat', 'g', null, 'max', false, 13),
 ('water', 'Water', 'ml', null, 'min', false, 14),
 ('alcohol', 'Alcohol', 'g', 7, 'max', false, 15),
 ('potassium', 'Potassium', 'mg', null, 'min', false, 16)
on conflict (key) do nothing;
alter table public.nutrients enable row level security;
create policy "Anyone signed in reads nutrients" on public.nutrients for select to authenticated using (true);

create table if not exists public.user_nutrient_goals (
  user_id uuid not null references auth.users (id) on delete cascade,
  nutrient_key text not null references public.nutrients (key),
  goal_type text not null check (goal_type in ('range', 'min', 'max')),
  low numeric(8,1),
  high numeric(8,1),
  enabled boolean not null default true,
  show_on_today boolean not null default true,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, nutrient_key),
  check ((goal_type = 'range' and low is not null and high is not null and low <= high)
      or (goal_type = 'min' and low is not null)
      or (goal_type = 'max' and high is not null))
);
alter table public.user_nutrient_goals enable row level security;
create policy "Own nutrient goals" on public.user_nutrient_goals for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Backfill from profiles.nutrition_goals jsonb (keep the jsonb until clients switch)
insert into public.user_nutrient_goals (user_id, nutrient_key, goal_type, low, high, sort_order)
select p.id, n.key, n.default_goal_type,
  case when n.default_goal_type in ('range', 'min') then (p.nutrition_goals -> n.key ->> case when n.default_goal_type = 'min' then 'value' else 'low' end)::numeric end,
  case when n.default_goal_type in ('range', 'max') then (p.nutrition_goals -> n.key ->> 'high')::numeric end,
  n.sort_order
from public.profiles p join public.nutrients n on p.nutrition_goals ? n.key
on conflict do nothing;

alter table public.profiles
  add column if not exists net_goal_low integer,
  add column if not exists net_goal_high integer,
  add column if not exists home_time_zone text,
  add column if not exists preferences jsonb not null default '{"units": "metric", "week_start": 1}'::jsonb;
alter table public.profiles drop constraint if exists profiles_net_goal_check;
alter table public.profiles add constraint profiles_net_goal_check
  check (net_goal_low is null or net_goal_high is null or net_goal_low <= net_goal_high);
update public.profiles set home_time_zone = time_zone where home_time_zone is null;

create table if not exists public.user_objectives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('lose', 'maintain', 'gain', 'recomp')),
  target_weight_kg numeric(5,1),
  target_date date,
  weekly_rate_kg numeric(3,2),
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now()
);
create unique index if not exists user_objectives_one_active on public.user_objectives (user_id) where ended_on is null;
alter table public.user_objectives enable row level security;
create policy "Own objectives" on public.user_objectives for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  measured_at timestamptz not null default now(),
  weight_kg numeric(5,2) check (weight_kg is null or weight_kg between 30 and 300),
  body_fat_pct numeric(4,1) check (body_fat_pct is null or body_fat_pct between 2 and 70),
  waist_cm numeric(5,1),
  source text not null default 'manual' check (source in ('manual', 'scale', 'device', 'import')),
  note text not null default ''
);
create index if not exists body_measurements_user_date_idx on public.body_measurements (user_id, measured_on desc);
alter table public.body_measurements enable row level security;
create policy "Own measurements" on public.body_measurements for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Seed history with the single profile weight
insert into public.body_measurements (user_id, measured_on, weight_kg, source, note)
select id, coalesce(created_at::date, current_date), weight_kg, 'import', 'from profile' from public.profiles where weight_kg is not null;

create table if not exists public.daily_metrics (
  user_id uuid not null references auth.users (id) on delete cascade,
  metric_date date not null,
  device_total_kcal integer check (device_total_kcal is null or device_total_kcal between 0 and 10000),
  steps integer check (steps is null or steps >= 0),
  water_ml integer check (water_ml is null or water_ml >= 0),
  resting_hr integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, metric_date)
);
alter table public.daily_metrics enable row level security;
create policy "Own daily metrics" on public.daily_metrics for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
insert into public.daily_metrics (user_id, metric_date, device_total_kcal, updated_at)
select user_id, energy_date, device_total_kcal, updated_at from public.daily_device_totals
on conflict do nothing;

commit;
