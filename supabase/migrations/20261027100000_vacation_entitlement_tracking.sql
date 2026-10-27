-- Liga o período de férias ao período aquisitivo/concessivo calculado automaticamente.
-- Não altera datas de férias já cadastradas nem tabelas de ponto/banco.
alter table public.vacation_periods
  add column if not exists acquisition_start_date date,
  add column if not exists acquisition_end_date date,
  add column if not exists concession_start_date date,
  add column if not exists concession_end_date date;

create index if not exists vacation_periods_acquisition_idx
  on public.vacation_periods (employee_id, acquisition_start_date);
