begin;

create table public.manual_time_cards (
  id uuid primary key default gen_random_uuid(),
  person_name text not null check (char_length(btrim(person_name)) between 1 and 140),
  kind text not null check (kind in ('freelancer', 'sold_vacation', 'other')),
  start_date date not null,
  end_date date not null,
  weekday_minutes integer[] not null default array[0, 0, 0, 0, 0, 0, 0],
  entries jsonb not null default '{}'::jsonb,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  check (end_date - start_date between 0 and 365),
  check (
    array_ndims(weekday_minutes) = 1 and array_lower(weekday_minutes, 1) = 1
    and cardinality(weekday_minutes) = 7 and array_position(weekday_minutes, null) is null
    and 0 <= all(weekday_minutes) and 1440 >= all(weekday_minutes)
  ),
  check (jsonb_typeof(entries) = 'object')
);

alter table public.manual_time_cards enable row level security;
revoke all on public.manual_time_cards from public, anon, authenticated;
grant select, insert, delete on public.manual_time_cards to authenticated;
grant update (weekday_minutes, entries, revision) on public.manual_time_cards to authenticated;

create policy manual_cards_select on public.manual_time_cards for select to authenticated
using ((select private.has_app_access(auth.uid())));
create policy manual_cards_insert on public.manual_time_cards for insert to authenticated
with check ((select private.can_manage(auth.uid())));
create policy manual_cards_update on public.manual_time_cards for update to authenticated
using ((select private.can_manage(auth.uid())))
with check ((select private.can_manage(auth.uid())));
create policy manual_cards_delete on public.manual_time_cards for delete to authenticated
using ((select private.can_manage(auth.uid())));

commit;
