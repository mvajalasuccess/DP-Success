DO $$ DECLARE p record; BEGIN
FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='point_closing_overrides' LOOP
EXECUTE format('DROP POLICY %I ON public.point_closing_overrides', p.policyname);
END LOOP; END $$;
ALTER TABLE public.point_closing_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pco_select" ON public.point_closing_overrides FOR SELECT TO authenticated USING (public.has_app_access(auth.uid()));
CREATE POLICY "pco_insert" ON public.point_closing_overrides FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "pco_update" ON public.point_closing_overrides FOR UPDATE TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()));
CREATE POLICY "pco_delete" ON public.point_closing_overrides FOR DELETE TO authenticated USING (public.can_manage(auth.uid()));