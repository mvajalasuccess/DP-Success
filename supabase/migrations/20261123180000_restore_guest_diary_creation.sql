begin;

-- Only new manual diary events may be inserted by an active guest, with the actual author.
drop policy if exists employee_life_events_insert on public.employee_life_events;
create policy employee_life_events_insert on public.employee_life_events for insert to authenticated with check (
 private.can_manage((select auth.uid())) or (
 private.has_role((select auth.uid()),'convidado'::public.app_role)
 and created_by=(select auth.uid()) and source='manual' and source_reference is null
 and status='active' and void_reason is null and length(btrim(title))>0
 and (direction<>'neutral' or score=0)));
drop policy if exists dp_guest_insert_guard on public.employee_life_events;
create policy dp_guest_insert_guard on public.employee_life_events as restrictive for insert to authenticated with check (
 private.can_manage((select auth.uid())) or (
 private.has_role((select auth.uid()),'convidado'::public.app_role)
 and created_by=(select auth.uid()) and source='manual' and source_reference is null
 and status='active' and void_reason is null and length(btrim(title))>0
 and (direction<>'neutral' or score=0)));

commit;
