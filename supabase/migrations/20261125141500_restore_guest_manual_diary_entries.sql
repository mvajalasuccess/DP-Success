begin;

-- Restore the exception for a guest to create their own manual diary entry.
-- Existing update and delete policies remain in place.
alter policy employee_life_events_insert on public.employee_life_events
with check (
  (select private.can_manage(auth.uid()))
  or (
    (select private.has_role(auth.uid(), 'convidado'::public.app_role))
    and created_by = (select auth.uid())
    and source = 'manual'
    and source_reference is null
    and status = 'active'
    and void_reason is null
    and length(btrim(title)) > 0
    and (direction <> 'neutral' or score = 0)
  )
);

alter policy dp_guest_insert_guard on public.employee_life_events
with check (
  (select private.can_manage(auth.uid()))
  or (
    (select private.has_role(auth.uid(), 'convidado'::public.app_role))
    and created_by = (select auth.uid())
    and source = 'manual'
    and source_reference is null
    and status = 'active'
    and void_reason is null
    and length(btrim(title)) > 0
    and (direction <> 'neutral' or score = 0)
  )
);

commit;
