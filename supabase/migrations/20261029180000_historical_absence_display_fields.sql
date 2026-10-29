-- Metadados de exibição para faltas históricas importadas da BASE.
-- Não alteram historical_kpi_data nem alimentam cálculos, abonos ou banco de horas.
alter table public.historical_kpi_annotations
  add column if not exists absence_display_date date,
  add column if not exists absence_display_type text,
  add column if not exists absence_display_quantity numeric(12,2);

comment on column public.historical_kpi_annotations.absence_display_date is
  'Data exibida para falta histórica importada; não altera a BASE nem cálculos.';
comment on column public.historical_kpi_annotations.absence_display_type is
  'Tipo exibido para falta histórica importada; não altera a BASE nem cálculos.';
comment on column public.historical_kpi_annotations.absence_display_quantity is
  'Quantidade exibida para falta histórica importada; não altera a BASE nem cálculos.';
