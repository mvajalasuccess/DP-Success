-- DP SUCCESS: robust removal of legacy public role-inspection functions.
-- Handles PostgreSQL policy expressions with or without the "public." qualifier.
-- Does not modify business data or historical calculations.

CREATE SCHEMA IF NOT EXISTS private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.can_manage(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role IN ('administrador'::public.app_role, 'rh'::public.app_role)
      AND p.active = true
  );
$$;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
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

CREATE OR REPLACE FUNCTION private.has_app_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
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

REVOKE ALL ON FUNCTION private.can_manage(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_app_access(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_profile_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_profile_manager(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_app_access(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_profile_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_profile_manager(uuid) TO authenticated;

-- Rewrite policy expressions regardless of whether PostgreSQL deparsed
-- the function call as public.function_name(...) or function_name(...).
DO $$
DECLARE
  p record;
  v_qual text;
  v_check text;
  v_roles text;
  v_sql text;
  v_changed boolean;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    v_qual := p.qual;
    v_check := p.with_check;
    v_changed := false;

    IF v_qual IS NOT NULL THEN
      v_qual := regexp_replace(v_qual, '(^|[^[:alnum:]_.])((public\.)?has_role)[[:space:]]*\(', E'\\1private.has_role(', 'gi');
      v_qual := regexp_replace(v_qual, '(^|[^[:alnum:]_.])((public\.)?can_manage)[[:space:]]*\(', E'\\1private.can_manage(', 'gi');
      v_qual := regexp_replace(v_qual, '(^|[^[:alnum:]_.])((public\.)?has_app_access)[[:space:]]*\(', E'\\1private.has_app_access(', 'gi');
      v_qual := regexp_replace(v_qual, '(^|[^[:alnum:]_.])((public\.)?is_profile_admin)[[:space:]]*\(', E'\\1private.is_profile_admin(', 'gi');
      v_qual := regexp_replace(v_qual, '(^|[^[:alnum:]_.])((public\.)?is_profile_manager)[[:space:]]*\(', E'\\1private.is_profile_manager(', 'gi');
      v_changed := v_changed OR v_qual IS DISTINCT FROM p.qual;
    END IF;

    IF v_check IS NOT NULL THEN
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_.])((public\.)?has_role)[[:space:]]*\(', E'\\1private.has_role(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_.])((public\.)?can_manage)[[:space:]]*\(', E'\\1private.can_manage(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_.])((public\.)?has_app_access)[[:space:]]*\(', E'\\1private.has_app_access(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_.])((public\.)?is_profile_admin)[[:space:]]*\(', E'\\1private.is_profile_admin(', 'gi');
      v_check := regexp_replace(v_check, '(^|[^[:alnum:]_.])((public\.)?is_profile_manager)[[:space:]]*\(', E'\\1private.is_profile_manager(', 'gi');
      v_changed := v_changed OR v_check IS DISTINCT FROM p.with_check;
    END IF;

    IF v_changed THEN
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
    END IF;
  END LOOP;
END $$;

-- Remove public execution rights from all legacy introspection RPCs.
REVOKE ALL ON FUNCTION public.is_profile_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_profile_manager(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_manage(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_app_access(uuid) FROM PUBLIC, anon, authenticated;

-- DROP without CASCADE: any remaining dependency causes a safe failure.
DROP FUNCTION public.is_profile_admin(uuid);
DROP FUNCTION public.is_profile_manager(uuid);
