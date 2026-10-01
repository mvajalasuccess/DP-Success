-- Permitir que administradores gerenciem todos os perfis.
-- Usuários comuns continuam limitados ao próprio perfil.

CREATE OR REPLACE FUNCTION public.is_profile_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = _user_id
      AND role = 'administrador'
      AND active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_profile_admin(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_profile_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR public.is_profile_admin((SELECT auth.uid()))
);

CREATE POLICY profiles_insert_own ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
  id = (SELECT auth.uid())
);

CREATE POLICY profiles_update_admin_or_own ON public.profiles
FOR UPDATE TO authenticated
USING (
  id = (SELECT auth.uid())
  OR public.is_profile_admin((SELECT auth.uid()))
)
WITH CHECK (
  id = (SELECT auth.uid())
  OR public.is_profile_admin((SELECT auth.uid()))
);
