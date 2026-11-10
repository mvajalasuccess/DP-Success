ALTER TABLE public.employee_document_records
  ADD COLUMN IF NOT EXISTS no_due_date boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.employee_document_records.no_due_date IS
  'Indica explicitamente que o documento não possui data de vencimento.';
