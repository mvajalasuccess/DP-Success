begin;

-- Existing legacy roles retain their account records without administrative privileges.
create or replace function private.can_manage(_user_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = _user_id
      and ur.role = 'administrador'::public.app_role
      and p.active = true
  );
$$;

-- Remove the previous exception for creating manual diary events.
alter policy employee_life_events_insert on public.employee_life_events
  with check (private.can_manage((select auth.uid())));
alter policy dp_guest_insert_guard on public.employee_life_events
  with check (private.can_manage((select auth.uid())));

commit;
