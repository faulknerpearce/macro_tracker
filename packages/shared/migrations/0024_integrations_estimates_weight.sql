-- 0024_integrations_estimates_weight.sql  (applied to production 2026-11-15)
-- Fitness tracker connections (Google Health first), provenance on food/activity logs
-- (weighed vs unit vs estimate, who logged it), weight history and check-in cadence.
-- Self-contained: safe to run whether or not 0025–0028 have been applied.

begin;

-- ── How each entry was measured, and by whom ─────────────────────────────────
alter table public.food_entries
  add column if not exists log_method text
    check (log_method is null or log_method in ('weighed', 'unit', 'estimate', 'recipe', 'barcode', 'sync')),
  add column if not exists confidence text
    check (confidence is null or confidence in ('high', 'medium', 'low')),
  add column if not exists estimate_notes text not null default '',
  add column if not exists logged_via text not null default 'app'
    check (logged_via in ('app', 'mcp', 'sync', 'import'));

alter table public.activities
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'mcp', 'google_health', 'import')),
  add column if not exists external_id text,
  add column if not exists log_method text
    check (log_method is null or log_method in ('device', 'measured', 'estimate')),
  add column if not exists intensity text
    check (intensity is null or intensity in ('light', 'moderate', 'vigorous')),
  add column if not exists confidence text
    check (confidence is null or confidence in ('high', 'medium', 'low')),
  add column if not exists estimate_notes text not null default '',
  -- true when the tracker's day total already includes this workout's calories,
  -- so energy math must not add them on top (avoids double counting)
  add column if not exists counted_in_device_total boolean not null default false,
  add column if not exists synced_at timestamptz;

-- Re-syncing the same tracker workout updates it instead of duplicating it.
-- A plain (non-partial) unique index so PostgREST upserts can target it; NULL external_ids
-- (manual logs) never conflict because NULLs are distinct.
create unique index if not exists activities_source_external_uq
  on public.activities (user_id, source, external_id);

-- ── Fitness tracker connections ──────────────────────────────────────────────
create table if not exists public.fitness_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('google_health')),
  status text not null default 'active' check (status in ('active', 'needs_reauth', 'error')),
  scopes text[] not null default '{}',
  external_user_id text,
  -- AES-GCM ciphertext (key = Cloudflare secret INTEGRATION_ENCRYPTION_KEY). Readable by the
  -- owner through RLS, but useless without the server key.
  refresh_token_ciphertext text not null,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  settings jsonb not null default
    '{"import_workouts": true, "import_calories": true, "import_steps": true, "import_weight": true}'::jsonb,
  last_synced_at timestamptz,
  last_sync_summary jsonb,
  last_error text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);
alter table public.fitness_connections enable row level security;
create policy "Own fitness connections" on public.fitness_connections for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Daily metrics from trackers (same definition as 0026) ────────────────────
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
drop policy if exists "Own daily metrics" on public.daily_metrics;
create policy "Own daily metrics" on public.daily_metrics for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter table public.daily_metrics add column if not exists source text not null default 'manual';

-- ── Weight history (same definition as 0026, plus sync de-duplication) ───────
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
alter table public.body_measurements add column if not exists external_id text;
alter table public.body_measurements add column if not exists logged_via text not null default 'app';
create index if not exists body_measurements_user_date_idx on public.body_measurements (user_id, measured_on desc);
create unique index if not exists body_measurements_external_uq
  on public.body_measurements (user_id, source, external_id);
alter table public.body_measurements enable row level security;
drop policy if exists "Own measurements" on public.body_measurements;
create policy "Own measurements" on public.body_measurements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ── Weight check-in cadence ─────────────────────────────────────────────────
-- Weekly by default: daily weigh-ins mostly show water swings, not progress.
alter table public.profiles
  add column if not exists weight_tracking boolean not null default false,
  add column if not exists weight_checkin_days integer not null default 7,
  add column if not exists weight_checkin_snoozed_until date;
alter table public.profiles drop constraint if exists profiles_weight_checkin_days_check;
alter table public.profiles add constraint profiles_weight_checkin_days_check
  check (weight_checkin_days between 3 and 30);

-- Keep profiles.weight_kg (used for BMR) in step with the newest measurement
create or replace function public.sync_profile_weight() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if new.weight_kg is not null and not exists (
    select 1 from public.body_measurements m
    where m.user_id = new.user_id and m.weight_kg is not null
      and (m.measured_on, m.measured_at) > (new.measured_on, new.measured_at)
  ) then
    update public.profiles set weight_kg = round(new.weight_kg, 1) where id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists sync_profile_weight on public.body_measurements;
create trigger sync_profile_weight after insert or update of weight_kg on public.body_measurements
  for each row execute function public.sync_profile_weight();

commit;
