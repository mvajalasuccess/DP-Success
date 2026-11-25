begin;

alter table public.user_invites enable row level security;

drop policy if exists user_invites_delete_canceled_admin on public.user_invites;
create policy user_invites_delete_canceled_admin on public.user_invites
for delete to authenticated
using (
  canceled_at is not null
  and used_at is null
  and (select private.has_role(auth.uid(), 'administrador'::public.app_role))
);

-- Keep the same limit even if another permissive delete policy is added.
drop policy if exists user_invites_delete_canceled_guard on public.user_invites;
create policy user_invites_delete_canceled_guard on public.user_invites
as restrictive for delete to authenticated
using (
  canceled_at is not null
  and used_at is null
  and (select private.has_role(auth.uid(), 'administrador'::public.app_role))
);

grant delete on public.user_invites to authenticated;

commit;
