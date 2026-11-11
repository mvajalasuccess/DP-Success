-- 1) user_roles is the single source of truth; active profile required
CREATE OR REPLACE FUNCTION public.has_app_access(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  select exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
    where r.user_id = _user_id and p.active = true);
$$;
CREATE OR REPLACE FUNCTION public.can_manage(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
  select exists (select 1 from public.user_roles r join public.profiles p on p.id = r.user_id
    where r.user_id = _user_id and p.active = true and r.role = 'administrador'::public.app_role);
$$;
CREATE OR REPLACE FUNCTION public.is_profile_admin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ select public.can_manage(_user_id); $$;
CREATE OR REPLACE FUNCTION public.is_profile_manager(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ select public.can_manage(_user_id); $$;

-- 2) keep profiles.role mirrored from user_roles (display only)
CREATE OR REPLACE FUNCTION public.sync_profile_role_from_user_roles() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := coalesce(NEW.user_id, OLD.user_id); _r text;
BEGIN
  SELECT role::text INTO _r FROM public.user_roles WHERE user_id = _uid
   ORDER BY (role = 'administrador') DESC LIMIT 1;
  UPDATE public.profiles SET role = coalesce(_r, 'convidado') WHERE id = _uid AND role IS DISTINCT FROM coalesce(_r, 'convidado');
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_sync_profile_role ON public.user_roles;
CREATE TRIGGER trg_sync_profile_role AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_from_user_roles();
UPDATE public.profiles p SET role = r.role::text FROM public.user_roles r
 WHERE r.user_id = p.id AND p.role IS DISTINCT FROM r.role::text;

-- 3) users cannot change their own role/active/permissions from the browser
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name) ON public.profiles TO authenticated;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

-- 4) write policies that only required "has a profile" now require Administrador
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['company_settings','system_settings','dashboard_competence_notes','tasks','task_checklist_items','task_reminders'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t||'_delete', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS tasks_select_rh ON public.tasks; DROP POLICY IF EXISTS tasks_insert_rh ON public.tasks;
DROP POLICY IF EXISTS tasks_update_rh ON public.tasks; DROP POLICY IF EXISTS tasks_delete_rh ON public.tasks;
DROP POLICY IF EXISTS task_checklist_select_rh ON public.task_checklist_items; DROP POLICY IF EXISTS task_checklist_insert_rh ON public.task_checklist_items;
DROP POLICY IF EXISTS task_checklist_update_rh ON public.task_checklist_items; DROP POLICY IF EXISTS task_checklist_delete_rh ON public.task_checklist_items;
DROP POLICY IF EXISTS task_reminders_select_rh ON public.task_reminders; DROP POLICY IF EXISTS task_reminders_insert_rh ON public.task_reminders;
DROP POLICY IF EXISTS task_reminders_update_rh ON public.task_reminders; DROP POLICY IF EXISTS task_reminders_delete_rh ON public.task_reminders;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['company_settings','system_settings','dashboard_competence_notes','tasks','task_checklist_items','task_reminders'] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_app_access(auth.uid()))', t||'_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage(auth.uid()))', t||'_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_manage(auth.uid())) WITH CHECK (public.can_manage(auth.uid()))', t||'_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_manage(auth.uid()))', t||'_delete', t);
  END LOOP;
END $$;

-- 5) invites
CREATE TABLE public.user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  role public.app_role NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid,
  used_email text,
  canceled_at timestamptz,
  CONSTRAINT user_invites_role_check CHECK (role IN ('administrador','convidado'))
);
GRANT SELECT ON public.user_invites TO authenticated;
GRANT ALL ON public.user_invites TO service_role;
ALTER TABLE public.user_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_invites_select_admin ON public.user_invites FOR SELECT TO authenticated USING (public.can_manage(auth.uid()));

CREATE OR REPLACE FUNCTION public.create_invite(_role public.app_role, _valid_days integer DEFAULT 7)
RETURNS public.user_invites LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.user_invites;
BEGIN
  IF NOT public.can_manage(auth.uid()) THEN RAISE EXCEPTION 'Apenas Administradores podem gerar convites.'; END IF;
  IF _role NOT IN ('administrador','convidado') THEN RAISE EXCEPTION 'Tipo de acesso inválido.'; END IF;
  IF _valid_days IS NULL OR _valid_days < 1 OR _valid_days > 30 THEN RAISE EXCEPTION 'Validade deve ser de 1 a 30 dias.'; END IF;
  INSERT INTO public.user_invites (token, role, created_by, expires_at)
  VALUES (encode(extensions.gen_random_bytes(32), 'hex'), _role, auth.uid(), now() + make_interval(days => _valid_days))
  RETURNING * INTO r;
  RETURN r;
END; $$;

CREATE OR REPLACE FUNCTION public.cancel_invite(_invite_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.can_manage(auth.uid()) THEN RAISE EXCEPTION 'Apenas Administradores podem cancelar convites.'; END IF;
  UPDATE public.user_invites SET canceled_at = now()
   WHERE id = _invite_id AND used_at IS NULL AND canceled_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convite não pode ser cancelado (já utilizado ou cancelado).'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.invite_info(_token text)
RETURNS TABLE(role public.app_role, status text, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT i.role,
    CASE WHEN i.canceled_at IS NOT NULL THEN 'cancelado'
         WHEN i.used_at IS NOT NULL THEN 'utilizado'
         WHEN i.expires_at <= now() THEN 'expirado' ELSE 'pendente' END,
    i.expires_at
  FROM public.user_invites i WHERE i.token = _token;
$$;

-- consumes the invite atomically when the account is created
CREATE OR REPLACE FUNCTION public.consume_invite_on_signup() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _token text := NEW.raw_user_meta_data->>'invite_token'; inv public.user_invites;
BEGIN
  IF _token IS NULL OR _token = '' THEN RETURN NEW; END IF;
  BEGIN
    SELECT * INTO inv FROM public.user_invites
     WHERE token = _token AND used_at IS NULL AND canceled_at IS NULL AND expires_at > now()
     FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (NEW.id, nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''), NEW.email)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, inv.role) ON CONFLICT (user_id, role) DO NOTHING;
    UPDATE public.user_invites SET used_at = now(), used_by = NEW.id, used_email = NEW.email WHERE id = inv.id;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'consume_invite_on_signup: %', SQLERRM;
  END;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created_consume_invite ON auth.users;
CREATE TRIGGER on_auth_user_created_consume_invite AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.consume_invite_on_signup();

-- 6) signups without invite are always Convidado (no first-user admin shortcut)
CREATE OR REPLACE FUNCTION public.ensure_user_setup(_full_name text DEFAULT NULL::text, _email text DEFAULT NULL::text)
RETURNS app_role LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _existing public.app_role;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado.'; END IF;
  INSERT INTO public.profiles (id, full_name, email) VALUES (_uid, _full_name, _email)
  ON CONFLICT (id) DO UPDATE
    SET full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        email = COALESCE(EXCLUDED.email, public.profiles.email);
  SELECT role INTO _existing FROM public.user_roles WHERE user_id = _uid ORDER BY (role = 'administrador') DESC LIMIT 1;
  IF _existing IS NOT NULL THEN
    UPDATE public.profiles SET role = _existing::text WHERE id = _uid AND role IS DISTINCT FROM _existing::text;
    RETURN _existing;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'convidado') ON CONFLICT (user_id, role) DO NOTHING;
  RETURN 'convidado';
END; $$;

-- 7) admin renames a user (name only)
CREATE OR REPLACE FUNCTION public.admin_update_user_name(_user_id uuid, _full_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.can_manage(auth.uid()) THEN RAISE EXCEPTION 'Apenas Administradores podem editar usuários.'; END IF;
  IF _full_name IS NULL OR length(trim(_full_name)) < 2 THEN RAISE EXCEPTION 'Informe o nome completo.'; END IF;
  UPDATE public.profiles SET full_name = trim(_full_name) WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário não encontrado.'; END IF;
END; $$;

REVOKE EXECUTE ON FUNCTION public.create_invite(public.app_role, integer), public.cancel_invite(uuid), public.admin_update_user_name(uuid, text), public.consume_invite_on_signup(), public.sync_profile_role_from_user_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invite(public.app_role, integer), public.cancel_invite(uuid), public.admin_update_user_name(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.invite_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_info(text) TO anon, authenticated;