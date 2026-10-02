-- Índices de desempenho do DP Success.
-- Mantêm as consultas por competência/funcionário rápidas conforme o volume cresce.

CREATE INDEX IF NOT EXISTS idx_time_records_period_employee
  ON public.time_records (period_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_time_records_employee_period
  ON public.time_records (employee_id, period_id);

CREATE INDEX IF NOT EXISTS idx_overtime_records_period_employee
  ON public.overtime_records (period_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_overtime_records_employee_period
  ON public.overtime_records (employee_id, period_id);

CREATE INDEX IF NOT EXISTS idx_overtime_records_reference_date
  ON public.overtime_records (reference_date);

CREATE INDEX IF NOT EXISTS idx_bank_hours_period_employee
  ON public.bank_hours (period_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_bank_hours_employee_kind_period
  ON public.bank_hours (employee_id, kind, period_id);

CREATE INDEX IF NOT EXISTS idx_bank_hours_entry_date
  ON public.bank_hours (entry_date);

CREATE INDEX IF NOT EXISTS idx_occurrences_period_employee
  ON public.occurrences (period_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_occurrences_employee_date
  ON public.occurrences (employee_id, occurrence_date);

CREATE INDEX IF NOT EXISTS idx_medical_certificates_employee_dates
  ON public.medical_certificates (employee_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_point_closing_overrides_period_employee
  ON public.point_closing_overrides (period_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_historical_kpi_data_period_employee
  ON public.historical_kpi_data (period_id, employee_id);

CREATE INDEX IF NOT EXISTS idx_historical_kpi_data_employee_period
  ON public.historical_kpi_data (employee_id, period_id);

CREATE INDEX IF NOT EXISTS idx_time_periods_end_date
  ON public.time_periods (end_date);

CREATE INDEX IF NOT EXISTS idx_time_periods_reference
  ON public.time_periods (reference_year, reference_month);
