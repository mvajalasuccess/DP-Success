begin;

grant update (person_name, kind, start_date, end_date)
on public.manual_time_cards to authenticated;

create or replace function private.check_manual_time_card_period()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from jsonb_object_keys(old.entries) as saved(day_key)
    where saved.day_key::date not between new.start_date and new.end_date
  ) then
    raise check_violation using message = 'O período precisa incluir todos os dias que já têm registros.';
  end if;
  return new;
end;
$$;

revoke all on function private.check_manual_time_card_period() from public, anon, authenticated;

drop trigger if exists manual_time_card_period_guard on public.manual_time_cards;
create trigger manual_time_card_period_guard
before update of start_date, end_date on public.manual_time_cards
for each row
when (old.start_date is distinct from new.start_date or old.end_date is distinct from new.end_date)
execute function private.check_manual_time_card_period();

commit;
