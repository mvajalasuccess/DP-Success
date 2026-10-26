-- Campos de perfil para indicadores de RH. Não altera registros históricos nem cálculos de ponto.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS pension_amount numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.employees.gender IS 'Sexo informado voluntariamente no cadastro para indicadores agregados de RH.';
COMMENT ON COLUMN public.employees.pension_amount IS 'Valor mensal de pensão alimentícia em reais, informado no cadastro.';
