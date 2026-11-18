-- Isolamento: nenhuma linha é criada em employees.
create table if not exists public.pj_people (
 id uuid primary key default gen_random_uuid(),
 full_name text not null check (length(trim(full_name)) > 0),
 company_id uuid references public.companies(id) on delete restrict,
 start_date date not null,
 birth_date date,
 cpf text,
 cnpj text,
 activity text,
 status text not null default 'ativo' check(status in ('ativo','inativo')),
 end_date date,
 check(end_date is null or end_date >= start_date)
);
create table if not exists public.pj_recesses (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.pj_people(id) on delete restrict,
 start_date date not null,
 end_date date not null check(end_date >= start_date),
 notes text
);
create table if not exists public.pj_documents (
 id uuid primary key default gen_random_uuid(),
 person_id uuid not null references public.pj_people(id) on delete restrict,
 category text not null,
 document_name text not null,
 is_standard boolean not null default false,
 completed_on date,
 due_date date,
 signature_status text not null default 'pending' check(signature_status in ('pending','signed','not_applicable')),
 notes text
);
alter table public.pj_people enable row level security;
alter table public.pj_recesses enable row level security;
alter table public.pj_documents enable row level security;
do $$
declare t text;
begin
 foreach t in array array['pj_people','pj_recesses','pj_documents'] loop
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select, insert, update, delete on public.%I to authenticated',t);
  execute format('drop policy if exists pj_manage on public.%I',t);
  execute format('create policy pj_manage on public.%I for all to authenticated using (public.can_manage((select auth.uid()))) with check (public.can_manage((select auth.uid())))',t);
 end loop;
end $$;
