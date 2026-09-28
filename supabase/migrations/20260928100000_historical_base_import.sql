-- Histórico consolidado importado da BASE do Power BI.
-- Não substitui os lançamentos detalhados do DP-Success.
-- Uma linha representa um funcionário em uma competência (21 do mês anterior até 20 do mês indicado).

create table if not exists public.historical_kpi_data (
  id uuid primary key default gen_random_uuid(),
  period_id uuid null references public.time_periods(id) on delete set null,
  reference_year integer not null,
  reference_month integer not null check (reference_month between 1 and 12),
  period_start date not null,
  period_end date not null,
  employee_id uuid null references public.employees(id) on delete set null,
  registration text null,
  employee_name text not null,
  department_name text null,
  position_name text null,
  expected_minutes integer not null default 0,
  worked_minutes integer not null default 0,
  absence_quantity numeric(12,2) not null default 0,
  certificate_minutes integer not null default 0,
  declaration_minutes integer not null default 0,
  allowance_minutes integer not null default 0,
  debit_minutes integer not null default 0,
  he_60_minutes integer not null default 0,
  he_60_night_minutes integer not null default 0,
  he_100_minutes integer not null default 0,
  he_20_minutes integer not null default 0,
  interjornada_minutes integer not null default 0,
  import_batch_id uuid null,
  source text not null default 'BASE_POWERBI',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint historical_kpi_data_valid_range check (period_start <= period_end),
  constraint historical_kpi_data_unique_row unique (reference_year, reference_month, registration, employee_name)
);

create index if not exists historical_kpi_data_period_idx
  on public.historical_kpi_data(reference_year, reference_month);

create index if not exists historical_kpi_data_employee_idx
  on public.historical_kpi_data(employee_id);

create index if not exists historical_kpi_data_registration_idx
  on public.historical_kpi_data(registration);

create table if not exists public.historical_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  source_sheet text not null default 'BASE',
  row_count integer not null default 0,
  status text not null default 'concluido',
  imported_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.historical_kpi_data
  add constraint historical_kpi_data_import_batch_fk
  foreign key (import_batch_id)
  references public.historical_import_batches(id)
  on delete set null;

alter table public.historical_kpi_data enable row level security;
alter table public.historical_import_batches enable row level security;

revoke all on table public.historical_kpi_data, public.historical_import_batches from anon;

grant select, insert, update, delete on public.historical_kpi_data to authenticated;
grant select, insert on public.historical_import_batches to authenticated;

drop policy if exists historical_kpi_data_select on public.historical_kpi_data;
drop policy if exists historical_kpi_data_insert on public.historical_kpi_data;
drop policy if exists historical_kpi_data_update on public.historical_kpi_data;
drop policy if exists historical_kpi_data_delete on public.historical_kpi_data;
drop policy if exists historical_import_batches_select on public.historical_import_batches;
drop policy if exists historical_import_batches_insert on public.historical_import_batches;

create policy historical_kpi_data_select on public.historical_kpi_data
for select to authenticated
using ((select public.has_app_access((select auth.uid()))));

create policy historical_kpi_data_insert on public.historical_kpi_data
for insert to authenticated
with check ((select public.can_manage((select auth.uid()))));

create policy historical_kpi_data_update on public.historical_kpi_data
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));

create policy historical_kpi_data_delete on public.historical_kpi_data
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy historical_import_batches_select on public.historical_import_batches
for select to authenticated
using ((select public.has_app_access((select auth.uid()))));

create policy historical_import_batches_insert on public.historical_import_batches
for insert to authenticated
with check ((select public.can_manage((select auth.uid()))));

comment on table public.historical_kpi_data is 'Histórico consolidado importado da aba BASE. Não representa lançamentos diários.';
comment on table public.historical_import_batches is 'Controle das importações históricas realizadas pelo RH.';
