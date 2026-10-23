-- Permite vários comentários/checkpoints para a mesma competência.
-- Os registros existentes são preservados; apenas removemos a restrição de um comentário por competência.
ALTER TABLE public.dashboard_competence_notes
  DROP CONSTRAINT IF EXISTS dashboard_competence_notes_period_id_key;

CREATE INDEX IF NOT EXISTS idx_dashboard_competence_notes_period_created
  ON public.dashboard_competence_notes (period_id, created_at);
