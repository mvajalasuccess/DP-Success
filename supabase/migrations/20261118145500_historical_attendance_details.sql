begin;
alter table public.historical_kpi_annotations
 add column if not exists certificate_details jsonb,
 add column if not exists declaration_details jsonb;
-- NULL retains earlier complementary fields; an empty array resets to consolidated display.
-- No operational attendance or historical calculation rows are changed.
commit;
