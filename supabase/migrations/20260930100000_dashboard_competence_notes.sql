CREATE TABLE IF NOT EXISTS public.dashboard_competence_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.time_periods(id) ON DELETE CASCADE,
  note text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(period_id)
);

ALTER TABLE public.dashboard_competence_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY dashboard_competence_notes_select ON public.dashboard_competence_notes
FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY dashboard_competence_notes_insert ON public.dashboard_competence_notes
FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE POLICY dashboard_competence_notes_update ON public.dashboard_competence_notes
FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()));

CREATE OR REPLACE FUNCTION public.set_dashboard_competence_notes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_dashboard_competence_notes_updated_at
BEFORE UPDATE ON public.dashboard_competence_notes
FOR EACH ROW EXECUTE FUNCTION public.set_dashboard_competence_notes_updated_at();
