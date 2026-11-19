GRANT SELECT, INSERT, UPDATE, DELETE ON public.pj_people, public.pj_recesses, public.pj_documents, public.pj_document_catalog, public.pj_document_requirements TO authenticated;
GRANT ALL ON public.pj_people, public.pj_recesses, public.pj_documents, public.pj_document_catalog, public.pj_document_requirements TO service_role;
CREATE POLICY pj_select ON public.pj_people FOR SELECT TO authenticated USING (private.has_app_access((SELECT auth.uid())));
CREATE POLICY pj_select ON public.pj_recesses FOR SELECT TO authenticated USING (private.has_app_access((SELECT auth.uid())));
CREATE POLICY pj_select ON public.pj_documents FOR SELECT TO authenticated USING (private.has_app_access((SELECT auth.uid())));
CREATE POLICY pj_select ON public.pj_document_catalog FOR SELECT TO authenticated USING (private.has_app_access((SELECT auth.uid())));
CREATE POLICY pj_select ON public.pj_document_requirements FOR SELECT TO authenticated USING (private.has_app_access((SELECT auth.uid())));