begin;
alter table public.pj_documents add column if not exists imported_from_audit boolean not null default false;
alter table public.pj_documents add column if not exists no_due_date boolean not null default false;
-- Only the mixed importer previously assigned deterministic version-5 IDs.
update public.pj_documents set imported_from_audit=true where substring(id::text,15,1)='5';
create table if not exists public.pj_document_catalog (
 id uuid primary key default gen_random_uuid(),
 category text not null,
 name text not null check(length(trim(name))>0),
 active boolean not null default true,
 unique(category,name)
);
create table if not exists public.pj_document_requirements (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.pj_people(id) on delete restrict,
 catalog_id uuid not null references public.pj_document_catalog(id) on delete restrict,
 is_applicable boolean not null default true,
 unique(person_id,catalog_id)
);
alter table public.pj_document_catalog enable row level security;
alter table public.pj_document_requirements enable row level security;
revoke all on public.pj_document_catalog,public.pj_document_requirements from public,anon,authenticated;
grant select,insert,update,delete on public.pj_document_catalog,public.pj_document_requirements to authenticated;
drop policy if exists pj_catalog_manage on public.pj_document_catalog;
create policy pj_catalog_manage on public.pj_document_catalog for all to authenticated using(private.can_manage((select auth.uid()))) with check(private.can_manage((select auth.uid())));
drop policy if exists pj_requirements_manage on public.pj_document_requirements;
create policy pj_requirements_manage on public.pj_document_requirements for all to authenticated using(private.can_manage((select auth.uid()))) with check(private.can_manage((select auth.uid())));
-- Seed only from existing explicitly standard PJ records, never from CLT.
insert into public.pj_document_catalog(category,name)
select distinct case lower(trim(category))
 when 'pessoais' then 'Pessoais' when 'documentos pessoais' then 'Pessoais'
 when 'contrato' then 'Contratação' when 'contratação' then 'Contratação'
 when 'responsabilidades anuais' then 'Responsabilidades anuais'
 when 'medicina e segurança do trabalho' then 'Medicina e Segurança do Trabalho'
 when 'nfs' then 'NFs' when 'nf' then 'NFs' when 'notas fiscais' then 'NFs'
 when 'vales avulsos, acordos diversos' then 'Vales avulsos, acordos diversos'
 else 'Diversos' end,trim(document_name)
from public.pj_documents where is_standard and length(trim(document_name))>0
on conflict(category,name) do nothing;
commit;
