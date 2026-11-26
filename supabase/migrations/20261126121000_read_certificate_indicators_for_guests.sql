begin;

-- Indicators need the date range and duration, without clinical data.
-- Keep the restricted projection in a non-exposed schema.
create or replace function private.attendance_certificate_indicators(range_start date, range_end date)
returns table (id uuid, employee_id uuid, start_date date, end_date date, days integer)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.employee_id, c.start_date, c.end_date, c.days
  from public.medical_certificates c
  where (select private.has_app_access(auth.uid()))
    and range_start <= range_end
    and c.start_date <= range_end
    and c.end_date >= range_start;
$$;

revoke all on function private.attendance_certificate_indicators(date, date) from public, anon;
grant execute on function private.attendance_certificate_indicators(date, date) to authenticated;

create or replace function public.attendance_certificate_indicators(range_start date, range_end date)
returns table (id uuid, employee_id uuid, start_date date, end_date date, days integer)
language sql stable security invoker set search_path = ''
as $$
  select c.id, c.employee_id, c.start_date, c.end_date, c.days
  from private.attendance_certificate_indicators(range_start, range_end) c;
$$;

revoke all on function public.attendance_certificate_indicators(date, date) from public, anon;
grant execute on function public.attendance_certificate_indicators(date, date) to authenticated;

commit;
