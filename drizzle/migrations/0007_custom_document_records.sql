ALTER TABLE public.employee_document_records ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.employee_document_records ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;