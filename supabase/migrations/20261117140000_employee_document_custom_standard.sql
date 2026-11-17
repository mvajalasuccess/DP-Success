-- Permite definir se um documento personalizado é padrão para o funcionário.
-- Não adiciona o documento ao catálogo global e não altera registros existentes.
ALTER TABLE public.employee_document_records
  ADD COLUMN IF NOT EXISTS is_standard boolean NOT NULL DEFAULT false;
