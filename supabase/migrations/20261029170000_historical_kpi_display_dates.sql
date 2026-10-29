-- Datas de exibição editáveis para anotações do histórico BASE.
-- São metadados visuais: não alteram historical_kpi_data nem cálculos.
alter table public.historical_kpi_annotations
  add column if not exists certificate_start_date date,
  add column if not exists certificate_end_date date,
  add column if not exists declaration_date date;

comment on column public.historical_kpi_annotations.certificate_start_date is
  'Data inicial exibida para o atestado histórico; não altera dados ou cálculos.';
comment on column public.historical_kpi_annotations.certificate_end_date is
  'Data final exibida para o atestado histórico; não altera dados ou cálculos.';
comment on column public.historical_kpi_annotations.declaration_date is
  'Data exibida para a declaração histórica; não altera dados ou cálculos.';
