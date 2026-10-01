create table if not exists public.company_settings (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default '',
  trade_name text not null default '',
  cnpj text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  logo_url text,
  primary_color text,
  updated_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  setting_group text not null,
  setting_key text not null unique,
  setting_value text not null default '',
  label text not null default '',
  description text,
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists role text not null default 'rh';
alter table public.profiles add column if not exists active boolean not null default true;

insert into public.company_settings (company_name)
select '' where not exists (select 1 from public.company_settings);

insert into public.system_settings (setting_group,setting_key,setting_value,label,description) values
('ponto','daily_minutes','528','Jornada diária padrão','Minutos previstos por dia quando não houver jornada específica.'),
('ponto','weekly_minutes','2640','Jornada semanal padrão','Minutos previstos por semana quando não houver jornada específica.'),
('ponto','closing_day','20','Dia de fechamento do ponto','A competência termina neste dia.'),
('ponto','competence_start_day','21','Dia inicial da competência','A competência seguinte começa neste dia.'),
('ponto','late_tolerance_minutes','0','Tolerância de atraso','Minutos de tolerância antes de considerar atraso.'),
('ponto','overtime_tolerance_minutes','0','Tolerância de hora extra','Minutos de tolerância antes de considerar hora extra.'),
('he','he_60_rate','60','HE 60%','Percentual da hora extra.'),
('he','he_60_night_rate','80','HE 60% + 20% noturno','Percentual combinado.'),
('he','he_100_rate','100','HE 100%','Percentual da hora extra.'),
('he','he_100_night_rate','120','HE 100% + 20% noturno','Percentual combinado.'),
('he','night_rate','20','Adicional noturno','Percentual do adicional noturno.'),
('he','he_60_night_balance_from','2026-08-20','HE 60%+20% entra no saldo a partir de','Data final da primeira competência em que entra no Banco de Horas.'),
('kpi','absenteeism_formula','faltas+debitos+abonos','Fórmula do absenteísmo','Atestados e declarações ficam fora do absenteísmo.'),
('kpi','include_certificates','false','Considerar atestados no absenteísmo','Se ativado, soma atestados às horas perdidas.'),
('kpi','include_declarations','false','Considerar declarações no absenteísmo','Se ativado, soma declarações às horas perdidas.'),
('kpi','include_allowances','true','Considerar abonos no absenteísmo','Inclui abonos na fórmula do indicador.'),
('kpi','include_debits','true','Considerar débitos no absenteísmo','Inclui débitos na fórmula do indicador.')
on conflict (setting_key) do nothing;

alter table public.company_settings enable row level security;
alter table public.system_settings enable row level security;

drop policy if exists company_settings_select on public.company_settings;
drop policy if exists company_settings_write on public.company_settings;
create policy company_settings_select on public.company_settings for select to authenticated using (true);
create policy company_settings_write on public.company_settings for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid())) with check (exists(select 1 from public.profiles p where p.id=auth.uid()));

drop policy if exists system_settings_select on public.system_settings;
drop policy if exists system_settings_write on public.system_settings;
create policy system_settings_select on public.system_settings for select to authenticated using (true);
create policy system_settings_write on public.system_settings for all to authenticated using (exists(select 1 from public.profiles p where p.id=auth.uid())) with check (exists(select 1 from public.profiles p where p.id=auth.uid()));
