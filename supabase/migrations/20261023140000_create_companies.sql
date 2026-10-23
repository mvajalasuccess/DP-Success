-- Cadastro de empresas do grupo e vínculo opcional aos funcionários.
-- Não preenche nem modifica vínculos existentes, cálculos ou históricos.
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cnpj text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_name_unique UNIQUE (name),
  CONSTRAINT companies_cnpj_unique UNIQUE (cnpj),
  CONSTRAINT companies_cnpj_digits CHECK (cnpj ~ '^[0-9]{14}$')
);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS company_id uuid NULL
  REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_employees_company_id
  ON public.employees(company_id);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_app_select ON public.companies;
CREATE POLICY companies_app_select ON public.companies
FOR SELECT TO authenticated
USING ((SELECT private.has_app_access()));

DROP POLICY IF EXISTS companies_app_insert ON public.companies;
CREATE POLICY companies_app_insert ON public.companies
FOR INSERT TO authenticated
WITH CHECK ((SELECT private.has_role('rh'::public.app_role)));

DROP POLICY IF EXISTS companies_app_update ON public.companies;
CREATE POLICY companies_app_update ON public.companies
FOR UPDATE TO authenticated
USING ((SELECT private.has_role('rh'::public.app_role)))
WITH CHECK ((SELECT private.has_role('rh'::public.app_role)));

DROP POLICY IF EXISTS companies_app_delete ON public.companies;
CREATE POLICY companies_app_delete ON public.companies
FOR DELETE TO authenticated
USING ((SELECT private.has_role('administrador'::public.app_role)));
