begin;

-- Monthly planning loads these three tables together.
alter table public.pj_people enable row level security;
alter table public.pj_documents enable row level security;
alter table public.pj_recesses enable row level security;

grant select on table public.pj_people, public.pj_documents, public.pj_recesses to authenticated;

commit;
