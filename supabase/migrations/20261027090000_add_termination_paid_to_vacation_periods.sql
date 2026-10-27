-- Registra quando as férias proporcionais de um período aquisitivo foram quitadas na rescisão.
-- Não altera cálculos de folha, banco de horas nem registros históricos.
ALTER TABLE public.vacation_periods
ADD COLUMN IF NOT EXISTS termination_paid boolean NOT NULL DEFAULT false;
