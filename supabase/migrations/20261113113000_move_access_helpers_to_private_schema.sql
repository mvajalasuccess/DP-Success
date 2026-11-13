-- DP SUCCESS: remove role-inspection helpers from the exposed public API.
-- Authorization helpers move to the non-exposed private schema. Existing RLS
-- policies are rewritten in place; business data and historical calculations
-- are not modified.

CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id AND ur.role = _role AND p.active = true
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('administrador'::public.app_role, 'rh'::public.app_role)
      AND p.active = true
  );
$$;

CREATE OR REPLACE FUNCTION private.has_app_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id AND p.active = true
  );
$$;

CREATE OR REPLACE FUNCTION private.is_profile_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.has_role(_user_id, 'administrador'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION private.is_profile_manager(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT private.can_manage(_user_id);
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_app_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_profile_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_profile_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_app_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_profile_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_profile_manager(uuid) TO authenticated;

-- Rewrite every existing public RLS policy that used these helpers to use
-- the private, non-PostgREST-exposed equivalents.
DO $$
DECLARE
  p record;
  v_qual text;
  v_check text;
  v_roles text;
  v_sql text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        coalesce(qual, '') LIKE '%public.has_role(%'
        OR coalesce(qual, '') LIKE '%public.can_manage(%'
        OR coalesce(qual, '') LIKE '%public.has_app_access(%'
        OR coalesce(qual, '') LIKE '%public.is_profile_admin(%'
        OR coalesce(qual, '') LIKE '%public.is_profile_manager(%'
        OR coalesce(with_check, '') LIKE '%public.has_role(%'
        OR coalesce(with_check, '') LIKE '%public.can_manage(%'
        OR coalesce(with_check, '') LIKE '%public.has_app_access(%'
        OR coalesce(with_check, '') LIKE '%public.is_profile_admin(%'
        OR coalesce(with_check, '') LIKE '%public.is_profile_manager(%'
      )
  LOOP
    v_qual := p.qual;
    v_check := p.with_check;
    IF v_qual IS NOT NULL THEN
      v_qual := replace(v_qual, 'public.has_role(', 'private.has_role(');
      v_qual := replace(v_qual, 'public.can_manage(', 'private.can_manage(');
      v_qual := replace(v_qual, 'public.has_app_access(', 'private.has_app_access(');
      v_qual := replace(v_qual, 'public.is_profile_admin(', 'private.is_profile_admin(');
      v_qual := replace(v_qual, 'public.is_profile_manager(', 'private.is_profile_manager(');
    END IF;
    IF v_check IS NOT NULL THEN
      v_check := replace(v_check, 'public.has_role(', 'private.has_role(');
      v_check := replace(v_check, 'public.can_manage(', 'private.can_manage(');
      v_check := replace(v_check, 'public.has_app_access(', 'private.has_app_access(');
      v_check := replace(v_check, 'public.is_profile_admin(', 'private.is_profile_admin(');
      v_check := replace(v_check, 'public.is_profile_manager(', 'private.is_profile_manager(');
    END IF;

    v_roles := array_to_string(p.roles, ', ');
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    v_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      p.policyname, p.schemaname, p.tablename, p.permissive, p.cmd, v_roles
    );
    IF v_qual IS NOT NULL THEN
      v_sql := v_sql || format(' USING (%s)', v_qual);
    END IF;
    IF v_check IS NOT NULL THEN
      v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
    END IF;
    EXECUTE v_sql;
  END LOOP;
END $$;

-- A signed-in user may read only their own role row. Admin user management
-- reads the profiles.role mirror; role changes remain server-side.
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

-- Stop exposing permission-check RPCs through the public API.
-- Remove the legacy public wrappers entirely after policies have been
-- rewritten to call private.*. DROP without CASCADE is intentional: if any
-- dependency remains, the migration must stop rather than silently break it.
DROP FUNCTION IF EXISTS public.is_profile_admin(uuid);
DROP FUNCTION IF EXISTS public.is_profile_manager(uuid);

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_app_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_profile_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_profile_manager(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_roles() FROM PUBLIC, anon, authenticated;
