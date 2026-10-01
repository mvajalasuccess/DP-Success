-- Regra única de acesso por perfil:
-- Administrador e RH: acesso total (visualizar e editar).
-- Consulta: somente visualização.

CREATE OR REPLACE FUNCTION public.is_profile_manager(_user_id uuid)
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
      AND role IN ('administrador', 'rh')
      AND active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_profile_manager(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_profile_manager(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin_or_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;

CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR public.is_profile_manager((SELECT auth.uid()))
);

CREATE POLICY profiles_update_manager_or_own ON public.profiles
FOR UPDATE TO authenticated
USING (
  id = (SELECT auth.uid())
  OR public.is_profile_manager((SELECT auth.uid()))
)
WITH CHECK (
  id = (SELECT auth.uid())
  OR public.is_profile_manager((SELECT auth.uid()))
);

-- Sincroniza o campo legado de permissões para refletir o perfil.
CREATE OR REPLACE FUNCTION public.sync_profile_permissions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  permissions jsonb := '{}'::jsonb;
  modules text[] := ARRAY[
    'dashboard','funcionarios','empresa','fechamento','lancamentos',
    'atestados','ocorrencias','banco_horas','relatorios','comparativos',
    'kpis','configuracoes','importar','tarefas'
  ];
  module text;
BEGIN
  FOREACH module IN ARRAY modules LOOP
    permissions := permissions || jsonb_build_object(
      module,
      jsonb_build_object(
        'view', true,
        'edit', NEW.role IN ('administrador','rh')
      )
    );
  END LOOP;
  NEW.permissions := permissions;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_permissions ON public.profiles;

CREATE TRIGGER trg_sync_profile_permissions
BEFORE INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_permissions();

-- Corrige os perfis já existentes para o novo modelo.
UPDATE public.profiles
SET permissions = (
  SELECT jsonb_object_agg(
    module,
    jsonb_build_object(
      'view', true,
      'edit', public.profiles.role IN ('administrador','rh')
    )
  )
  FROM unnest(ARRAY[
    'dashboard','funcionarios','empresa','fechamento','lancamentos',
    'atestados','ocorrencias','banco_horas','relatorios','comparativos',
    'kpis','configuracoes','importar','tarefas'
  ]) AS module
);
