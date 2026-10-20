-- Edição/exclusão atômica de grupos de lançamento (créditos em overtime_records,
-- débitos em bank_hours). SECURITY INVOKER: RLS e permissões do usuário logado continuam valendo.

CREATE OR REPLACE FUNCTION public.lock_launch_group(
  _group_id uuid, _legacy_token text, _employee_id uuid, _date date,
  _credit_ids uuid[], _debit_ids uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  found_c uuid[]; found_d uuid[]; exp_c uuid[]; exp_d uuid[];
BEGIN
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO exp_c FROM unnest(coalesce(_credit_ids, '{}')) x;
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO exp_d FROM unnest(coalesce(_debit_ids, '{}')) x;
  IF cardinality(exp_c) + cardinality(exp_d) = 0 THEN
    RAISE EXCEPTION 'Nenhum registro informado para o lançamento.';
  END IF;

  IF _group_id IS NOT NULL THEN
    SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO found_c
      FROM (SELECT id FROM public.overtime_records WHERE launch_group_id = _group_id FOR UPDATE) s;
    SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO found_d
      FROM (SELECT id FROM public.bank_hours WHERE launch_group_id = _group_id FOR UPDATE) s;
  ELSIF _legacy_token IS NOT NULL THEN
    IF _legacy_token !~ '^\[(PDF_IMPORT|XLSX_IMPORT):[^\]]+\]$' THEN
      RAISE EXCEPTION 'Identificador de importação inválido.';
    END IF;
    SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO found_c
      FROM (SELECT id FROM public.overtime_records
            WHERE launch_group_id IS NULL AND employee_id = _employee_id AND reference_date = _date
              AND position(_legacy_token IN coalesce(notes, '')) > 0 FOR UPDATE) s;
    SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO found_d
      FROM (SELECT id FROM public.bank_hours
            WHERE launch_group_id IS NULL AND employee_id = _employee_id AND entry_date = _date
              AND position(_legacy_token IN coalesce(justification, '')) > 0 FOR UPDATE) s;
  ELSE
    IF cardinality(exp_c) + cardinality(exp_d) <> 1 THEN
      RAISE EXCEPTION 'Lançamento sem vínculo identificável com segurança. Nenhum registro foi alterado.';
    END IF;
    SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO found_c
      FROM (SELECT id FROM public.overtime_records
            WHERE id = ANY(exp_c) AND launch_group_id IS NULL AND employee_id = _employee_id AND reference_date = _date FOR UPDATE) s;
    SELECT coalesce(array_agg(id ORDER BY id), '{}') INTO found_d
      FROM (SELECT id FROM public.bank_hours
            WHERE id = ANY(exp_d) AND launch_group_id IS NULL AND employee_id = _employee_id AND entry_date = _date FOR UPDATE) s;
  END IF;

  IF found_c IS DISTINCT FROM exp_c OR found_d IS DISTINCT FROM exp_d THEN
    RAISE EXCEPTION 'Os registros deste lançamento não conferem com o banco (podem ter sido alterados por outra pessoa). Nenhum registro foi alterado; atualize a tela e tente novamente.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_launch_group_rows(_credit_ids uuid[], _debit_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.overtime_records WHERE id = ANY(coalesce(_credit_ids, '{}'));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> cardinality(coalesce(_credit_ids, '{}')) THEN
    RAISE EXCEPTION 'Sem permissão para excluir os créditos deste lançamento (somente Administrador). Nenhum registro foi alterado.';
  END IF;
  DELETE FROM public.bank_hours WHERE id = ANY(coalesce(_debit_ids, '{}'));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> cardinality(coalesce(_debit_ids, '{}')) THEN
    RAISE EXCEPTION 'Sem permissão para excluir os débitos deste lançamento (somente Administrador). Nenhum registro foi alterado.';
  END IF;
END;
$$;

-- Exclui um grupo inteiro numa única transação.
CREATE OR REPLACE FUNCTION public.delete_launch_group(
  _group_id uuid, _legacy_token text, _employee_id uuid, _date date,
  _credit_ids uuid[], _debit_ids uuid[]
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM public.lock_launch_group(_group_id, _legacy_token, _employee_id, _date, _credit_ids, _debit_ids);
  PERFORM public.delete_launch_group_rows(_credit_ids, _debit_ids);
END;
$$;

-- Cria ou substitui um grupo numa única transação. _new:
-- { employee_id, date, period_id, group_id, credits:[{launch_type,minutes,rate_percent,notes}],
--   debit: {minutes, justification, created_by} | null }
CREATE OR REPLACE FUNCTION public.save_launch_group(
  _group_id uuid, _legacy_token text, _employee_id uuid, _date date,
  _credit_ids uuid[], _debit_ids uuid[], _new jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  new_group uuid := (_new->>'group_id')::uuid;
  new_emp uuid := (_new->>'employee_id')::uuid;
  new_date date := (_new->>'date')::date;
  new_period uuid := (_new->>'period_id')::uuid;
  n integer;
BEGIN
  IF new_group IS NULL OR new_emp IS NULL OR new_date IS NULL OR new_period IS NULL THEN
    RAISE EXCEPTION 'Dados do lançamento incompletos.';
  END IF;
  IF cardinality(coalesce(_credit_ids, '{}')) + cardinality(coalesce(_debit_ids, '{}')) > 0 THEN
    PERFORM public.lock_launch_group(_group_id, _legacy_token, _employee_id, _date, _credit_ids, _debit_ids);
    PERFORM public.delete_launch_group_rows(_credit_ids, _debit_ids);
  END IF;

  INSERT INTO public.overtime_records (employee_id, reference_date, period_id, minutes, launch_type, rate_percent, launch_group_id, notes)
  SELECT new_emp, new_date, new_period, c.minutes, c.launch_type, c.rate_percent, new_group, c.notes
  FROM jsonb_to_recordset(coalesce(_new->'credits', '[]'::jsonb)) AS c(launch_type text, minutes integer, rate_percent numeric, notes text);
  GET DIAGNOSTICS n = ROW_COUNT;

  IF _new->'debit' IS NOT NULL AND jsonb_typeof(_new->'debit') = 'object' THEN
    INSERT INTO public.bank_hours (employee_id, entry_date, period_id, kind, minutes, previous_balance_minutes, balance_minutes, justification, launch_group_id, created_by)
    VALUES (new_emp, new_date, new_period, 'debito', (_new->'debit'->>'minutes')::integer, 0, 0,
            _new->'debit'->>'justification', new_group, nullif(_new->'debit'->>'created_by', '')::uuid);
    n := n + 1;
  END IF;

  IF n = 0 THEN
    RAISE EXCEPTION 'Informe ao menos um crédito ou débito.';
  END IF;
  RETURN new_group;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_launch_group(uuid, text, uuid, date, uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_launch_group_rows(uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_launch_group(uuid, text, uuid, date, uuid[], uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_launch_group(uuid, text, uuid, date, uuid[], uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lock_launch_group(uuid, text, uuid, date, uuid[], uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_launch_group_rows(uuid[], uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_launch_group(uuid, text, uuid, date, uuid[], uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_launch_group(uuid, text, uuid, date, uuid[], uuid[], jsonb) TO authenticated, service_role;