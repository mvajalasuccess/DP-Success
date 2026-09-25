-- Permite fechamentos de ponto com períodos personalizados.
-- Mantém reference_year/reference_month para compatibilidade com o sistema atual.

ALTER TABLE public.time_periods
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE;

UPDATE public.time_periods
SET
  start_date = make_date(reference_year, reference_month, 1) - INTERVAL '11 days',
  end_date = make_date(reference_year, reference_month, 20)
WHERE start_date IS NULL OR end_date IS NULL;

ALTER TABLE public.time_periods
  ALTER COLUMN start_date SET NOT NULL,
  ALTER COLUMN end_date SET NOT NULL;

ALTER TABLE public.time_periods
  DROP CONSTRAINT IF EXISTS time_periods_reference_year_reference_month_key;

CREATE UNIQUE INDEX IF NOT EXISTS time_periods_date_range_uidx
  ON public.time_periods(start_date, end_date);

ALTER TABLE public.time_periods
  ADD CONSTRAINT time_periods_valid_range
  CHECK (start_date <= end_date);

COMMENT ON COLUMN public.time_periods.start_date IS 'Primeiro dia da competência de ponto.';
COMMENT ON COLUMN public.time_periods.end_date IS 'Último dia da competência de ponto.';
