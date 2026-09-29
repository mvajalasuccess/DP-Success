-- Restringe os ajustes de fechamento aos usuários cadastrados em public.profiles.
-- A função SECURITY DEFINER evita depender das RLS da própria tabela profiles.
create or replace function public.is_rh_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
  );
$$;

revoke all on function public.is_rh_user() from public;
grant execute on function public.is_rh_user() to authenticated;

alter table public.point_closing_overrides enable row level security;

drop policy if exists "point_closing_overrides_select_authenticated" on public.point_closing_overrides;
create policy "point_closing_overrides_select_authenticated"
on public.point_closing_overrides
for select
to authenticated
using (public.is_rh_user());

drop policy if exists "point_closing_overrides_insert_authenticated" on public.point_closing_overrides;
create policy "point_closing_overrides_insert_authenticated"
on public.point_closing_overrides
for insert
to authenticated
with check (public.is_rh_user());

drop policy if exists "point_closing_overrides_update_authenticated" on public.point_closing_overrides;
create policy "point_closing_overrides_update_authenticated"
on public.point_closing_overrides
for update
to authenticated
using (public.is_rh_user())
with check (public.is_rh_user());

drop policy if exists "point_closing_overrides_delete_authenticated" on public.point_closing_overrides;
create policy "point_closing_overrides_delete_authenticated"
on public.point_closing_overrides
for delete
to authenticated
using (public.is_rh_user());
