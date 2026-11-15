-- 0019_fix_drift_security_rls.sql  (PROPOSED — not applied)
-- Generated from the live project's pg_policies on 2026-11-15.
-- 1) applies 0017 (gender, bmr_override) which production is missing
-- 2) RLS: evaluate auth.uid() once per query, scope policies to `authenticated`,
--    merge own + shared SELECT policies (fixes 73 initplan + 66 multiple-permissive warnings)
-- 3) indexes for 12 unindexed foreign keys
-- 4) revoke public EXECUTE on SECURITY DEFINER functions
-- Run on a branch first. Wrapped in one transaction.

begin;

-- 1) Migration 0017 (idempotent copy)
alter table public.profiles
  add column if not exists gender text not null default 'female',
  add column if not exists bmr_override numeric(6, 1);
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check
  check (gender in ('male', 'female', 'prefer_not_to_say'));
alter table public.profiles drop constraint if exists profiles_bmr_override_check;
alter table public.profiles add constraint profiles_bmr_override_check
  check (bmr_override is null or (bmr_override >= 800 and bmr_override <= 5000));

-- 2) RLS policies

-- activities
drop policy if exists "Users can view own activities" on public.activities;
drop policy if exists "Users can insert own activities" on public.activities;
drop policy if exists "Users can update own activities" on public.activities;
drop policy if exists "Users can delete own activities" on public.activities;
drop policy if exists "Users can view activities shared with them" on public.activities;
create policy "Read own or shared activities" on public.activities for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.activity_shares s where s.activity_id = activities.id and s.shared_with_user_id = (select auth.uid())));
create policy "Insert own activities" on public.activities for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own activities" on public.activities for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own activities" on public.activities for delete to authenticated using (user_id = (select auth.uid()));

-- activity_exercises
drop policy if exists "Users can view own activity exercises" on public.activity_exercises;
drop policy if exists "Users can insert own activity exercises" on public.activity_exercises;
drop policy if exists "Users can update own activity exercises" on public.activity_exercises;
drop policy if exists "Users can delete own activity exercises" on public.activity_exercises;
drop policy if exists "Users can view exercises of shared activities" on public.activity_exercises;
create policy "Read own or shared activity exercises" on public.activity_exercises for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.activity_shares s where s.activity_id = activity_exercises.activity_id and s.shared_with_user_id = (select auth.uid())));
create policy "Insert own activity exercises" on public.activity_exercises for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own activity exercises" on public.activity_exercises for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own activity exercises" on public.activity_exercises for delete to authenticated using (user_id = (select auth.uid()));

-- daily_device_totals
drop policy if exists "Users can view own device totals" on public.daily_device_totals;
drop policy if exists "Users can insert own device totals" on public.daily_device_totals;
drop policy if exists "Users can update own device totals" on public.daily_device_totals;
drop policy if exists "Users can delete own device totals" on public.daily_device_totals;
create policy "Read own device totals" on public.daily_device_totals for select to authenticated using (user_id = (select auth.uid()));
create policy "Insert own device totals" on public.daily_device_totals for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own device totals" on public.daily_device_totals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own device totals" on public.daily_device_totals for delete to authenticated using (user_id = (select auth.uid()));

-- food_entries
drop policy if exists "Users can view own entries" on public.food_entries;
drop policy if exists "Users can insert own entries" on public.food_entries;
drop policy if exists "Users can update own entries" on public.food_entries;
drop policy if exists "Users can delete own entries" on public.food_entries;
drop policy if exists "Users can view food entries shared with them" on public.food_entries;
create policy "Read own or shared entries" on public.food_entries for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.food_entry_shares s where s.food_entry_id = food_entries.id and s.shared_with_user_id = (select auth.uid())));
create policy "Insert own entries" on public.food_entries for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own entries" on public.food_entries for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own entries" on public.food_entries for delete to authenticated using (user_id = (select auth.uid()));

-- ingredients
drop policy if exists "Users can view own ingredients" on public.ingredients;
drop policy if exists "Users can insert own ingredients" on public.ingredients;
drop policy if exists "Users can update own ingredients" on public.ingredients;
drop policy if exists "Users can delete own ingredients" on public.ingredients;
create policy "Read own ingredients" on public.ingredients for select to authenticated using (user_id = (select auth.uid()));
create policy "Insert own ingredients" on public.ingredients for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own ingredients" on public.ingredients for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own ingredients" on public.ingredients for delete to authenticated using (user_id = (select auth.uid()));

-- medication_doses
drop policy if exists "Users can view own medication doses" on public.medication_doses;
drop policy if exists "Users can insert own medication doses" on public.medication_doses;
drop policy if exists "Users can update own medication doses" on public.medication_doses;
drop policy if exists "Users can delete own medication doses" on public.medication_doses;
create policy "Read own medication doses" on public.medication_doses for select to authenticated using (user_id = (select auth.uid()));
create policy "Insert own medication doses" on public.medication_doses for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own medication doses" on public.medication_doses for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own medication doses" on public.medication_doses for delete to authenticated using (user_id = (select auth.uid()));

-- medications
drop policy if exists "Users can view own medications" on public.medications;
drop policy if exists "Users can insert own medications" on public.medications;
drop policy if exists "Users can update own medications" on public.medications;
drop policy if exists "Users can delete own medications" on public.medications;
create policy "Read own medications" on public.medications for select to authenticated using (user_id = (select auth.uid()));
create policy "Insert own medications" on public.medications for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own medications" on public.medications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own medications" on public.medications for delete to authenticated using (user_id = (select auth.uid()));

-- recipe_ingredients
drop policy if exists "Users can view own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users can insert own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users can update own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users can delete own recipe ingredients" on public.recipe_ingredients;
drop policy if exists "Users can view ingredients of shared recipes" on public.recipe_ingredients;
create policy "Read own or shared recipe ingredients" on public.recipe_ingredients for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.recipe_shares s where s.recipe_id = recipe_ingredients.recipe_id and s.shared_with_user_id = (select auth.uid())));
create policy "Insert own recipe ingredients" on public.recipe_ingredients for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own recipe ingredients" on public.recipe_ingredients for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own recipe ingredients" on public.recipe_ingredients for delete to authenticated using (user_id = (select auth.uid()));

-- recipes
drop policy if exists "Users can view own recipes" on public.recipes;
drop policy if exists "Users can insert own recipes" on public.recipes;
drop policy if exists "Users can update own recipes" on public.recipes;
drop policy if exists "Users can delete own recipes" on public.recipes;
drop policy if exists "Users can view recipes shared with them" on public.recipes;
create policy "Read own or shared recipes" on public.recipes for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.recipe_shares s where s.recipe_id = recipes.id and s.shared_with_user_id = (select auth.uid())));
create policy "Insert own recipes" on public.recipes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own recipes" on public.recipes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own recipes" on public.recipes for delete to authenticated using (user_id = (select auth.uid()));

-- workout_exercises
drop policy if exists "Users can view own workout exercises" on public.workout_exercises;
drop policy if exists "Users can insert own workout exercises" on public.workout_exercises;
drop policy if exists "Users can update own workout exercises" on public.workout_exercises;
drop policy if exists "Users can delete own workout exercises" on public.workout_exercises;
drop policy if exists "Users can view exercises of shared workouts" on public.workout_exercises;
create policy "Read own or shared workout exercises" on public.workout_exercises for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.workout_shares s where s.workout_id = workout_exercises.workout_id and s.shared_with_user_id = (select auth.uid())));
create policy "Insert own workout exercises" on public.workout_exercises for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own workout exercises" on public.workout_exercises for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own workout exercises" on public.workout_exercises for delete to authenticated using (user_id = (select auth.uid()));

-- workouts
drop policy if exists "Users can view own workouts" on public.workouts;
drop policy if exists "Users can insert own workouts" on public.workouts;
drop policy if exists "Users can update own workouts" on public.workouts;
drop policy if exists "Users can delete own workouts" on public.workouts;
drop policy if exists "Users can view workouts shared with them" on public.workouts;
create policy "Read own or shared workouts" on public.workouts for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.workout_shares s where s.workout_id = workouts.id and s.shared_with_user_id = (select auth.uid())));
create policy "Insert own workouts" on public.workouts for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Update own workouts" on public.workouts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Delete own workouts" on public.workouts for delete to authenticated using (user_id = (select auth.uid()));

-- profiles
drop policy if exists "Users can view own profile" on public.profiles;
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Read own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "Update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- activity_shares
drop policy if exists "Owners can revoke activity shares" on public.activity_shares;
drop policy if exists "Recipients can dismiss activity shares" on public.activity_shares;
drop policy if exists "Owners can create activity shares" on public.activity_shares;
drop policy if exists "Users can view relevant activity shares" on public.activity_shares;
drop policy if exists "Recipients can update activity share saved copy" on public.activity_shares;
create policy "Read own activity shares" on public.activity_shares for select to authenticated using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));
create policy "Create activity shares" on public.activity_shares for insert to authenticated
  with check (owner_id = (select auth.uid()) and shared_with_user_id <> (select auth.uid())
    and exists (select 1 from public.activities p where p.id = activity_shares.activity_id and p.user_id = (select auth.uid())));
create policy "Recipient saves activity copy" on public.activity_shares for update to authenticated using (shared_with_user_id = (select auth.uid())) with check (shared_with_user_id = (select auth.uid()));
create policy "Owner revokes or recipient dismisses activity share" on public.activity_shares for delete to authenticated using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));

-- food_entry_shares
drop policy if exists "Owners can revoke food entry shares" on public.food_entry_shares;
drop policy if exists "Recipients can dismiss food entry shares" on public.food_entry_shares;
drop policy if exists "Owners can create food entry shares" on public.food_entry_shares;
drop policy if exists "Users can view relevant food entry shares" on public.food_entry_shares;
drop policy if exists "Recipients can update food entry share saved copy" on public.food_entry_shares;
create policy "Read own food entry shares" on public.food_entry_shares for select to authenticated using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));
create policy "Create food entry shares" on public.food_entry_shares for insert to authenticated
  with check (owner_id = (select auth.uid()) and shared_with_user_id <> (select auth.uid())
    and exists (select 1 from public.food_entries p where p.id = food_entry_shares.food_entry_id and p.user_id = (select auth.uid())));
create policy "Recipient saves food entry copy" on public.food_entry_shares for update to authenticated using (shared_with_user_id = (select auth.uid())) with check (shared_with_user_id = (select auth.uid()));
create policy "Owner revokes or recipient dismisses food entry share" on public.food_entry_shares for delete to authenticated using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));

-- recipe_shares
drop policy if exists "Owners can revoke recipe shares" on public.recipe_shares;
drop policy if exists "Recipients can dismiss recipe shares" on public.recipe_shares;
drop policy if exists "Owners can create recipe shares" on public.recipe_shares;
drop policy if exists "Users can view relevant recipe shares" on public.recipe_shares;
drop policy if exists "Recipients can update recipe share saved copy" on public.recipe_shares;
create policy "Read own recipe shares" on public.recipe_shares for select to authenticated using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));
create policy "Create recipe shares" on public.recipe_shares for insert to authenticated
  with check (owner_id = (select auth.uid()) and shared_with_user_id <> (select auth.uid())
    and exists (select 1 from public.recipes p where p.id = recipe_shares.recipe_id and p.user_id = (select auth.uid())));
create policy "Recipient saves recipe copy" on public.recipe_shares for update to authenticated using (shared_with_user_id = (select auth.uid())) with check (shared_with_user_id = (select auth.uid()));
create policy "Owner revokes or recipient dismisses recipe share" on public.recipe_shares for delete to authenticated using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));

-- workout_shares
drop policy if exists "Owners can revoke workout shares" on public.workout_shares;
drop policy if exists "Recipients can dismiss workout shares" on public.workout_shares;
drop policy if exists "Owners can create workout shares" on public.workout_shares;
drop policy if exists "Users can view relevant workout shares" on public.workout_shares;
drop policy if exists "Recipients can update workout share saved copy" on public.workout_shares;
create policy "Read own workout shares" on public.workout_shares for select to authenticated using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));
create policy "Create workout shares" on public.workout_shares for insert to authenticated
  with check (owner_id = (select auth.uid()) and shared_with_user_id <> (select auth.uid())
    and exists (select 1 from public.workouts p where p.id = workout_shares.workout_id and p.user_id = (select auth.uid())));
create policy "Recipient saves workout copy" on public.workout_shares for update to authenticated using (shared_with_user_id = (select auth.uid())) with check (shared_with_user_id = (select auth.uid()));
create policy "Owner revokes or recipient dismisses workout share" on public.workout_shares for delete to authenticated using (owner_id = (select auth.uid()) or shared_with_user_id = (select auth.uid()));

-- 3) Indexes for unindexed foreign keys
create index if not exists activities_workout_id_idx on public.activities (workout_id);
create index if not exists activity_exercises_user_id_idx on public.activity_exercises (user_id);
create index if not exists activity_exercises_workout_exercise_id_idx on public.activity_exercises (workout_exercise_id);
create index if not exists activity_shares_saved_copy_id_idx on public.activity_shares (saved_copy_id);
create index if not exists food_entries_recipe_id_idx on public.food_entries (recipe_id);
create index if not exists food_entry_shares_saved_copy_id_idx on public.food_entry_shares (saved_copy_id);
create index if not exists recipe_ingredients_user_id_idx on public.recipe_ingredients (user_id);
create index if not exists recipe_shares_saved_copy_id_idx on public.recipe_shares (saved_copy_id);
create index if not exists recipes_forked_from_recipe_id_idx on public.recipes (forked_from_recipe_id);
create index if not exists workout_exercises_user_id_idx on public.workout_exercises (user_id);
create index if not exists workout_shares_saved_copy_id_idx on public.workout_shares (saved_copy_id);
create index if not exists workouts_forked_from_workout_id_idx on public.workouts (forked_from_workout_id);
-- Share lookups by recipient (used by every "shared with me" policy above)
create index if not exists activity_shares_recipient_idx on public.activity_shares (shared_with_user_id, activity_id);
create index if not exists food_entry_shares_recipient_idx on public.food_entry_shares (shared_with_user_id, food_entry_id);
create index if not exists recipe_shares_recipient_idx on public.recipe_shares (shared_with_user_id, recipe_id);
create index if not exists workout_shares_recipient_idx on public.workout_shares (shared_with_user_id, workout_id);

-- 4) SECURITY DEFINER functions: no anonymous execution
revoke execute on function public.find_users_for_share(text) from public, anon;
grant execute on function public.find_users_for_share(text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;  -- trigger only

commit;

-- Optional, after confirming every client (web + MCP server) sends entry_date / dose_date explicitly:
-- alter table public.food_entries alter column entry_date drop default;
-- alter table public.medication_doses alter column dose_date drop default;
-- Dashboard (not SQL): Auth > enable leaked-password protection; add a second MFA factor.
