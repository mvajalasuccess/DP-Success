-- Campos visuais complementares para faltas históricas da BASE.
-- Os valores originais de historical_kpi_data permanecem intactos.
alter table public.historical_kpi_annotations
  add column if not exists absence_display_date date,
  add column if not exists absence_display_end_date date,
  add column if not exists absence_display_type text,
  add column if not exists absence_display_quantity numeric(12,2),
  add column if not exists absence_display_justification text,
  add column if not exists absence_display_notes text;

comment on column public.historical_kpi_annotations.absence_display_date is
  'Data inicial exibida para falta histórica; não altera a BASE nem cálculos.';
comment on column public.historical_kpi_annotations.absence_display_end_date is
  'Data final exibida para falta histórica; não altera a BASE nem cálculos.';
comment on column public.historical_kpi_annotations.absence_display_type is
  'Tipo exibido para falta histórica; não altera a BASE nem cálculos.';
comment on column public.historical_kpi_annotations.absence_display_quantity is
  'Quantidade exibida para falta histórica; não altera a BASE nem cálculos.';
comment on column public.historical_kpi_annotations.absence_display_justification is
  'Justificativa exibida para falta histórica; não altera a BASE nem cálculos.';
comment on column public.historical_kpi_annotations.absence_display_notes is
  'Observações exibidas para falta histórica; não altera a BASE nem cálculos.';
