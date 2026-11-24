begin;

-- Preserve read access and remove the exception for guest-created diary entries.
alter policy employee_life_events_insert on public.employee_life_events
  with check ((select private.can_manage(auth.uid())));
alter policy dp_guest_insert_guard on public.employee_life_events
  with check ((select private.can_manage(auth.uid())));

-- The attendance screens and reports share this source.
drop policy if exists medical_certificates_select on public.medical_certificates;
create policy medical_certificates_select on public.medical_certificates
  for select to authenticated
  using ((select private.has_app_access(auth.uid())));

commit;
