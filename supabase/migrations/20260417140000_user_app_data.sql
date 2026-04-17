-- One row per auth user (use Anonymous sign-in from the app).
-- Stores sales tracker + quote history as JSON for the Leaf Estimator SPA.

create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sales_stats jsonb not null default '{"quotes":0,"sales":0,"upsells":0,"soldRevenueOneTime":0,"soldAnnualValue":0}'::jsonb,
  quote_history jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_app_data_updated_at_idx on public.user_app_data (updated_at desc);

alter table public.user_app_data enable row level security;

-- Authenticated users (including anonymous) may read/write only their row.
-- UPDATE requires SELECT under Postgres RLS.
create policy "user_app_data_select_own"
  on public.user_app_data
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "user_app_data_insert_own"
  on public.user_app_data
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "user_app_data_update_own"
  on public.user_app_data
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
