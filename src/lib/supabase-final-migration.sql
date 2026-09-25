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
