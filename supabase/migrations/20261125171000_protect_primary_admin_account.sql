begin;

alter table public.profiles
  add column if not exists is_protected_account boolean not null default false;

-- Identify the existing account by its normalized Auth email once. The profile
-- flag then follows the account ID, even if the owner changes their email.
do $$
declare
  owner_id uuid;
begin
  select u.id into owner_id
  from auth.users u
  where encode(extensions.digest(lower(btrim(u.email)), 'sha256'), 'hex')
    = '139341f4b7511876dc19f96808ff6537b91e08a77517067d38b1593ee3c26a45';

  if owner_id is null then
    raise notice 'Conta principal não encontrada neste ambiente.';
    return;
  end if;

  if not exists (
    select 1 from public.profiles p
    join public.user_roles r on r.user_id = p.id
    where p.id = owner_id and p.active and r.role = 'administrador'::public.app_role
  ) then
    raise exception 'A conta principal precisa estar cadastrada como administradora ativa.';
  end if;

  update public.profiles
  set is_protected_account = true
  where id = owner_id and not is_protected_account;
end;
$$;

create or replace function private.guard_protected_account_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_protected_account then
      raise insufficient_privilege using message = 'A proteção da conta principal só pode ser configurada por migração.';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_protected_account then
      raise insufficient_privilege using message = 'A conta principal é protegida e não pode ser excluída.';
    end if;
    return old;
  end if;

  if new.is_protected_account is distinct from old.is_protected_account or (
    old.is_protected_account and (
      auth.uid() is distinct from old.id
      or new.id is distinct from old.id
      or new.active is distinct from old.active
      or new.role is distinct from old.role
      or new.permissions is distinct from old.permissions
    )
  ) then
    raise insufficient_privilege using message = 'A conta principal é protegida.';
  end if;
  return new;
end;
$$;

create or replace function private.guard_protected_account_delete_or_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_id uuid;
  next_id uuid;
begin
  if tg_table_schema = 'auth' then
    previous_id := old.id;
  else
    if tg_op <> 'INSERT' then
      previous_id := old.user_id;
    end if;
    if tg_op <> 'DELETE' then
      next_id := new.user_id;
    end if;
  end if;

  if exists (
    select 1 from public.profiles
    where id in (previous_id, next_id) and is_protected_account
  ) then
    raise insufficient_privilege using message = 'A conta principal é protegida e seu acesso não pode ser alterado ou excluído.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_protected_account_profile() from public, anon, authenticated;
revoke all on function private.guard_protected_account_delete_or_role() from public, anon, authenticated;

drop trigger if exists guard_protected_account_profile on public.profiles;
create trigger guard_protected_account_profile
before insert or update or delete on public.profiles
for each row execute function private.guard_protected_account_profile();

drop trigger if exists guard_protected_account_roles on public.user_roles;
create trigger guard_protected_account_roles
before insert or update or delete on public.user_roles
for each row execute function private.guard_protected_account_delete_or_role();

drop trigger if exists guard_protected_account_auth_delete on auth.users;
create trigger guard_protected_account_auth_delete
before delete on auth.users
for each row execute function private.guard_protected_account_delete_or_role();

commit;
