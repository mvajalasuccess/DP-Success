-- Controle individual de documentação por funcionário.
-- Não altera ponto, banco de horas, férias ou competências.
ALTER TABLE public.employee_document_catalog
  ALTER COLUMN category SET DEFAULT 'Documento';

ALTER TABLE public.employee_document_records
  ADD COLUMN IF NOT EXISTS has_documentation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'not_delivered',
  ADD COLUMN IF NOT EXISTS signature_status text NOT NULL DEFAULT 'not_applicable';

ALTER TABLE public.employee_document_records
  DROP CONSTRAINT IF EXISTS employee_document_records_delivery_status_check,
  ADD CONSTRAINT employee_document_records_delivery_status_check
    CHECK (delivery_status IN ('not_delivered','delivered')),
  DROP CONSTRAINT IF EXISTS employee_document_records_signature_status_check,
  ADD CONSTRAINT employee_document_records_signature_status_check
    CHECK (signature_status IN ('not_applicable','pending','signed'));

-- Registros anteriores continuam identificados como documentação existente,
-- mas não são marcados automaticamente como entregues ou assinados.
UPDATE public.employee_document_records
SET has_documentation = true
WHERE has_documentation = false
  AND delivery_status = 'not_delivered'
  AND signature_status = 'not_applicable';

CREATE TABLE IF NOT EXISTS public.employee_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES public.employee_document_catalog(id) ON DELETE CASCADE,
  is_applicable boolean NOT NULL DEFAULT false,
  is_required boolean NOT NULL DEFAULT false,
  requires_signature boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_document_requirements_employee_catalog_key UNIQUE (employee_id, catalog_id),
  CONSTRAINT employee_document_requirements_flags_check
    CHECK ((is_applicable OR (NOT is_required AND NOT requires_signature)))
);

CREATE INDEX IF NOT EXISTS idx_employee_document_requirements_employee
  ON public.employee_document_requirements(employee_id);

ALTER TABLE public.employee_document_requirements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS employee_document_requirements_access
  ON public.employee_document_requirements;
CREATE POLICY employee_document_requirements_access
  ON public.employee_document_requirements
  FOR ALL TO authenticated
  USING (public.has_app_access((select auth.uid())))
  WITH CHECK (public.can_manage((select auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.employee_document_requirements
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.employee_document_records
  TO authenticated;
GRANT SELECT
  ON TABLE public.employee_document_catalog
  TO authenticated;

-- Catálogo inicial organizado por categoria. Insere somente nomes ainda ausentes.
INSERT INTO public.employee_document_catalog (name, category, active)
SELECT seed.name, seed.category, true
FROM (VALUES
  ('RG','Pessoais'),
  ('CPF','Pessoais'),
  ('CNH','Pessoais'),
  ('PIS','Pessoais'),
  ('CTPS','Pessoais'),
  ('Título Eleitoral','Pessoais'),
  ('Dispensa Militar','Pessoais'),
  ('Comprovante de Endereço','Pessoais'),
  ('Declaração Conclusão Ensino Médio','Pessoais'),
  ('Certidão de Casamento','Pessoais'),
  ('Certidão de Nascimento','Pessoais'),
  ('Comprovante COVID','Pessoais'),
  ('Caderneta de Vacina','Pessoais'),
  ('Documento Pessoal Dependentes','Pessoais'),
  ('Ficha de Registro','Contratação'),
  ('Contrato de Experiência','Contratação'),
  ('Termo de LGPD','Contratação'),
  ('Termo de Confidencialidade','Contratação'),
  ('Termo de Responsabilidade','Contratação'),
  ('Declaração de Encargos IR','Contratação'),
  ('Acordo de Compensação de Horas Trabalhadas','Contratação'),
  ('Acordo de Prorrogação de Horas','Contratação'),
  ('Solicitação de Vale Transporte','Contratação'),
  ('Declaração de Ciência Ponto','Contratação'),
  ('Termo de Responsabilidade Chip e Celular','Contratação'),
  ('Política de Trânsito','Contratação'),
  ('Carta de Oposição Sindicato','Responsabilidades anuais'),
  ('Termo de Pensão','Responsabilidades anuais'),
  ('ASO','Medicina e Segurança do Trabalho'),
  ('Ficha de EPI','Medicina e Segurança do Trabalho'),
  ('NR01 Ordem de Serviço','Medicina e Segurança do Trabalho'),
  ('NR06 Certificado e Prova','Medicina e Segurança do Trabalho'),
  ('NR12 Certificado e Prova','Medicina e Segurança do Trabalho'),
  ('NR18 Certificado e Prova','Medicina e Segurança do Trabalho'),
  ('NR35 Certificado e Prova','Medicina e Segurança do Trabalho'),
  ('Férias','Recibos'),
  ('Holerites','Recibos'),
  ('Cartão de Ponto','Cartão de Ponto'),
  ('Advertências','Advertências'),
  ('Contratos de Vales Avulsos','Diversos'),
  ('Acordos diversos','Diversos')
) AS seed(name, category)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.employee_document_catalog existing
  WHERE lower(existing.name) = lower(seed.name)
);
