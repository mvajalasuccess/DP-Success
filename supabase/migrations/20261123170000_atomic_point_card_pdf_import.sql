create or replace function public.import_point_card_pdf(fingerprint text, entries jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marker text := '[PDF_IMPORT:' || fingerprint || ']';
  entry record;
  group_id uuid;
  period_end date;
  credits integer := 0;
  debits integer := 0;
  summary integer := 0;
  repaired integer;
begin
  if not private.can_manage((select auth.uid())) then
    raise insufficient_privilege;
  end if;
  if fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Identificação do PDF inválida.';
  end if;
  if entries is null or jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) = 0 then
    raise exception 'O PDF não contém lançamentos para importar.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(marker, 0));

  if exists (select 1 from public.overtime_records where strpos(notes, marker) > 0)
     or exists (select 1 from public.bank_hours where strpos(justification, marker) > 0) then
    update public.overtime_records
    set launch_type = 'HE_60_NOTURNO', rate_percent = 80,
        notes = marker || ' Importado do Cartão Ponto — HE 60% + 20% noturno'
    where launch_type = 'ADICIONAL_NOTURNO' and strpos(notes, marker) > 0
      and notes ilike '%Importado do Cartão Ponto — Adicional noturno%';
    get diagnostics repaired = row_count;
    if repaired > 0 then return jsonb_build_object('repaired', repaired); end if;
    raise exception 'Já existem lançamentos para este PDF. Confira os registros antes de uma nova importação.';
  end if;

  for entry in select * from jsonb_to_recordset(entries) as row_data(
    employee_id uuid, period_id uuid, credit integer, debit integer, balance integer, interjornada integer, night integer
  ) loop
    select end_date into strict period_end from public.time_periods where id = entry.period_id;
    group_id := gen_random_uuid();

    insert into public.overtime_records (
      employee_id, reference_date, period_id, minutes, launch_type, rate_percent, launch_group_id, notes
    )
    select entry.employee_id, period_end, entry.period_id, items.minutes, items.launch_type,
           items.rate_percent, group_id, marker || ' Importado do Cartão Ponto — ' || items.label
    from (values
      (entry.credit, 'HE_60', 60, 'Crédito total do período'),
      (entry.interjornada, 'INTERJORNADA_50', 50, 'Interjornada'),
      (entry.night, 'HE_60_NOTURNO', 80, 'HE 60% + 20% noturno')
    ) as items(minutes, launch_type, rate_percent, label)
    where items.minutes > 0;
    credits := credits + case when entry.credit > 0 then 1 else 0 end;
    summary := summary + case when entry.interjornada > 0 then 1 else 0 end
                       + case when entry.night > 0 then 1 else 0 end;

    if entry.debit > 0 then
      insert into public.bank_hours (
        employee_id, entry_date, period_id, kind, minutes, previous_balance_minutes,
        balance_minutes, launch_group_id, justification, created_by
      ) values (
        entry.employee_id, period_end, entry.period_id, 'debito', entry.debit, 0,
        entry.balance, group_id, marker || ' Importado do Cartão Ponto — Débito total do período', auth.uid()
      );
      debits := debits + 1;
    end if;
  end loop;
  return jsonb_build_object('credits', credits, 'debits', debits, 'summary', summary);
end;
$$;

revoke all on function public.import_point_card_pdf(text, jsonb) from public, anon;
grant execute on function public.import_point_card_pdf(text, jsonb) to authenticated;
