-- Preserve existing PJ recess dates and all CLT tables.
alter table public.pj_recesses
 add column if not exists acquisition_start_date date,
 add column if not exists acquisition_end_date date,
 add column if not exists concession_start_date date,
 add column if not exists concession_end_date date,
 add column if not exists entitled_days numeric,
 add column if not exists days_quantity numeric,
 add column if not exists completed boolean not null default false,
 add column if not exists completed_at timestamptz,
 add column if not exists leave_type text not null default 'ferias',
 add column if not exists title text,
 add column if not exists created_at timestamptz not null default now();
alter table public.pj_recesses alter column start_date drop not null;
alter table public.pj_recesses alter column end_date drop not null;
