-- Planejamento de períodos de férias do DP SUCCESS.
-- Esta tabela é isolada dos fechamentos de ponto e dos cálculos históricos.
create table if not exists public.vacation_periods (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text,
  start_date date not null,
  end_date date not null,
  notes text,
  completed boolean not null default false,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vacation_periods_dates_valid check (end_date >= start_date)
);
create index if not exists vacation_periods_employee_dates_idx
  on public.vacation_periods (employee_id, start_date, end_date);
create index if not exists vacation_periods_start_date_idx
  on public.vacation_periods (start_date);
alter table public.vacation_periods enable row level security;
drop policy if exists vacation_periods_select on public.vacation_periods;
create policy vacation_periods_select on public.vacation_periods
  for select to authenticated using ((select public.has_app_access((select auth.uid()))));
drop policy if exists vacation_periods_insert on public.vacation_periods;
create policy vacation_periods_insert on public.vacation_periods
  for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
drop policy if exists vacation_periods_update on public.vacation_periods;
create policy vacation_periods_update on public.vacation_periods
  for update to authenticated using ((select public.can_manage((select auth.uid()))))
  with check ((select public.can_manage((select auth.uid()))));
drop policy if exists vacation_periods_delete on public.vacation_periods;
create policy vacation_periods_delete on public.vacation_periods
  for delete to authenticated using ((select public.can_manage((select auth.uid()))));
grant select, insert, update, delete on public.vacation_periods to authenticated;
