-- Datas oficiais de gozo das férias, separadas dos blocos informativos.
-- Não altera os blocos nem os cálculos históricos já existentes.
alter table public.vacation_periods
  add column if not exists official_gozo_start_date date,
  add column if not exists official_gozo_end_date date;
