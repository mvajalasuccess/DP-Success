-- Permite cadastrar período aquisitivo/concessivo sem exigir bloco informativo.
-- Registros antigos permanecem intactos; o gozo oficial continua separado.
ALTER TABLE public.vacation_periods
  ALTER COLUMN start_date DROP NOT NULL,
  ALTER COLUMN end_date DROP NOT NULL;
