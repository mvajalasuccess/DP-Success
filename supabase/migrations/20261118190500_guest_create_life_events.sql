begin;
alter table public.employee_life_events enable row level security;
grant select, insert, update, delete on public.employee_life_events to authenticated;
drop policy if exists employee_life_events_insert on public.employee_life_events;
create policy employee_life_events_insert on public.employee_life_events
for insert to authenticated with check (
  private.can_manage((select auth.uid()))
  or (
    private.has_role((select auth.uid()), 'convidado'::public.app_role)
    and created_by = (select auth.uid())
    and source = 'manual'
    and source_reference is null
    and status = 'active'
    and void_reason is null
    and length(btrim(title)) > 0
    and (direction <> 'neutral' or score = 0)
  )
);
drop policy if exists employee_life_events_update on public.employee_life_events;
create policy employee_life_events_update on public.employee_life_events
for update to authenticated using (private.can_manage((select auth.uid())))
with check (private.can_manage((select auth.uid())));
drop policy if exists employee_life_events_delete on public.employee_life_events;
create policy employee_life_events_delete on public.employee_life_events
for delete to authenticated using (private.can_manage((select auth.uid())));
commit;
