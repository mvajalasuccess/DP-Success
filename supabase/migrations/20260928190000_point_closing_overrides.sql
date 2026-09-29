create table if not exists public.point_closing_overrides (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_id uuid not null references public.time_periods(id) on delete cascade,
  expected_minutes integer not null default 0,
  worked_minutes integer not null default 0,
  absence_quantity numeric not null default 0,
  certificate_minutes integer not null default 0,
  declaration_minutes integer not null default 0,
  allowance_minutes integer not null default 0,
  debit_minutes integer not null default 0,
  he_60_minutes integer not null default 0,
  he_60_night_minutes integer not null default 0,
  he_100_minutes integer not null default 0,
  he_20_minutes integer not null default 0,
  interjornada_minutes integer not null default 0,
  justification text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(employee_id, period_id)
);

create index if not exists point_closing_overrides_period_idx
  on public.point_closing_overrides(period_id);

create index if not exists point_closing_overrides_employee_idx
  on public.point_closing_overrides(employee_id);

create or replace function public.set_point_closing_overrides_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_point_closing_overrides_updated_at on public.point_closing_overrides;
create trigger trg_point_closing_overrides_updated_at
before update on public.point_closing_overrides
for each row execute function public.set_point_closing_overrides_updated_at();

alter table public.point_closing_overrides enable row level security;

drop policy if exists "point_closing_overrides_select_authenticated" on public.point_closing_overrides;
create policy "point_closing_overrides_select_authenticated"
on public.point_closing_overrides for select
to authenticated using (true);

drop policy if exists "point_closing_overrides_insert_authenticated" on public.point_closing_overrides;
create policy "point_closing_overrides_insert_authenticated"
on public.point_closing_overrides for insert
to authenticated with check (true);

drop policy if exists "point_closing_overrides_update_authenticated" on public.point_closing_overrides;
create policy "point_closing_overrides_update_authenticated"
on public.point_closing_overrides for update
to authenticated using (true) with check (true);

drop policy if exists "point_closing_overrides_delete_authenticated" on public.point_closing_overrides;
create policy "point_closing_overrides_delete_authenticated"
on public.point_closing_overrides for delete
to authenticated using (true);
