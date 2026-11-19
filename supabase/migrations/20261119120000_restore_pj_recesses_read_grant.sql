-- Restore Data API reads for authenticated sessions. Existing RLS policies
-- continue to determine which application roles can see recess records.
alter table public.pj_recesses enable row level security;
grant select on table public.pj_recesses to authenticated;
