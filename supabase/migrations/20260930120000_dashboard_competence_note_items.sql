ALTER TABLE public.dashboard_competence_notes
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.dashboard_competence_notes.items IS 'Lista de pendências da competência em formato JSON: [{id,text,done}]';