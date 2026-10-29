-- Metadados editáveis para o histórico consolidado da BASE.
-- Não cria atestados/ocorrências operacionais nem altera horas históricas.
create table if not exists public.historical_kpi_annotations (
  id uuid primary key default gen_random_uuid(),
  historical_kpi_data_id uuid not null unique
    references public.historical_kpi_data(id) on delete cascade,
  certificate_type text,
  certificate_cid text,
  declaration_observation text,
  updated_at timestamptz not null default now()
);

alter table public.historical_kpi_annotations enable row level security;
revoke all on table public.historical_kpi_annotations from anon;
grant select, insert, update on table public.historical_kpi_annotations to authenticated;

drop policy if exists historical_kpi_annotations_select on public.historical_kpi_annotations;
drop policy if exists historical_kpi_annotations_insert on public.historical_kpi_annotations;
drop policy if exists historical_kpi_annotations_update on public.historical_kpi_annotations;

create policy historical_kpi_annotations_select on public.historical_kpi_annotations
for select to authenticated
using ((select public.has_app_access((select auth.uid()))));

create policy historical_kpi_annotations_insert on public.historical_kpi_annotations
for insert to authenticated
with check ((select public.can_manage((select auth.uid()))));

create policy historical_kpi_annotations_update on public.historical_kpi_annotations
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));

comment on table public.historical_kpi_annotations is
'Campos complementares editáveis do histórico BASE; não alimenta cálculos nem gera lançamentos operacionais.';
