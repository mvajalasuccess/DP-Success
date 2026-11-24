begin;

-- Data API reads require both a table grant and an RLS policy.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'pj_people', 'pj_recesses', 'pj_documents',
    'pj_document_catalog', 'pj_document_requirements'
  ] loop
    execute format('alter table public.%I enable row level security', target_table);
    execute format('grant select on table public.%I to authenticated', target_table);
    execute format('drop policy if exists pj_select on public.%I', target_table);
    execute format(
      'create policy pj_select on public.%I for select to authenticated using ((select private.has_app_access(auth.uid())))',
      target_table
    );
  end loop;

  -- These legacy policies were created after the public helpers were revoked.
  foreach target_table in array array['pj_people', 'pj_recesses', 'pj_documents'] loop
    execute format('drop policy if exists pj_manage on public.%I', target_table);
    execute format(
      'create policy pj_manage on public.%I for all to authenticated using ((select private.can_manage(auth.uid()))) with check ((select private.can_manage(auth.uid())))',
      target_table
    );
  end loop;
end $$;

commit;
