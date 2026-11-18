begin;
-- Restrictive policies are ANDed with existing permissive policies and do not grant new rights.
-- Account setup, invitations and system audit logging retain their own dedicated policies.
do $$
declare t text;
begin
 foreach t in array array[
 'app_settings','attachments','bank_hours','companies','company_settings',
 'dashboard_competence_notes','departments','employee_audit_history','employee_checklist_instances',
 'employee_checklist_steps','employee_checklist_templates','employee_document_catalog',
 'employee_document_records','employee_document_requirements','employees',
 'historical_import_batches','historical_kpi_annotations','historical_kpi_data','holidays',
 'medical_certificates','occurrence_types','occurrences','overtime_records','point_closing_overrides',
 'positions','system_settings','task_checklist_items','task_reminders','tasks','time_adjustments',
 'time_periods','time_records','vacation_periods','work_schedules',
 'pj_people','pj_documents','pj_recesses','pj_document_catalog','pj_document_requirements',
 'employee_assets_access','employee_asset_access','employee_career_history'
 ] loop
  if to_regclass(format('public.%I',t)) is null then continue; end if;
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists dp_guest_insert_guard on public.%I',t);
  execute format('create policy dp_guest_insert_guard on public.%I as restrictive for insert to authenticated with check (not private.has_role((select auth.uid()), ''convidado''::public.app_role) and private.can_manage((select auth.uid())))',t);
  execute format('drop policy if exists dp_guest_update_guard on public.%I',t);
  execute format('create policy dp_guest_update_guard on public.%I as restrictive for update to authenticated using (private.can_manage((select auth.uid()))) with check (private.can_manage((select auth.uid())))',t);
  execute format('drop policy if exists dp_guest_delete_guard on public.%I',t);
  execute format('create policy dp_guest_delete_guard on public.%I as restrictive for delete to authenticated using (private.can_manage((select auth.uid())))',t);
 end loop;
end $$;
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
drop policy if exists dp_guest_update_guard on public.employee_life_events;
create policy dp_guest_update_guard on public.employee_life_events as restrictive for update to authenticated using(private.can_manage((select auth.uid()))) with check(private.can_manage((select auth.uid())));
drop policy if exists dp_guest_delete_guard on public.employee_life_events;
create policy dp_guest_delete_guard on public.employee_life_events as restrictive for delete to authenticated using(private.can_manage((select auth.uid())));
commit;
