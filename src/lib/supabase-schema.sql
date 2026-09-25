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
