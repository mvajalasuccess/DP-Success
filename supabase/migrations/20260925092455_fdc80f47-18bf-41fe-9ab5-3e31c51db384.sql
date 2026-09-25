-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('administrador', 'rh', 'gestor', 'consulta');
CREATE TYPE public.employee_status AS ENUM ('ativo', 'inativo');
CREATE TYPE public.period_status AS ENUM ('aberto', 'em_conferencia', 'fechado');
CREATE TYPE public.time_record_status AS ENUM ('normal', 'incompleto', 'falta', 'atraso', 'saida_antecipada', 'folga', 'feriado', 'ferias', 'atestado', 'ajustado');
CREATE TYPE public.bank_hours_kind AS ENUM ('credito', 'debito', 'compensacao', 'ajuste');

-- ============ UTIL ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

-- Quem pode escrever: Administrador e RH/DP
CREATE OR REPLACE FUNCTION public.can_manage(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('administrador', 'rh')
  );
$$;

CREATE OR REPLACE FUNCTION public.current_roles()
RETURNS SETOF public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = auth.uid();
$$;

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "user_roles_admin_all" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador'));

-- ============ CADASTROS BASE ============
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.work_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  daily_minutes INTEGER NOT NULL DEFAULT 480,
  weekly_minutes INTEGER NOT NULL DEFAULT 2640,
  entry_time TIME,
  break_start TIME,
  break_end TIME,
  exit_time TIME,
  schedule_type TEXT NOT NULL DEFAULT 'fixa',
  active BOOLEAN NOT NULL DEFAULT true,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'nacional',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (holiday_date, scope)
);

CREATE TABLE public.occurrence_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'dias',
  requires_justification BOOLEAN NOT NULL DEFAULT false,
  affects_balance BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ FUNCIONÁRIOS ============
CREATE TABLE public.employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration TEXT,
  full_name TEXT NOT NULL,
  cpf TEXT,
  birth_date DATE,
  email TEXT,
  phone TEXT,
  hire_date DATE,
  termination_date DATE,
  position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  manager_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  work_schedule_id UUID REFERENCES public.work_schedules(id) ON DELETE SET NULL,
  status public.employee_status NOT NULL DEFAULT 'ativo',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX employees_department_idx ON public.employees(department_id);
CREATE INDEX employees_status_idx ON public.employees(status);

-- ============ PERÍODOS ============
CREATE TABLE public.time_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_year INTEGER NOT NULL,
  reference_month INTEGER NOT NULL,
  status public.period_status NOT NULL DEFAULT 'aberto',
  closed_by UUID,
  closed_at TIMESTAMPTZ,
  reopened_by UUID,
  reopened_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reference_year, reference_month)
);

-- ============ PONTO ============
CREATE TABLE public.time_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.time_periods(id) ON DELETE SET NULL,
  work_date DATE NOT NULL,
  entry_at TIME,
  break_out_at TIME,
  break_in_at TIME,
  exit_at TIME,
  expected_minutes INTEGER NOT NULL DEFAULT 0,
  worked_minutes INTEGER NOT NULL DEFAULT 0,
  balance_minutes INTEGER NOT NULL DEFAULT 0,
  overtime_minutes INTEGER NOT NULL DEFAULT 0,
  negative_minutes INTEGER NOT NULL DEFAULT 0,
  status public.time_record_status NOT NULL DEFAULT 'normal',
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  import_batch_id UUID,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, work_date)
);
CREATE INDEX time_records_date_idx ON public.time_records(work_date);

CREATE TABLE public.time_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time_record_id UUID NOT NULL REFERENCES public.time_records(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ HORAS EXTRAS ============
CREATE TABLE public.overtime_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  time_record_id UUID REFERENCES public.time_records(id) ON DELETE SET NULL,
  period_id UUID REFERENCES public.time_periods(id) ON DELETE SET NULL,
  reference_date DATE NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  rate_percent NUMERIC(6,2),
  estimated_value NUMERIC(12,2),
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ BANCO DE HORAS ============
CREATE TABLE public.bank_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.time_periods(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  kind public.bank_hours_kind NOT NULL,
  minutes INTEGER NOT NULL,
  previous_balance_minutes INTEGER NOT NULL DEFAULT 0,
  balance_minutes INTEGER NOT NULL DEFAULT 0,
  justification TEXT,
  created_by UUID,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ ANEXOS ============
CREATE TABLE public.attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL DEFAULT 'documentos',
  path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ OCORRÊNCIAS ============
CREATE TABLE public.occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  occurrence_type_id UUID NOT NULL REFERENCES public.occurrence_types(id),
  period_id UUID REFERENCES public.time_periods(id) ON DELETE SET NULL,
  occurrence_date DATE NOT NULL,
  end_date DATE,
  quantity NUMERIC(8,2),
  unit TEXT NOT NULL DEFAULT 'dias',
  justification TEXT,
  notes TEXT,
  attachment_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,
  created_by UUID,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX occurrences_date_idx ON public.occurrences(occurrence_date);

-- ============ ATESTADOS ============
CREATE TABLE public.medical_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days INTEGER NOT NULL DEFAULT 1,
  certificate_type TEXT NOT NULL DEFAULT 'medico',
  cid TEXT,
  notes TEXT,
  attachment_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,
  created_by UUID,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Acesso restrito ao CID: somente Administrador e RH/DP
CREATE OR REPLACE FUNCTION public.certificate_cid(_certificate_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.can_manage(auth.uid())
    THEN (SELECT cid FROM public.medical_certificates WHERE id = _certificate_id)
    ELSE NULL END;
$$;

-- ============ AUDITORIA ============
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs(entity, entity_id);

-- ============ CONFIGURAÇÕES ============
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  label TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ GRANTS + RLS ============
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'departments','positions','work_schedules','holidays','occurrence_types',
    'employees','time_periods','time_records','time_adjustments','overtime_records',
    'bank_hours','attachments','occurrences','audit_logs','app_settings'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "%s_select" ON public.%I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()))', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON public.%I FOR UPDATE TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()))', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON public.%I FOR DELETE TO authenticated USING (public.can_manage(auth.uid()))', t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;

-- Atestados: grant por coluna, o CID fica fora do acesso direto
GRANT SELECT (id, employee_id, start_date, end_date, days, certificate_type, notes, attachment_id, created_by, is_demo, created_at, updated_at)
  ON public.medical_certificates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.medical_certificates TO authenticated;
GRANT ALL ON public.medical_certificates TO service_role;
ALTER TABLE public.medical_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "medical_certificates_select" ON public.medical_certificates FOR SELECT TO authenticated USING (true);
CREATE POLICY "medical_certificates_insert" ON public.medical_certificates FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "medical_certificates_update" ON public.medical_certificates FOR UPDATE TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "medical_certificates_delete" ON public.medical_certificates FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));
CREATE TRIGGER medical_certificates_updated_at BEFORE UPDATE ON public.medical_certificates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auditoria: qualquer usuário autenticado pode registrar suas próprias ações
DROP POLICY "audit_logs_insert" ON public.audit_logs;
CREATE POLICY "audit_logs_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============ CONFIGURAÇÕES PADRÃO (estrutura, sem regras trabalhistas) ============
INSERT INTO public.app_settings (key, label, description, value) VALUES
  ('jornada_padrao', 'Jornada padrão', 'Parâmetros de jornada usados como padrão em novos cadastros.', '{"minutos_diarios":480,"minutos_semanais":2640,"entrada":"08:00","intervalo_inicio":"12:00","intervalo_fim":"13:00","saida":"17:00"}'),
  ('tolerancias', 'Tolerâncias', 'Tolerâncias de marcação. Valores a definir junto ao RH.', '{"entrada_minutos":null,"saida_minutos":null,"diaria_minutos":null}'),
  ('regras_horas_extras', 'Regras de horas extras', 'Adicionais por faixa. A definir.', '{"adicional_dia_util":null,"adicional_domingo_feriado":null,"adicional_noturno":null}'),
  ('regras_banco_horas', 'Regras de banco de horas', 'Regras de crédito, débito e prazo de compensação. A definir.', '{"prazo_compensacao_dias":null,"fator_credito":null,"fator_debito":null}'),
  ('parametros_dsr', 'DSR', 'Regras de descanso semanal remunerado. A definir.', '{"ativo":false}');

INSERT INTO public.occurrence_types (code, name, unit, requires_justification, affects_balance) VALUES
  ('falta','Falta','dias',false,true),
  ('falta_justificada','Falta justificada','dias',true,false),
  ('atraso','Atraso','horas',false,true),
  ('saida_antecipada','Saída antecipada','horas',false,true),
  ('abono','Abono','horas',true,false),
  ('folga','Folga','dias',false,false),
  ('ferias','Férias','dias',false,false),
  ('afastamento','Afastamento','dias',true,false),
  ('compensacao','Compensação','horas',true,true),
  ('outros','Outros','dias',true,false);

INSERT INTO public.holidays (holiday_date, name, scope, is_demo) VALUES
  ('2026-01-01','Confraternização Universal','nacional',true),
  ('2026-04-21','Tiradentes','nacional',true),
  ('2026-05-01','Dia do Trabalho','nacional',true),
  ('2026-09-07','Independência do Brasil','nacional',true),
  ('2026-10-12','Nossa Senhora Aparecida','nacional',true),
  ('2026-11-02','Finados','nacional',true),
  ('2026-11-15','Proclamação da República','nacional',true),
  ('2026-12-25','Natal','nacional',true);

-- ============ DADOS DE DEMONSTRAÇÃO ============
INSERT INTO public.departments (id, name, code, is_demo) VALUES
  ('11111111-1111-1111-1111-111111111101','Operações','OPE',true),
  ('11111111-1111-1111-1111-111111111102','Administrativo','ADM',true),
  ('11111111-1111-1111-1111-111111111103','Comercial','COM',true),
  ('11111111-1111-1111-1111-111111111104','Logística','LOG',true);

INSERT INTO public.positions (id, name, department_id, is_demo) VALUES
  ('22222222-2222-2222-2222-222222222201','Analista de Operações','11111111-1111-1111-1111-111111111101',true),
  ('22222222-2222-2222-2222-222222222202','Auxiliar Administrativo','11111111-1111-1111-1111-111111111102',true),
  ('22222222-2222-2222-2222-222222222203','Analista de DP','11111111-1111-1111-1111-111111111102',true),
  ('22222222-2222-2222-2222-222222222204','Consultor Comercial','11111111-1111-1111-1111-111111111103',true),
  ('22222222-2222-2222-2222-222222222205','Conferente','11111111-1111-1111-1111-111111111104',true),
  ('22222222-2222-2222-2222-222222222206','Coordenador de Logística','11111111-1111-1111-1111-111111111104',true);

INSERT INTO public.work_schedules (id, name, daily_minutes, weekly_minutes, entry_time, break_start, break_end, exit_time, schedule_type, is_demo) VALUES
  ('33333333-3333-3333-3333-333333333301','Comercial 08:00–17:00',480,2640,'08:00','12:00','13:00','17:00','fixa',true),
  ('33333333-3333-3333-3333-333333333302','Administrativo 09:00–18:00',480,2640,'09:00','12:30','13:30','18:00','fixa',true),
  ('33333333-3333-3333-3333-333333333303','Turno 06:00–14:20',440,2640,'06:00','10:00','10:20','14:20','turno',true);

INSERT INTO public.employees (id, registration, full_name, cpf, birth_date, email, phone, hire_date, position_id, department_id, work_schedule_id, status, notes, is_demo) VALUES
  ('44444444-4444-4444-4444-444444444401','4821','Marina Souza Campos','123.456.789-01','1990-03-12','marina.campos@demo.com.br','(11) 98888-1001','2021-02-01','22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101','33333333-3333-3333-3333-333333333301','ativo','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444402','4822','Rafael Lima Moreira','234.567.890-12','1988-07-22','rafael.moreira@demo.com.br','(11) 98888-1002','2019-06-17','22222222-2222-2222-2222-222222222205','11111111-1111-1111-1111-111111111104','33333333-3333-3333-3333-333333333303','ativo','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444403','4823','Camila Nunes Prado','345.678.901-23','1995-11-05','camila.prado@demo.com.br','(11) 98888-1003','2022-09-05','22222222-2222-2222-2222-222222222202','11111111-1111-1111-1111-111111111102','33333333-3333-3333-3333-333333333302','ativo','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444404','4824','Helena Duarte Ramos','456.789.012-34','1986-01-30','helena.ramos@demo.com.br','(11) 98888-1004','2018-03-12','22222222-2222-2222-2222-222222222203','11111111-1111-1111-1111-111111111102','33333333-3333-3333-3333-333333333302','ativo','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444405','4825','João Pereira Alves','567.890.123-45','1992-05-18','joao.alves@demo.com.br','(11) 98888-1005','2020-11-23','22222222-2222-2222-2222-222222222206','11111111-1111-1111-1111-111111111104','33333333-3333-3333-3333-333333333301','ativo','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444406','4826','Felipe Dias Carvalho','678.901.234-56','1993-09-09','felipe.carvalho@demo.com.br','(11) 98888-1006','2023-01-09','22222222-2222-2222-2222-222222222204','11111111-1111-1111-1111-111111111103','33333333-3333-3333-3333-333333333301','ativo','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444407','4827','Aline Rocha Freitas','789.012.345-67','1997-12-01','aline.freitas@demo.com.br','(11) 98888-1007','2024-04-02','22222222-2222-2222-2222-222222222201','11111111-1111-1111-1111-111111111101','33333333-3333-3333-3333-333333333301','ativo','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444408','4828','Bruno Teixeira Melo','890.123.456-78','1984-02-14','bruno.melo@demo.com.br','(11) 98888-1008','2017-08-21','22222222-2222-2222-2222-222222222205','11111111-1111-1111-1111-111111111104','33333333-3333-3333-3333-333333333303','inativo','Registro de demonstração.',true);

UPDATE public.employees SET manager_id = '44444444-4444-4444-4444-444444444405'
  WHERE id IN ('44444444-4444-4444-4444-444444444402','44444444-4444-4444-4444-444444444408');
UPDATE public.employees SET termination_date = '2026-06-30' WHERE id = '44444444-4444-4444-4444-444444444408';

INSERT INTO public.time_periods (id, reference_year, reference_month, status) VALUES
  ('55555555-5555-5555-5555-555555555507', 2026, 7, 'fechado'),
  ('55555555-5555-5555-5555-555555555508', 2026, 8, 'em_conferencia'),
  ('55555555-5555-5555-5555-555555555509', 2026, 9, 'aberto');

-- Registros de ponto de demonstração: dias úteis de julho a setembro/2026
INSERT INTO public.time_records (
  employee_id, period_id, work_date, entry_at, break_out_at, break_in_at, exit_at,
  expected_minutes, worked_minutes, balance_minutes, overtime_minutes, negative_minutes, status, source, is_demo
)
SELECT
  e.id,
  p.id,
  d::date,
  CASE WHEN v.kind = 'falta' THEN NULL ELSE (ws.entry_time + (v.late || ' minutes')::interval)::time END,
  CASE WHEN v.kind = 'falta' THEN NULL ELSE ws.break_start END,
  CASE WHEN v.kind = 'falta' THEN NULL ELSE ws.break_end END,
  CASE WHEN v.kind IN ('falta','incompleto') THEN NULL ELSE (ws.exit_time + (v.extra || ' minutes')::interval)::time END,
  ws.daily_minutes,
  CASE WHEN v.kind IN ('falta','incompleto') THEN 0 ELSE ws.daily_minutes + v.extra - v.late END,
  CASE WHEN v.kind IN ('falta','incompleto') THEN 0 ELSE v.extra - v.late END,
  CASE WHEN v.kind IN ('falta','incompleto') THEN 0 ELSE GREATEST(v.extra - v.late, 0) END,
  CASE WHEN v.kind = 'falta' THEN ws.daily_minutes ELSE GREATEST(v.late - v.extra, 0) END,
  (CASE v.kind
     WHEN 'falta' THEN 'falta'
     WHEN 'incompleto' THEN 'incompleto'
     WHEN 'atraso' THEN 'atraso'
     ELSE 'normal' END)::public.time_record_status,
  'demonstracao',
  true
FROM public.employees e
JOIN public.work_schedules ws ON ws.id = e.work_schedule_id
CROSS JOIN LATERAL generate_series('2026-07-01'::date, '2026-09-25'::date, '1 day') AS d
JOIN public.time_periods p ON p.reference_year = EXTRACT(YEAR FROM d)::int AND p.reference_month = EXTRACT(MONTH FROM d)::int
CROSS JOIN LATERAL (
  SELECT
    CASE
      WHEN (EXTRACT(DAY FROM d)::int + ABS(hashtext(e.id::text)) % 7) % 23 = 0 THEN 'falta'
      WHEN (EXTRACT(DAY FROM d)::int + ABS(hashtext(e.id::text)) % 5) % 17 = 0 THEN 'incompleto'
      WHEN (EXTRACT(DAY FROM d)::int + ABS(hashtext(e.id::text)) % 3) % 11 = 0 THEN 'atraso'
      ELSE 'normal' END AS kind,
    CASE WHEN (EXTRACT(DAY FROM d)::int + ABS(hashtext(e.id::text)) % 3) % 11 = 0 THEN 14 ELSE 0 END AS late,
    CASE WHEN (EXTRACT(DAY FROM d)::int * 7 + ABS(hashtext(e.id::text)) % 9) % 6 = 0 THEN 65 ELSE 0 END AS extra
) v
WHERE e.status = 'ativo'
  AND EXTRACT(ISODOW FROM d) < 6
  AND NOT EXISTS (SELECT 1 FROM public.holidays h WHERE h.holiday_date = d::date);

-- Horas extras derivadas dos registros de ponto
INSERT INTO public.overtime_records (employee_id, time_record_id, period_id, reference_date, minutes, rate_percent, notes, is_demo)
SELECT tr.employee_id, tr.id, tr.period_id, tr.work_date, tr.overtime_minutes, NULL, 'Gerado a partir do ponto (demonstração).', true
FROM public.time_records tr
WHERE tr.overtime_minutes > 0 AND tr.is_demo;

-- Banco de horas: um lançamento mensal por funcionário a partir do saldo do ponto
INSERT INTO public.bank_hours (employee_id, period_id, entry_date, kind, minutes, previous_balance_minutes, balance_minutes, justification, is_demo)
SELECT
  tr.employee_id,
  tr.period_id,
  make_date(p.reference_year, p.reference_month, 1),
  CASE WHEN SUM(tr.balance_minutes) >= 0 THEN 'credito'::public.bank_hours_kind ELSE 'debito'::public.bank_hours_kind END,
  SUM(tr.balance_minutes),
  0,
  SUM(tr.balance_minutes),
  'Consolidação mensal de demonstração.',
  true
FROM public.time_records tr
JOIN public.time_periods p ON p.id = tr.period_id
WHERE tr.is_demo
GROUP BY tr.employee_id, tr.period_id, p.reference_year, p.reference_month;

-- Ocorrências derivadas das faltas e atrasos
INSERT INTO public.occurrences (employee_id, occurrence_type_id, period_id, occurrence_date, quantity, unit, justification, notes, is_demo)
SELECT tr.employee_id,
  CASE WHEN tr.status = 'falta' THEN (SELECT id FROM public.occurrence_types WHERE code = 'falta')
       ELSE (SELECT id FROM public.occurrence_types WHERE code = 'atraso') END,
  tr.period_id, tr.work_date,
  CASE WHEN tr.status = 'falta' THEN 1 ELSE ROUND(tr.negative_minutes / 60.0, 2) END,
  CASE WHEN tr.status = 'falta' THEN 'dias' ELSE 'horas' END,
  NULL,
  'Gerado a partir do ponto (demonstração).',
  true
FROM public.time_records tr
WHERE tr.is_demo AND tr.status IN ('falta','atraso');

INSERT INTO public.medical_certificates (employee_id, start_date, end_date, days, certificate_type, cid, notes, is_demo) VALUES
  ('44444444-4444-4444-4444-444444444401','2026-08-12','2026-08-14',3,'medico','J11','Atestado de demonstração.',true),
  ('44444444-4444-4444-4444-444444444403','2026-09-02','2026-09-02',1,'medico','M54','Atestado de demonstração.',true),
  ('44444444-4444-4444-4444-444444444402','2026-07-20','2026-07-22',3,'medico',NULL,'Atestado de demonstração.',true),
  ('44444444-4444-4444-4444-444444444406','2026-09-15','2026-09-17',3,'acompanhamento',NULL,'Atestado de demonstração.',true),
  ('44444444-4444-4444-4444-444444444405','2026-07-08','2026-07-08',1,'odontologico','K08','Atestado de demonstração.',true);

INSERT INTO public.occurrences (employee_id, occurrence_type_id, period_id, occurrence_date, end_date, quantity, unit, justification, notes, is_demo) VALUES
  ('44444444-4444-4444-4444-444444444407',(SELECT id FROM public.occurrence_types WHERE code='ferias'),'55555555-5555-5555-5555-555555555508','2026-08-03','2026-08-17',15,'dias','Férias programadas.','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444404',(SELECT id FROM public.occurrence_types WHERE code='abono'),'55555555-5555-5555-5555-555555555509','2026-09-10',NULL,2,'horas','Consulta médica com comprovante.','Registro de demonstração.',true),
  ('44444444-4444-4444-4444-444444444402',(SELECT id FROM public.occurrence_types WHERE code='compensacao'),'55555555-5555-5555-5555-555555555509','2026-09-18',NULL,4,'horas','Compensação de banco de horas.','Registro de demonstração.',true);