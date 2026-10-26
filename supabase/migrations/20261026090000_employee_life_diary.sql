-- Diário de Ocorrências: tabelas isoladas para histórico funcional.
-- Não altera ponto, banco de horas, competências ou cálculos existentes.
CREATE TABLE IF NOT EXISTS public.employee_life_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  event_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'Geral',
  direction text NOT NULL DEFAULT 'neutral' CHECK (direction IN ('positive','negative','neutral')),
  title text NOT NULL,
  description text,
  score integer NOT NULL DEFAULT 0 CHECK (score IN (0,1)),
  is_star boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','void')),
  void_reason text,
  period_id uuid REFERENCES public.time_periods(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'manual',
  source_reference text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_life_events_employee_date ON public.employee_life_events(employee_id, event_date DESC);
CREATE INDEX IF NOT EXISTS idx_employee_life_events_date ON public.employee_life_events(event_date);
ALTER TABLE public.employee_life_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_life_events_select ON public.employee_life_events;
CREATE POLICY employee_life_events_select ON public.employee_life_events FOR SELECT TO authenticated USING (public.has_app_access((select auth.uid())));
DROP POLICY IF EXISTS employee_life_events_insert ON public.employee_life_events;
CREATE POLICY employee_life_events_insert ON public.employee_life_events FOR INSERT TO authenticated WITH CHECK (public.can_manage((select auth.uid())));
DROP POLICY IF EXISTS employee_life_events_update ON public.employee_life_events;
CREATE POLICY employee_life_events_update ON public.employee_life_events FOR UPDATE TO authenticated USING (public.has_app_access((select auth.uid()))) WITH CHECK (public.can_manage((select auth.uid())));
DROP POLICY IF EXISTS employee_life_events_delete ON public.employee_life_events;
CREATE POLICY employee_life_events_delete ON public.employee_life_events FOR DELETE TO authenticated USING (public.can_manage((select auth.uid())));

CREATE TABLE IF NOT EXISTS public.employee_document_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Documento',
  alert_days integer NOT NULL DEFAULT 30 CHECK (alert_days >= 0 AND alert_days <= 365),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employee_document_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  catalog_id uuid REFERENCES public.employee_document_catalog(id) ON DELETE SET NULL,
  document_name text NOT NULL,
  last_completed_on date,
  due_date date,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','waived')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_document_records_due ON public.employee_document_records(due_date);
CREATE INDEX IF NOT EXISTS idx_employee_document_records_employee ON public.employee_document_records(employee_id);
ALTER TABLE public.employee_document_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_document_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_document_catalog_access ON public.employee_document_catalog;
CREATE POLICY employee_document_catalog_access ON public.employee_document_catalog FOR ALL TO authenticated USING (public.has_app_access((select auth.uid()))) WITH CHECK (public.can_manage((select auth.uid())));
DROP POLICY IF EXISTS employee_document_records_access ON public.employee_document_records;
CREATE POLICY employee_document_records_access ON public.employee_document_records FOR ALL TO authenticated USING (public.has_app_access((select auth.uid()))) WITH CHECK (public.can_manage((select auth.uid())));

CREATE TABLE IF NOT EXISTS public.employee_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_type text NOT NULL CHECK (process_type IN ('onboarding','offboarding')),
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employee_checklist_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  process_type text NOT NULL CHECK (process_type IN ('onboarding','offboarding')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','cancelled')),
  started_at date NOT NULL DEFAULT CURRENT_DATE,
  completed_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employee_checklist_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.employee_checklist_instances(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.employee_checklist_templates(id) ON DELETE SET NULL,
  title_snapshot text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','not_applicable')),
  due_date date,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.employee_checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_checklist_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_checklist_steps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_checklist_templates_access ON public.employee_checklist_templates;
CREATE POLICY employee_checklist_templates_access ON public.employee_checklist_templates FOR ALL TO authenticated USING (public.has_app_access((select auth.uid()))) WITH CHECK (public.can_manage((select auth.uid())));
DROP POLICY IF EXISTS employee_checklist_instances_access ON public.employee_checklist_instances;
CREATE POLICY employee_checklist_instances_access ON public.employee_checklist_instances FOR ALL TO authenticated USING (public.has_app_access((select auth.uid()))) WITH CHECK (public.can_manage((select auth.uid())));
DROP POLICY IF EXISTS employee_checklist_steps_access ON public.employee_checklist_steps;
CREATE POLICY employee_checklist_steps_access ON public.employee_checklist_steps FOR ALL TO authenticated USING (public.has_app_access((select auth.uid()))) WITH CHECK (public.can_manage((select auth.uid())));

CREATE TABLE IF NOT EXISTS public.employee_audit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  event_date date,
  category text NOT NULL DEFAULT 'Auditoria',
  title text NOT NULL,
  description text,
  source text NOT NULL DEFAULT 'manual',
  source_reference text,
  original_data jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employee_audit_history_employee_date ON public.employee_audit_history(employee_id, event_date DESC);
ALTER TABLE public.employee_audit_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_audit_history_access ON public.employee_audit_history;
CREATE POLICY employee_audit_history_access ON public.employee_audit_history FOR ALL TO authenticated USING (public.has_app_access((select auth.uid()))) WITH CHECK (public.can_manage((select auth.uid())));
