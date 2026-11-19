begin;
lock table public.profiles, public.user_roles in share row exclusive mode;

delete from public.user_roles where role not in ('administrador', 'convidado');
delete from public.user_roles guest
where guest.role = 'convidado' and exists (
  select 1 from public.user_roles administrator
  where administrator.user_id = guest.user_id and administrator.role = 'administrador'
);
alter table public.user_roles
  add constraint user_roles_one_role_per_account unique (user_id),
  add constraint user_roles_supported_role check (role in ('administrador', 'convidado'));

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
revoke execute on function public.sync_profile_role_from_user_roles() from public, anon, authenticated;

insert into public.user_roles (user_id, role)
select id, 'convidado' from public.profiles
on conflict (user_id) do nothing;

update public.profiles p
set role = r.role::text
from public.user_roles r
where r.user_id = p.id and p.role is distinct from r.role::text;

alter table public.profiles
  alter column role set default 'convidado',
  add constraint profiles_supported_access_role
    check (role is not null and role in ('administrador', 'convidado'));

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
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, inv.role) ON CONFLICT (user_id) DO UPDATE SET role = excluded.role;
    UPDATE public.user_invites SET used_at = now(), used_by = NEW.id, used_email = NEW.email WHERE id = inv.id;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'consume_invite_on_signup: %', SQLERRM;
  END;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created_consume_invite ON auth.users;
CREATE TRIGGER on_auth_user_created_consume_invite AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.consume_invite_on_signup();
revoke execute on function public.consume_invite_on_signup() from public, anon, authenticated;

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
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'convidado') ON CONFLICT (user_id) DO NOTHING;
  SELECT role INTO STRICT _existing FROM public.user_roles WHERE user_id = _uid;
  RETURN _existing;
END; $$;
revoke execute on function public.ensure_user_setup(text, text) from public, anon;
grant execute on function public.ensure_user_setup(text, text) to authenticated;

create function public.set_account_access(
  requester_id uuid, target_id uuid, new_role public.app_role, new_active boolean
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  if requester_id = target_id or not exists (
    select 1 from public.user_roles r
    join public.profiles p on p.id = r.user_id
    where r.user_id = requester_id and r.role = 'administrador' and p.active
  ) then
    raise insufficient_privilege using message = 'Apenas Administradores ativos podem alterar o acesso de outros usuários.';
  end if;

  update public.profiles set active = coalesce(new_active, active) where id = target_id;
  if not found then
    raise no_data_found using message = 'Usuário não encontrado.';
  end if;

  if new_role is not null then
    insert into public.user_roles (user_id, role) values (target_id, new_role)
    on conflict (user_id) do update set role = excluded.role;
  end if;
end;
$$;

revoke execute on function public.set_account_access(uuid, uuid, public.app_role, boolean)
  from public, anon, authenticated;
grant execute on function public.set_account_access(uuid, uuid, public.app_role, boolean)
  to service_role;

commit;
