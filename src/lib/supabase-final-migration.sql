-- DP Success / Supabase PostgreSQL
-- Estrutura base para execução no SQL Editor do Lovable.
create extension if not exists "pgcrypto";

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique,
  full_name text not null,
  department_id uuid references departments(id),
  position_id uuid references positions(id),
  admission_date date,
  termination_date date,
  active boolean not null default true,
  initial_bank_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists salary_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  salary numeric(12,2) not null check (salary >= 0),
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create table if not exists work_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  weekly_minutes integer,
  divisor numeric(8,2) not null default 220,
  created_at timestamptz not null default now()
);

create table if not exists competencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'ABERTA' check (status in ('ABERTA','EM_ANDAMENTO','FECHADA')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(start_date,end_date),
  check (end_date >= start_date)
);

create table if not exists point_launches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  competence_id uuid not null references competencies(id),
  launch_date date not null,
  type text not null check (type in ('HE_60','HE_NOTURNA','ADICIONAL_NOTURNO','DOMINGO_FERIADO','INTERJORNADA','CREDITO','DEBITO','COMPENSACAO','AJUSTE')),
  direction text not null check (direction in ('CREDITO','DEBITO')),
  minutes integer not null check (minutes > 0),
  rate_factor numeric(8,4) not null default 1,
  description text,
  source text,
  financial_value numeric(12,2),
  created_at timestamptz not null default now()
);

create table if not exists bank_movements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  competence_id uuid references competencies(id),
  launch_id uuid references point_launches(id),
  movement_date date not null,
  minutes integer not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists medical_certificates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  start_date date not null,
  end_date date not null,
  days integer,
  hours integer,
  cid text,
  notes text,
  attachment_path text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table if not exists occurrences (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  competence_id uuid references competencies(id),
  occurrence_date date not null,
  type text not null,
  minutes integer not null default 0,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists calculation_parameters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  rate_factor numeric(8,4) not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into calculation_parameters(code,label,rate_factor) values
('HE_60','Hora extra 60%',1.60),
('HE_NOTURNA','Hora extra noturna',1.80),
('ADICIONAL_NOTURNO','Adicional noturno 20%',0.20),
('DOMINGO_FERIADO','Domingo / feriado 100%',2.00),
('INTERJORNADA','Interjornada 50%',1.50)
on conflict (code) do nothing;

create index if not exists idx_point_launches_employee_competence on point_launches(employee_id,competence_id);
create index if not exists idx_bank_movements_employee_competence on bank_movements(employee_id,competence_id);
create index if not exists idx_certificates_employee_dates on medical_certificates(employee_id,start_date,end_date);
create index if not exists idx_occurrences_employee_competence on occurrences(employee_id,competence_id);


-- ============================================================
-- MIGRAÇÃO DE COMPATIBILIDADE / OPERAÇÃO REAL - DP SUCCESS
-- Execute este bloco no SQL Editor do Lovable depois que o app
-- estiver com o modelo final. É idempotente.
-- ============================================================

-- Compatibilidade com a tela de Funcionários
alter table employees add column if not exists active boolean;
update employees set active = case when status::text = 'ativo' then true else false end where active is null;
alter table employees alter column active set default true;
alter table employees alter column active set not null;
alter table employees add column if not exists initial_bank_minutes integer not null default 0;
alter table employees add column if not exists admission_date date;
update employees set admission_date = hire_date where admission_date is null and hire_date is not null;

-- Histórico salarial: o salário usado em um lançamento nunca depende
-- do salário atual do funcionário.
create table if not exists salary_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  salary numeric(12,2) not null check (salary >= 0),
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists idx_salary_history_employee_date
  on salary_history(employee_id, valid_from desc);

-- Competência de ponto: sempre fecha do dia 21 ao dia 20.
create table if not exists competencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'ABERTA'
    check (status in ('ABERTA','EM_ANDAMENTO','FECHADA')),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(start_date,end_date),
  check (end_date >= start_date)
);
create index if not exists idx_competencies_dates on competencies(start_date,end_date);

-- Lançamento operacional.
create table if not exists point_launches (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  competence_id uuid not null references competencies(id),
  launch_date date not null,
  type text not null check (type in (
    'HE_60','HE_NOTURNA','ADICIONAL_NOTURNO','DOMINGO_FERIADO',
    'INTERJORNADA','CREDITO','DEBITO','COMPENSACAO','AJUSTE'
  )),
  direction text not null check (direction in ('CREDITO','DEBITO')),
  minutes integer not null check (minutes > 0),
  rate_factor numeric(8,4) not null default 1,
  salary_snapshot numeric(12,2),
  divisor_snapshot numeric(8,2) not null default 220,
  hour_value_snapshot numeric(12,4),
  description text,
  source text,
  financial_value numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table point_launches add column if not exists salary_snapshot numeric(12,2);
alter table point_launches add column if not exists divisor_snapshot numeric(8,2) not null default 220;
alter table point_launches add column if not exists hour_value_snapshot numeric(12,4);
alter table point_launches add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_point_launches_employee_competence
  on point_launches(employee_id,competence_id);
create index if not exists idx_point_launches_date on point_launches(launch_date);

-- Movimentação do banco de horas. Minutos são assinados:
-- crédito positivo, débito negativo.
create table if not exists bank_movements (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  competence_id uuid references competencies(id),
  launch_id uuid references point_launches(id) on delete cascade,
  movement_date date not null,
  minutes integer not null,
  description text,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_bank_movements_launch
  on bank_movements(launch_id) where launch_id is not null;
create index if not exists idx_bank_movements_employee_competence
  on bank_movements(employee_id,competence_id);

-- Parâmetros de cálculo.
create table if not exists calculation_parameters (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  rate_factor numeric(8,4) not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into calculation_parameters(code,label,rate_factor) values
('HE_60','Hora extra 60%',1.60),
('HE_NOTURNA','Hora extra noturna',1.80),
('ADICIONAL_NOTURNO','Adicional noturno 20%',0.20),
('DOMINGO_FERIADO','Domingo / feriado 100%',2.00),
('INTERJORNADA','Interjornada 50%',1.50),
('CREDITO','Crédito / débito',1.00)
on conflict (code) do update
set label = excluded.label, rate_factor = excluded.rate_factor, updated_at = now();

-- Parâmetro de divisor padrão.
insert into work_schedules(name, weekly_minutes, divisor)
select 'Jornada padrão 220h', 2640, 220
where not exists (select 1 from work_schedules where name = 'Jornada padrão 220h');

-- Cria competência automaticamente pelo ciclo 21 -> 20.
create or replace function create_competence_for_date(p_date date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_id uuid;
begin
  if extract(day from p_date) >= 21 then
    v_start := make_date(extract(year from p_date)::int, extract(month from p_date)::int, 21);
    v_end := (v_start + interval '1 month')::date - 1;
  else
    v_end := make_date(extract(year from p_date)::int, extract(month from p_date)::int, 20);
    v_start := (v_end - interval '1 month')::date + 1;
  end if;

  insert into competencies(name,start_date,end_date,status)
  values (
    to_char(v_start,'DD/MM/YYYY') || ' → ' || to_char(v_end,'DD/MM/YYYY'),
    v_start,v_end,'EM_ANDAMENTO'
  )
  on conflict(start_date,end_date) do update set name = excluded.name
  returning id into v_id;

  if v_id is null then
    select id into v_id from competencies where start_date=v_start and end_date=v_end;
  end if;
  return v_id;
end;
$$;

-- Bloqueia lançamentos fora da competência e em competência fechada.
create or replace function validate_point_launch()
returns trigger
language plpgsql
as $$
declare
  v_status text;
  v_start date;
  v_end date;
begin
  select status,start_date,end_date into v_status,v_start,v_end
  from competencies where id = new.competence_id;

  if v_status is null then
    raise exception 'Competência não encontrada.';
  end if;
  if v_status = 'FECHADA' then
    raise exception 'Competência fechada: lançamento não permitido.';
  end if;
  if new.launch_date < v_start or new.launch_date > v_end then
    raise exception 'Data do lançamento fora da competência.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_point_launch on point_launches;
create trigger trg_validate_point_launch
before insert or update on point_launches
for each row execute function validate_point_launch();

-- Gera automaticamente a movimentação do banco ao inserir/alterar lançamento.
create or replace function sync_bank_movement_from_launch()
returns trigger
language plpgsql
as $$
begin
  insert into bank_movements(employee_id,competence_id,launch_id,movement_date,minutes,description)
  values (
    new.employee_id,new.competence_id,new.id,new.launch_date,
    case when new.direction='DEBITO' then -new.minutes else new.minutes end,
    coalesce(new.description,new.type)
  )
  on conflict (launch_id) do update set
    employee_id=excluded.employee_id,
    competence_id=excluded.competence_id,
    movement_date=excluded.movement_date,
    minutes=excluded.minutes,
    description=excluded.description;
  return new;
end;
$$;

drop trigger if exists trg_sync_bank_movement on point_launches;
create trigger trg_sync_bank_movement
after insert or update on point_launches
for each row execute function sync_bank_movement_from_launch();

-- Ao excluir lançamento, o movimento correspondente também sai.
create or replace function delete_bank_movement_from_launch()
returns trigger
language plpgsql
as $$
begin
  delete from bank_movements where launch_id = old.id;
  return old;
end;
$$;

drop trigger if exists trg_delete_bank_movement on point_launches;
create trigger trg_delete_bank_movement
before delete on point_launches
for each row execute function delete_bank_movement_from_launch();

-- Atualização automática de updated_at.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_competencies_updated_at on competencies;
create trigger trg_competencies_updated_at before update on competencies
for each row execute function set_updated_at();

drop trigger if exists trg_point_launches_updated_at on point_launches;
create trigger trg_point_launches_updated_at before update on point_launches
for each row execute function set_updated_at();

-- RLS básico para usuários autenticados. Regras de perfil mais granulares
-- podem ser adicionadas depois sem alterar o modelo de dados.
alter table competencies enable row level security;
alter table point_launches enable row level security;
alter table bank_movements enable row level security;
alter table salary_history enable row level security;
alter table calculation_parameters enable row level security;

drop policy if exists competencies_authenticated_all on competencies;
create policy competencies_authenticated_all on competencies
for all to authenticated using (true) with check (true);

drop policy if exists point_launches_authenticated_all on point_launches;
create policy point_launches_authenticated_all on point_launches
for all to authenticated using (true) with check (true);

drop policy if exists bank_movements_authenticated_all on bank_movements;
create policy bank_movements_authenticated_all on bank_movements
for all to authenticated using (true) with check (true);

drop policy if exists salary_history_authenticated_all on salary_history;
create policy salary_history_authenticated_all on salary_history
for all to authenticated using (true) with check (true);

drop policy if exists calculation_parameters_authenticated_all on calculation_parameters;
create policy calculation_parameters_authenticated_all on calculation_parameters
for all to authenticated using (true) with check (true);


-- Fechamento transacional da competência.
-- O saldo final de cada funcionário vira a abertura da próxima competência.
create table if not exists competence_employee_balances (
  id uuid primary key default gen_random_uuid(),
  competence_id uuid not null references competencies(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  opening_minutes integer not null default 0,
  credit_minutes integer not null default 0,
  debit_minutes integer not null default 0,
  closing_minutes integer not null default 0,
  estimated_value numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(competence_id,employee_id)
);
create index if not exists idx_competence_balances_competence on competence_employee_balances(competence_id);

create or replace function close_competence(p_competence_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_end date;
  v_next_start date;
  v_next_end date;
begin
  select status,end_date into v_status,v_end
  from competencies where id=p_competence_id for update;

  if v_status is null then raise exception 'Competência não encontrada.'; end if;
  if v_status='FECHADA' then return; end if;

  insert into competence_employee_balances(
    competence_id,employee_id,opening_minutes,credit_minutes,debit_minutes,closing_minutes,estimated_value
  )
  select
    p_competence_id,
    e.id,
    coalesce(prev.closing_minutes, e.current_bank_minutes, e.initial_bank_minutes, 0),
    coalesce(sum(case when bm.minutes>0 then bm.minutes else 0 end),0),
    coalesce(sum(case when bm.minutes<0 then abs(bm.minutes) else 0 end),0),
    coalesce(prev.closing_minutes, e.current_bank_minutes, e.initial_bank_minutes, 0) + coalesce(sum(bm.minutes),0),
    coalesce(sum(pl.financial_value),0)
  from employees e
  left join lateral (
    select b.closing_minutes
    from competence_employee_balances b
    join competencies pc on pc.id=b.competence_id
    where b.employee_id=e.id
      and pc.end_date < (select start_date from competencies where id=p_competence_id)
    order by pc.end_date desc
    limit 1
  ) prev on true
  left join bank_movements bm on bm.employee_id=e.id and bm.competence_id=p_competence_id
  left join point_launches pl on pl.id=bm.launch_id
  where e.active=true
  group by e.id, prev.closing_minutes, e.current_bank_minutes, e.initial_bank_minutes
  on conflict(competence_id,employee_id) do update set
    opening_minutes=excluded.opening_minutes,
    credit_minutes=excluded.credit_minutes,
    debit_minutes=excluded.debit_minutes,
    closing_minutes=excluded.closing_minutes,
    estimated_value=excluded.estimated_value,
    updated_at=now();

  update competencies
  set status='FECHADA',closed_at=now(),updated_at=now()
  where id=p_competence_id;

  v_next_start := v_end + 1;
  v_next_end := (v_next_start + interval '1 month')::date - 1;

  insert into competencies(name,start_date,end_date,status)
  values(
    to_char(v_next_start,'DD/MM/YYYY') || ' → ' || to_char(v_next_end,'DD/MM/YYYY'),
    v_next_start,v_next_end,'ABERTA'
  )
  on conflict(start_date,end_date) do nothing;

  -- current_bank_minutes é o saldo operacional atual.
  -- initial_bank_minutes permanece como histórico do saldo cadastrado inicialmente.
  update employees e
  set current_bank_minutes=b.closing_minutes, updated_at=now()
  from competence_employee_balances b
  where b.competence_id=p_competence_id and b.employee_id=e.id;
end;
$$;

alter table competence_employee_balances enable row level security;
drop policy if exists competence_employee_balances_authenticated_all on competence_employee_balances;
create policy competence_employee_balances_authenticated_all on competence_employee_balances
for all to authenticated using (true) with check (true);

drop trigger if exists trg_balance_updated_at on competence_employee_balances;
create trigger trg_balance_updated_at before update on competence_employee_balances
for each row execute function set_updated_at();


-- Cadastro de jornadas/escalas: jornada pode ser vinculada ao funcionário.
alter table work_schedules add column if not exists active boolean not null default true;
alter table employees add column if not exists work_schedule_id uuid references work_schedules(id);
create index if not exists idx_employees_work_schedule on employees(work_schedule_id);

-- RLS dos cadastros mestres.
alter table departments enable row level security;
alter table positions enable row level security;
alter table work_schedules enable row level security;
alter table employees enable row level security;

drop policy if exists departments_authenticated_all on departments;
create policy departments_authenticated_all on departments for all to authenticated using (true) with check (true);
drop policy if exists positions_authenticated_all on positions;
create policy positions_authenticated_all on positions for all to authenticated using (true) with check (true);
drop policy if exists work_schedules_authenticated_all on work_schedules;
create policy work_schedules_authenticated_all on work_schedules for all to authenticated using (true) with check (true);
drop policy if exists employees_authenticated_all on employees;
create policy employees_authenticated_all on employees for all to authenticated using (true) with check (true);


-- Histórico de saldo por competência: não sobrescrever o saldo inicial histórico do cadastro.
alter table employees add column if not exists current_bank_minutes integer not null default 0;
update employees set current_bank_minutes = coalesce(initial_bank_minutes,0) where current_bank_minutes = 0;
create index if not exists idx_competence_balances_employee on competence_employee_balances(employee_id, competence_id);

-- ============================================================
-- HARDENING FINAL - SALDO, CÁLCULO E SNAPSHOT
-- ============================================================

alter table employees add column if not exists current_bank_minutes integer not null default 0;
update employees
set current_bank_minutes = coalesce(initial_bank_minutes,0)
where current_bank_minutes = 0 and coalesce(initial_bank_minutes,0) <> 0;

alter table work_schedules add column if not exists divisor numeric(8,2) not null default 220;
create index if not exists idx_salary_history_employee_validity
  on salary_history(employee_id,valid_from,valid_to);

-- Evita sobreposição de vigências salariais para o mesmo funcionário.
create or replace function validate_salary_history()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from salary_history s
    where s.employee_id = new.employee_id
      and s.id <> coalesce(new.id, gen_random_uuid())
      and daterange(s.valid_from, coalesce(s.valid_to + 1, '9999-12-31'::date), '[)')
          && daterange(new.valid_from, coalesce(new.valid_to + 1, '9999-12-31'::date), '[)')
  ) then
    raise exception 'Existe outro histórico salarial vigente no mesmo período.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_salary_history on salary_history;
create trigger trg_validate_salary_history
before insert or update on salary_history
for each row execute function validate_salary_history();

-- Seleciona o salário vigente na data do lançamento e a jornada do funcionário.
-- O resultado é congelado no lançamento para preservar o histórico.
create or replace function snapshot_point_launch()
returns trigger
language plpgsql
as $$
declare
  v_salary numeric(12,2);
  v_divisor numeric(8,2);
  v_factor numeric(8,4);
begin
  select sh.salary
    into v_salary
  from salary_history sh
  where sh.employee_id = new.employee_id
    and sh.valid_from <= new.launch_date
    and (sh.valid_to is null or sh.valid_to >= new.launch_date)
  order by sh.valid_from desc
  limit 1;

  select coalesce(ws.divisor,220)
    into v_divisor
  from employees e
  left join work_schedules ws on ws.id=e.work_schedule_id
  where e.id=new.employee_id;

  select coalesce(
    (select cp.rate_factor from calculation_parameters cp where cp.code=new.type and cp.active=true limit 1),
    new.rate_factor,
    1
  ) into v_factor;

  new.rate_factor := v_factor;
  new.salary_snapshot := v_salary;
  new.divisor_snapshot := coalesce(v_divisor,220);

  if v_salary is not null and coalesce(new.divisor_snapshot,0) > 0 then
    new.hour_value_snapshot := round(v_salary / new.divisor_snapshot, 4);
    new.financial_value := round((new.minutes::numeric / 60) * new.hour_value_snapshot * new.rate_factor, 2);
  else
    new.hour_value_snapshot := null;
    new.financial_value := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_snapshot_point_launch on point_launches;
create trigger trg_snapshot_point_launch
before insert or update of employee_id,launch_date,type,direction,minutes,rate_factor on point_launches
for each row execute function snapshot_point_launch();

-- Garante saldo atual coerente para novos funcionários.
create or replace function initialize_employee_current_bank()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.current_bank_minutes,0) = 0 and coalesce(new.initial_bank_minutes,0) <> 0 then
    new.current_bank_minutes := new.initial_bank_minutes;
  elsif new.current_bank_minutes is null then
    new.current_bank_minutes := coalesce(new.initial_bank_minutes,0);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_initialize_employee_current_bank on employees;
create trigger trg_initialize_employee_current_bank
before insert on employees
for each row execute function initialize_employee_current_bank();



-- ============================================================
-- DADOS COMPLEMENTARES E PARAMETRIZAÇÃO DE ABSENTEÍSMO
-- ============================================================

alter table medical_certificates add column if not exists entry_date date;
alter table medical_certificates add column if not exists attachment_path text;
create index if not exists idx_medical_certificates_employee_dates
  on medical_certificates(employee_id,start_date,end_date);

insert into calculation_parameters(code,label,rate_factor) values
('ABS_FALTA','Absenteísmo: incluir faltas',1),
('ABS_ATRASO','Absenteísmo: incluir atrasos',1),
('ABS_SAIDA_ANTECIPADA','Absenteísmo: incluir saídas antecipadas',1),
('ABS_ATESTADO','Absenteísmo: incluir atestados',0)
on conflict(code) do nothing;

-- Auditoria mínima de operações sensíveis.
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type,entity_id,created_at desc);
alter table audit_logs enable row level security;
drop policy if exists audit_logs_authenticated_insert on audit_logs;
create policy audit_logs_authenticated_insert on audit_logs
for insert to authenticated with check (user_id = auth.uid());
drop policy if exists audit_logs_authenticated_select on audit_logs;
create policy audit_logs_authenticated_select on audit_logs
for select to authenticated using (true);

create or replace function log_competence_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is distinct from new.status and new.status='FECHADA' then
    insert into audit_logs(user_id,action,entity_type,entity_id,details)
    values(auth.uid(),'CLOSE','competence',new.id,jsonb_build_object('name',new.name,'closed_at',new.closed_at));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_competence_close on competencies;
create trigger trg_log_competence_close
after update on competencies
for each row execute function log_competence_close();


-- ============================================================
-- HARDENING DE SEGURANÇA - ACESSO POR USUÁRIO/ROLE
-- Corrige políticas amplas (USING/WITH CHECK true) e restringe
-- os dados do DP a usuários autorizados no próprio banco.
-- ============================================================

create schema if not exists private;

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'RH'
    check (role in ('ADMIN','RH','CONSULTA')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.app_users enable row level security;
revoke all on table public.app_users from anon, authenticated;

create or replace function private.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users au
    where au.user_id = (select auth.uid())
      and au.active = true
  );
$$;

create or replace function private.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users au
    where au.user_id = (select auth.uid())
      and au.active = true
      and (au.role = p_role or au.role = 'ADMIN')
  );
$$;

revoke all on function private.has_app_access() from public, anon;
revoke all on function private.has_role(text) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_app_access() to authenticated;
grant execute on function private.has_role(text) to authenticated;

-- Remove políticas amplas antigas e torna este bloco reaplicável.
drop policy if exists departments_authenticated_all on public.departments;
drop policy if exists positions_authenticated_all on public.positions;
drop policy if exists work_schedules_authenticated_all on public.work_schedules;
drop policy if exists employees_authenticated_all on public.employees;
drop policy if exists competencies_authenticated_all on public.competencies;
drop policy if exists point_launches_authenticated_all on public.point_launches;
drop policy if exists bank_movements_authenticated_all on public.bank_movements;
drop policy if exists salary_history_authenticated_all on public.salary_history;
drop policy if exists calculation_parameters_authenticated_all on public.calculation_parameters;
drop policy if exists competence_employee_balances_authenticated_all on public.competence_employee_balances;
drop policy if exists audit_logs_authenticated_select on public.audit_logs;
drop policy if exists audit_logs_authenticated_insert on public.audit_logs;

drop policy if exists departments_app_select on public.departments;
drop policy if exists departments_app_insert on public.departments;
drop policy if exists departments_app_update on public.departments;
drop policy if exists departments_app_delete on public.departments;
drop policy if exists positions_app_select on public.positions;
drop policy if exists positions_app_insert on public.positions;
drop policy if exists positions_app_update on public.positions;
drop policy if exists positions_app_delete on public.positions;
drop policy if exists work_schedules_app_select on public.work_schedules;
drop policy if exists work_schedules_app_insert on public.work_schedules;
drop policy if exists work_schedules_app_update on public.work_schedules;
drop policy if exists work_schedules_app_delete on public.work_schedules;
drop policy if exists employees_app_select on public.employees;
drop policy if exists employees_app_insert on public.employees;
drop policy if exists employees_app_update on public.employees;
drop policy if exists employees_app_delete on public.employees;
drop policy if exists salary_history_app_select on public.salary_history;
drop policy if exists salary_history_app_insert on public.salary_history;
drop policy if exists salary_history_app_update on public.salary_history;
drop policy if exists salary_history_app_delete on public.salary_history;
drop policy if exists competencies_app_select on public.competencies;
drop policy if exists competencies_app_insert on public.competencies;
drop policy if exists competencies_app_update on public.competencies;
drop policy if exists competencies_app_delete on public.competencies;
drop policy if exists point_launches_app_select on public.point_launches;
drop policy if exists point_launches_app_insert on public.point_launches;
drop policy if exists point_launches_app_update on public.point_launches;
drop policy if exists point_launches_app_delete on public.point_launches;
drop policy if exists bank_movements_app_select on public.bank_movements;
drop policy if exists bank_movements_app_insert on public.bank_movements;
drop policy if exists bank_movements_app_update on public.bank_movements;
drop policy if exists bank_movements_app_delete on public.bank_movements;
drop policy if exists occurrences_app_select on public.occurrences;
drop policy if exists occurrences_app_insert on public.occurrences;
drop policy if exists occurrences_app_update on public.occurrences;
drop policy if exists occurrences_app_delete on public.occurrences;
drop policy if exists competence_balances_app_select on public.competence_employee_balances;
drop policy if exists competence_balances_app_insert on public.competence_employee_balances;
drop policy if exists competence_balances_app_update on public.competence_employee_balances;
drop policy if exists competence_balances_app_delete on public.competence_employee_balances;
drop policy if exists calculation_parameters_app_select on public.calculation_parameters;
drop policy if exists calculation_parameters_app_insert on public.calculation_parameters;
drop policy if exists calculation_parameters_app_update on public.calculation_parameters;
drop policy if exists calculation_parameters_app_delete on public.calculation_parameters;
drop policy if exists medical_certificates_app_select on public.medical_certificates;
drop policy if exists medical_certificates_app_insert on public.medical_certificates;
drop policy if exists medical_certificates_app_update on public.medical_certificates;
drop policy if exists medical_certificates_app_delete on public.medical_certificates;
drop policy if exists audit_logs_admin_select on public.audit_logs;

revoke all on table
  public.departments,
  public.positions,
  public.work_schedules,
  public.employees,
  public.salary_history,
  public.competencies,
  public.point_launches,
  public.bank_movements,
  public.medical_certificates,
  public.occurrences,
  public.calculation_parameters,
  public.competence_employee_balances,
  public.audit_logs
from anon;

grant select, insert, update, delete on table
  public.departments,
  public.positions,
  public.work_schedules,
  public.employees,
  public.salary_history,
  public.competencies,
  public.point_launches,
  public.bank_movements,
  public.medical_certificates,
  public.occurrences,
  public.calculation_parameters,
  public.competence_employee_balances
to authenticated;

grant select on table public.audit_logs to authenticated;

alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.work_schedules enable row level security;
alter table public.employees enable row level security;
alter table public.salary_history enable row level security;
alter table public.competencies enable row level security;
alter table public.point_launches enable row level security;
alter table public.bank_movements enable row level security;
alter table public.medical_certificates enable row level security;
alter table public.occurrences enable row level security;
alter table public.calculation_parameters enable row level security;
alter table public.competence_employee_balances enable row level security;
alter table public.audit_logs enable row level security;

create policy departments_app_select on public.departments
for select to authenticated
using ((select private.has_app_access()));
create policy departments_app_insert on public.departments
for insert to authenticated
with check ((select private.has_role('RH')));
create policy departments_app_update on public.departments
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy departments_app_delete on public.departments
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy positions_app_select on public.positions
for select to authenticated
using ((select private.has_app_access()));
create policy positions_app_insert on public.positions
for insert to authenticated
with check ((select private.has_role('RH')));
create policy positions_app_update on public.positions
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy positions_app_delete on public.positions
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy work_schedules_app_select on public.work_schedules
for select to authenticated
using ((select private.has_app_access()));
create policy work_schedules_app_insert on public.work_schedules
for insert to authenticated
with check ((select private.has_role('RH')));
create policy work_schedules_app_update on public.work_schedules
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy work_schedules_app_delete on public.work_schedules
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy employees_app_select on public.employees
for select to authenticated
using ((select private.has_app_access()));
create policy employees_app_insert on public.employees
for insert to authenticated
with check ((select private.has_role('RH')));
create policy employees_app_update on public.employees
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy employees_app_delete on public.employees
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy salary_history_app_select on public.salary_history
for select to authenticated
using ((select private.has_app_access()));
create policy salary_history_app_insert on public.salary_history
for insert to authenticated
with check ((select private.has_role('RH')));
create policy salary_history_app_update on public.salary_history
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy salary_history_app_delete on public.salary_history
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy competencies_app_select on public.competencies
for select to authenticated
using ((select private.has_app_access()));
create policy competencies_app_insert on public.competencies
for insert to authenticated
with check ((select private.has_role('RH')));
create policy competencies_app_update on public.competencies
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy competencies_app_delete on public.competencies
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy point_launches_app_select on public.point_launches
for select to authenticated
using ((select private.has_app_access()));
create policy point_launches_app_insert on public.point_launches
for insert to authenticated
with check ((select private.has_role('RH')));
create policy point_launches_app_update on public.point_launches
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy point_launches_app_delete on public.point_launches
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy bank_movements_app_select on public.bank_movements
for select to authenticated
using ((select private.has_app_access()));
create policy bank_movements_app_insert on public.bank_movements
for insert to authenticated
with check ((select private.has_role('RH')));
create policy bank_movements_app_update on public.bank_movements
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy bank_movements_app_delete on public.bank_movements
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy occurrences_app_select on public.occurrences
for select to authenticated
using ((select private.has_app_access()));
create policy occurrences_app_insert on public.occurrences
for insert to authenticated
with check ((select private.has_role('RH')));
create policy occurrences_app_update on public.occurrences
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy occurrences_app_delete on public.occurrences
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy competence_balances_app_select on public.competence_employee_balances
for select to authenticated
using ((select private.has_app_access()));
create policy competence_balances_app_insert on public.competence_employee_balances
for insert to authenticated
with check ((select private.has_role('RH')));
create policy competence_balances_app_update on public.competence_employee_balances
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy competence_balances_app_delete on public.competence_employee_balances
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy calculation_parameters_app_select on public.calculation_parameters
for select to authenticated
using ((select private.has_app_access()));
create policy calculation_parameters_app_insert on public.calculation_parameters
for insert to authenticated
with check ((select private.has_role('RH')));
create policy calculation_parameters_app_update on public.calculation_parameters
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy calculation_parameters_app_delete on public.calculation_parameters
for delete to authenticated
using ((select private.has_role('ADMIN')));

-- Atestados: dado médico sensível, somente ADMIN/RH.
create policy medical_certificates_app_select on public.medical_certificates
for select to authenticated
using ((select private.has_role('RH')));
create policy medical_certificates_app_insert on public.medical_certificates
for insert to authenticated
with check ((select private.has_role('RH')));
create policy medical_certificates_app_update on public.medical_certificates
for update to authenticated
using ((select private.has_role('RH')))
with check ((select private.has_role('RH')));
create policy medical_certificates_app_delete on public.medical_certificates
for delete to authenticated
using ((select private.has_role('ADMIN')));

create policy audit_logs_admin_select on public.audit_logs
for select to authenticated
using ((select private.has_role('ADMIN')));

-- Funções SECURITY DEFINER só podem ser chamadas pela aplicação autenticada.
revoke execute on function public.create_competence_for_date(date) from public, anon, authenticated;
revoke execute on function public.close_competence(uuid) from public, anon, authenticated;
grant execute on function public.create_competence_for_date(date) to authenticated;
grant execute on function public.close_competence(uuid) to authenticated;

create or replace function public.create_competence_for_date(p_date date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_id uuid;
begin
  if not (select private.has_role('RH')) then
    raise exception 'Usuário sem permissão para criar competência.';
  end if;

  if extract(day from p_date) >= 21 then
    v_start := make_date(extract(year from p_date)::int, extract(month from p_date)::int, 21);
    v_end := (v_start + interval '1 month')::date - 1;
  else
    v_end := make_date(extract(year from p_date)::int, extract(month from p_date)::int, 20);
    v_start := (v_end - interval '1 month')::date + 1;
  end if;

  insert into public.competencies(name,start_date,end_date,status)
  values (
    to_char(v_start,'DD/MM/YYYY') || ' → ' || to_char(v_end,'DD/MM/YYYY'),
    v_start,v_end,'EM_ANDAMENTO'
  )
  on conflict(start_date,end_date) do update set name = excluded.name
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.competencies
    where start_date=v_start and end_date=v_end;
  end if;

  return v_id;
end;
$$;

create or replace function public.close_competence(p_competence_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_end date;
  v_next_start date;
  v_next_end date;
begin
  if not (select private.has_role('RH')) then
    raise exception 'Usuário sem permissão para fechar competência.';
  end if;

  select status,end_date into v_status,v_end
  from public.competencies
  where id=p_competence_id
  for update;

  if v_status is null then raise exception 'Competência não encontrada.'; end if;
  if v_status='FECHADA' then return; end if;

  insert into public.competence_employee_balances(
    competence_id,employee_id,opening_minutes,credit_minutes,debit_minutes,closing_minutes,estimated_value
  )
  select
    p_competence_id,
    e.id,
    coalesce(prev.closing_minutes, e.current_bank_minutes, e.initial_bank_minutes, 0),
    coalesce(sum(case when bm.minutes>0 then bm.minutes else 0 end),0),
    coalesce(sum(case when bm.minutes<0 then abs(bm.minutes) else 0 end),0),
    coalesce(prev.closing_minutes, e.current_bank_minutes, e.initial_bank_minutes, 0) + coalesce(sum(bm.minutes),0),
    coalesce(sum(pl.financial_value),0)
  from public.employees e
  left join lateral (
    select b.closing_minutes
    from public.competence_employee_balances b
    join public.competencies pc on pc.id=b.competence_id
    where b.employee_id=e.id
      and pc.end_date < (select start_date from public.competencies where id=p_competence_id)
    order by pc.end_date desc
    limit 1
  ) prev on true
  left join public.bank_movements bm
    on bm.employee_id=e.id and bm.competence_id=p_competence_id
  left join public.point_launches pl on pl.id=bm.launch_id
  where e.active=true
  group by e.id, prev.closing_minutes, e.current_bank_minutes, e.initial_bank_minutes
  on conflict(competence_id,employee_id) do update set
    opening_minutes=excluded.opening_minutes,
    credit_minutes=excluded.credit_minutes,
    debit_minutes=excluded.debit_minutes,
    closing_minutes=excluded.closing_minutes,
    estimated_value=excluded.estimated_value,
    updated_at=now();

  update public.competencies
  set status='FECHADA',closed_at=now(),updated_at=now()
  where id=p_competence_id;

  v_next_start := v_end + 1;
  v_next_end := (v_next_start + interval '1 month')::date - 1;

  insert into public.competencies(name,start_date,end_date,status)
  values(
    to_char(v_next_start,'DD/MM/YYYY') || ' → ' || to_char(v_next_end,'DD/MM/YYYY'),
    v_next_start,v_next_end,'ABERTA'
  )
  on conflict(start_date,end_date) do nothing;

  update public.employees e
  set current_bank_minutes=b.closing_minutes, updated_at=now()
  from public.competence_employee_balances b
  where b.competence_id=p_competence_id and b.employee_id=e.id;
end;
$$;

-- Funções usadas exclusivamente por triggers não devem ser expostas via API.
revoke execute on function public.validate_point_launch() from public, anon, authenticated;
revoke execute on function public.sync_bank_movement_from_launch() from public, anon, authenticated;
revoke execute on function public.delete_bank_movement_from_launch() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.validate_salary_history() from public, anon, authenticated;
revoke execute on function public.snapshot_point_launch() from public, anon, authenticated;
revoke execute on function public.initialize_employee_current_bank() from public, anon, authenticated;
revoke execute on function public.log_competence_close() from public, anon, authenticated;
