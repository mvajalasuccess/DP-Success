ALTER TABLE public.overtime_records ADD COLUMN IF NOT EXISTS launch_type text NOT NULL DEFAULT 'HE_60';
ALTER TABLE public.overtime_records ADD COLUMN IF NOT EXISTS launch_group_id uuid;
ALTER TABLE public.bank_hours ADD COLUMN IF NOT EXISTS launch_group_id uuid;
UPDATE public.overtime_records SET launch_type = CASE
  WHEN rate_percent = 50 THEN 'INTERJORNADA_50'
  WHEN rate_percent = 100 AND lower(coalesce(notes,'')) LIKE '%noturn%' THEN 'HE_100_NOTURNO'
  WHEN rate_percent = 100 THEN 'HE_100'
  WHEN rate_percent = 20 THEN 'ADICIONAL_NOTURNO'
  WHEN lower(coalesce(notes,'')) LIKE '%noturn%' THEN 'HE_60_NOTURNO'
  ELSE 'HE_60' END;
ALTER TABLE public.overtime_records ADD CONSTRAINT overtime_launch_type_chk CHECK (launch_type IN ('HE_60','HE_60_NOTURNO','HE_100','HE_100_NOTURNO','ADICIONAL_NOTURNO','INTERJORNADA_50'));
CREATE INDEX IF NOT EXISTS idx_overtime_group ON public.overtime_records(launch_group_id);
CREATE INDEX IF NOT EXISTS idx_bank_hours_group ON public.bank_hours(launch_group_id);