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

