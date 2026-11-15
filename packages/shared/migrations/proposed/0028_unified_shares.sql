-- 0028_unified_shares.sql  (PROPOSED — not applied)
-- One shares table for every shareable item. Old tables stay until clients switch, then drop.

begin;

create table if not exists public.shares (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('recipe', 'workout', 'food_entry', 'activity', 'food')),
  item_id text not null,                      -- text until entry/activity ids become uuid
  owner_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  saved_copy_id text,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (item_type, item_id, recipient_id),
  check (owner_id <> recipient_id)
);
create index if not exists shares_recipient_idx on public.shares (recipient_id, item_type, created_at desc);
create index if not exists shares_owner_idx on public.shares (owner_id);
alter table public.shares enable row level security;
create policy "Read own shares" on public.shares for select to authenticated using (owner_id = (select auth.uid()) or recipient_id = (select auth.uid()));
create policy "Owner creates share" on public.shares for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "Recipient updates share" on public.shares for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy "Owner or recipient deletes share" on public.shares for delete to authenticated using (owner_id = (select auth.uid()) or recipient_id = (select auth.uid()));
-- Note: the insert policy should also verify ownership of item_id per item_type; do that in a
-- SECURITY INVOKER function `create_share(item_type, item_id, recipient)` called by clients.

insert into public.shares (item_type, item_id, owner_id, recipient_id, saved_copy_id, created_at)
select 'recipe', recipe_id::text, owner_id, shared_with_user_id, saved_copy_id::text, created_at from public.recipe_shares
union all select 'workout', workout_id::text, owner_id, shared_with_user_id, saved_copy_id::text, created_at from public.workout_shares
union all select 'food_entry', food_entry_id, owner_id, shared_with_user_id, saved_copy_id, created_at from public.food_entry_shares
union all select 'activity', activity_id, owner_id, shared_with_user_id, saved_copy_id, created_at from public.activity_shares
on conflict do nothing;

-- Display names come from profiles at read time (no copied names that go stale)
create or replace view public.shares_with_names with (security_invoker = true) as
select s.*, po.display_name as owner_display_name
from public.shares s left join public.profiles po on po.id = s.owner_id;
-- profiles RLS only exposes the caller's own row, so expose names through a narrow
-- SECURITY DEFINER function (display_name only) if recipients need the owner's name.

commit;
