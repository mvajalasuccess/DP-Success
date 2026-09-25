DROP FUNCTION IF EXISTS public.current_roles();

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.certificate_cid(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.certificate_cid(UUID) TO authenticated;