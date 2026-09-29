-- Novos tipos de ocorrências de DP para faltas, atestados e declarações.
alter table public.occurrences
  add column if not exists cid text;

do $$
begin
  if not exists (select 1 from public.occurrence_types where code = 'folga_abonada') then
    insert into public.occurrence_types (code, name, unit, requires_justification, affects_balance, active)
    values ('folga_abonada', 'Folga Abonada', 'dias', false, false, true);
  else
    update public.occurrence_types set name='Folga Abonada', unit='dias', requires_justification=false, active=true where code='folga_abonada';
  end if;

  if not exists (select 1 from public.occurrence_types where code = 'folga_descontada') then
    insert into public.occurrence_types (code, name, unit, requires_justification, affects_balance, active)
    values ('folga_descontada', 'Folga Descontada', 'dias', false, false, true);
  else
    update public.occurrence_types set name='Folga Descontada', unit='dias', requires_justification=false, active=true where code='folga_descontada';
  end if;

  if not exists (select 1 from public.occurrence_types where code = 'falta_justificada') then
    insert into public.occurrence_types (code, name, unit, requires_justification, affects_balance, active)
    values ('falta_justificada', 'Falta com Justificativa', 'dias', true, false, true);
  else
    update public.occurrence_types set name='Falta com Justificativa', unit='dias', requires_justification=true, active=true where code='falta_justificada';
  end if;

  if not exists (select 1 from public.occurrence_types where code = 'falta_injustificada') then
    insert into public.occurrence_types (code, name, unit, requires_justification, affects_balance, active)
    values ('falta_injustificada', 'Falta sem Justificativa', 'dias', false, false, true);
  else
    update public.occurrence_types set name='Falta sem Justificativa', unit='dias', requires_justification=false, active=true where code='falta_injustificada';
  end if;

  if not exists (select 1 from public.occurrence_types where code = 'atestado') then
    insert into public.occurrence_types (code, name, unit, requires_justification, affects_balance, active)
    values ('atestado', 'Atestado', 'dias', false, false, true);
  else
    update public.occurrence_types set name='Atestado', unit='dias', requires_justification=false, active=true where code='atestado';
  end if;

  if not exists (select 1 from public.occurrence_types where code = 'declaracao_horas') then
    insert into public.occurrence_types (code, name, unit, requires_justification, affects_balance, active)
    values ('declaracao_horas', 'Declaração de horas', 'horas', false, false, true);
  else
    update public.occurrence_types set name='Declaração de horas', unit='horas', requires_justification=false, active=true where code='declaracao_horas';
  end if;
end $$;