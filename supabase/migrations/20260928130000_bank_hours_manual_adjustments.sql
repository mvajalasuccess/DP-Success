-- Ajustes manuais de saldo do Banco de Horas
-- Permite registrar saldo inicial, pagamentos/zeragens e outros ajustes
-- sem misturá-los com débitos de atraso.

ALTER TABLE public.bank_hours
  ADD COLUMN IF NOT EXISTS adjustment_direction TEXT,
  ADD COLUMN IF NOT EXISTS adjustment_reason TEXT;

ALTER TABLE public.bank_hours
  DROP CONSTRAINT IF EXISTS bank_hours_adjustment_direction_check;

ALTER TABLE public.bank_hours
  ADD CONSTRAINT bank_hours_adjustment_direction_check
  CHECK (
    adjustment_direction IS NULL
    OR adjustment_direction IN ('credito', 'debito')
  );

CREATE INDEX IF NOT EXISTS bank_hours_adjustment_idx
  ON public.bank_hours(employee_id, entry_date)
  WHERE kind = 'ajuste';
