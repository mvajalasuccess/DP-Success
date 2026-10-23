-- Habilita o status de conclusão e a exclusão de comentários no Dashboard.
ALTER TABLE public.dashboard_competence_notes
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS dashboard_competence_notes_delete ON public.dashboard_competence_notes;
CREATE POLICY dashboard_competence_notes_delete ON public.dashboard_competence_notes
FOR DELETE USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));
