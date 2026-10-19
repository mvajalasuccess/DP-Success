-- Bloqueia o acesso ao banco para contas desativadas, mesmo que a sessão
-- de autenticação ainda exista. Mantém os papéis atuais e os dados históricos.
-- As verificações são centralizadas nas funções usadas pelas políticas RLS.

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
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
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
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN (
        'administrador'::public.app_role,
        'rh'::public.app_role
      )
      AND p.active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_roles()
RETURNS SETOF public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.user_id = (SELECT auth.uid())
    AND p.active = true;
$$;

CREATE OR REPLACE FUNCTION public.has_app_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND p.active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_app_access(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_app_access(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.current_roles() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_roles() TO authenticated;
