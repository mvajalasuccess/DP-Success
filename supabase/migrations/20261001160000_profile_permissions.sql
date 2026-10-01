ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.permissions IS 'Permissões por módulo no formato {modulo:{view:boolean,edit:boolean}}';