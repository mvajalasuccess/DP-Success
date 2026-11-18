begin;
alter table public.historical_kpi_annotations
 add column if not exists certificate_display_start date,
 add column if not exists certificate_display_end date,
 add column if not exists certificate_display_days integer,
 add column if not exists certificate_display_notes text,
 add column if not exists declaration_display_start date,
 add column if not exists declaration_display_end date,
 add column if not exists declaration_display_minutes integer,
 add column if not exists declaration_display_reason text;
-- Existing historical totals and operational records are intentionally untouched.
commit;
