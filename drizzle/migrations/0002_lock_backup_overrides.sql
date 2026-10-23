ALTER TABLE public.backup_ormindo_overrides_20261022 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_ormindo_overrides_20261022 FROM anon, authenticated;
GRANT ALL ON public.backup_ormindo_overrides_20261022 TO service_role;