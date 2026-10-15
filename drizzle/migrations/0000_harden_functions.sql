ALTER FUNCTION public.set_company_settings_updated_at() SET search_path = public;
ALTER FUNCTION public.set_dashboard_competence_notes_updated_at() SET search_path = public;
ALTER FUNCTION public.set_point_closing_overrides_updated_at() SET search_path = public;
ALTER FUNCTION public.set_system_settings_updated_at() SET search_path = public;
ALTER FUNCTION public.set_tasks_updated_at() SET search_path = public;
ALTER FUNCTION public.sync_profile_permissions() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.is_rh_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_rh_user() TO authenticated;