-- Histórico independente; não altera competências, pagamentos ou lançamentos.
create table if not exists public.employee_career_history (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id) on delete restrict,
 effective_date date not null,
 movement_type text not null check (movement_type in ('admissao','promocao','reajuste','dissidio','cargo','departamento','merito','outro')),
 previous_salary numeric(14,2) check (previous_salary >= 0),
 new_salary numeric(14,2) check (new_salary >= 0),
 previous_position_id uuid references public.positions(id) on delete restrict,
 new_position_id uuid references public.positions(id) on delete restrict,
 previous_department_id uuid references public.departments(id) on delete restrict,
 new_department_id uuid references public.departments(id) on delete restrict,
 notes text,
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid(),
 applied_at timestamptz
);
create index if not exists employee_career_history_employee_date_idx on public.employee_career_history(employee_id,effective_date,created_at);
alter table public.employee_career_history enable row level security;
revoke all on public.employee_career_history from public, anon, authenticated;
grant select,insert,update,delete on public.employee_career_history to authenticated;
drop policy if exists career_manage on public.employee_career_history;
create policy career_manage on public.employee_career_history for all to authenticated using (private.can_manage((select auth.uid()))) with check (private.can_manage((select auth.uid())));
-- Opt-in application: atomic, optimistic comparison and explicit effective-date validation.
-- Does not apply older entries over newer applied entries.
create or replace function public.apply_career_movement(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare m public.employee_career_history%rowtype; e public.employees%rowtype;
begin
 if not private.can_manage((select auth.uid())) then raise exception 'Acesso restrito'; end if;
 select * into m from public.employee_career_history where id=p_id for update;
 if not found or m.applied_at is not null then raise exception 'Registro indisponível ou já aplicado'; end if;
 if m.effective_date > (now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data de vigência futura'; end if;
 if m.movement_type='admissao' then raise exception 'Admissão histórica não altera cadastro'; end if;
 select * into e from public.employees where id=m.employee_id for update;
 if not found or e.status::text <> 'ativo' then raise exception 'Funcionário não está ativo'; end if;
 if exists(select 1 from public.employee_career_history h where h.employee_id=m.employee_id and h.applied_at is not null and h.effective_date>=m.effective_date and h.id<>m.id) then raise exception 'Já existe movimentação aplicada nesta data ou posterior'; end if;
 if (m.new_salary is not null and e.salary is distinct from m.previous_salary) or (m.new_position_id is not null and e.position_id is distinct from m.previous_position_id) or (m.new_department_id is not null and e.department_id is distinct from m.previous_department_id) then raise exception 'Cadastro atual diverge do valor anterior; revise a movimentação'; end if;
 update public.employees set salary=coalesce(m.new_salary,salary),position_id=coalesce(m.new_position_id,position_id),department_id=coalesce(m.new_department_id,department_id) where id=m.employee_id;
 if not found then raise exception 'Cadastro não atualizado'; end if;
 update public.employee_career_history set applied_at=now() where id=p_id;
end $$;
revoke all on function public.apply_career_movement(uuid) from public,anon;
grant execute on function public.apply_career_movement(uuid) to authenticated;
