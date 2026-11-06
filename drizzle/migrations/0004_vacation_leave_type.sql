ALTER TABLE public.vacation_periods ADD COLUMN IF NOT EXISTS leave_type text NOT NULL DEFAULT 'ferias';
ALTER TABLE public.vacation_periods ADD COLUMN IF NOT EXISTS days_quantity numeric(5,1);
ALTER TABLE public.vacation_periods ADD CONSTRAINT vacation_periods_leave_type_chk CHECK (leave_type IN ('ferias','licenca_remunerada'));
ALTER TABLE public.vacation_periods ADD CONSTRAINT vacation_periods_days_quantity_chk CHECK (days_quantity IS NULL OR (days_quantity > 0 AND days_quantity * 2 = round(days_quantity * 2)));
COMMENT ON COLUMN public.vacation_periods.leave_type IS 'ferias consome saldo; licenca_remunerada não consome saldo de férias';
COMMENT ON COLUMN public.vacation_periods.days_quantity IS 'Quantidade de dias informada (aceita meio dia). Nulo = contagem pelas datas (registros antigos).';