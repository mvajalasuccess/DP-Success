-- DP SUCCESS - impede consultas de permissões de outros usuários via RPC.
-- As funções continuam disponíveis para as políticas RLS, mas só respondem
-- sobre o usuário autenticado (auth.uid()). Não altera registros de negócio.

CREATE OR REPLACE FUNCTION public.has_role(
  _user_id uuid,
  _role public.app_role
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = _role
        AND p.active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.can_manage(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role IN (
          'administrador'::public.app_role,
          'rh'::public.app_role
        )
        AND p.active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.has_app_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND p.active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_profile_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'administrador'::public.app_role
        AND p.active = true
    );
$$;

CREATE OR REPLACE FUNCTION public.is_profile_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    _user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.profiles p ON p.id = ur.user_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role IN (
          'administrador'::public.app_role,
          'rh'::public.app_role
        )
        AND p.active = true
    );
$$;

-- Mantém as chamadas necessárias pelas políticas RLS da aplicação.
-- O parâmetro UUID não permite mais consultar a permissão de terceiros.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_app_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_profile_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_profile_manager(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_app_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profile_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_profile_manager(uuid) TO authenticated;
