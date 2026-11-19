-- Clear placeholder dates on control rows created by "Pago em rescisão".
-- Keep the settlement, the acquisition period, and any actual leave dates.
UPDATE public.vacation_periods
SET start_date = NULL, end_date = NULL
WHERE notes = 'Registro de controle: férias proporcionais pagas na rescisão. Datas do registro não representam gozo de férias.'
  AND start_date = end_date
  AND official_gozo_start_date IS NULL
  AND official_gozo_end_date IS NULL;
