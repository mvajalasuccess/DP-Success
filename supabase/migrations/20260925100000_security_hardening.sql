-- ============================================================
-- DP SUCCESS - HARDENING DO BANCO ATUAL
-- Corrige as políticas amplas criadas na migration inicial.
-- Não altera dados nem exige mudança no frontend.
-- ============================================================

-- Funções de autorização: search_path fixo para evitar resolução
-- de objetos controlada pelo chamador.
create or replace function public.has_role(
  _user_id uuid,
  _role public.app_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  );
$$;

create or replace function public.can_manage(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role in ('administrador'::public.app_role, 'rh'::public.app_role)
  );
$$;

create or replace function public.current_roles()
returns setof public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.user_roles
  where user_id = (select auth.uid());
$$;

create or replace function public.has_app_access(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
  );
$;

revoke execute on function public.has_app_access(uuid) from public, anon;
grant execute on function public.has_app_access(uuid) to authenticated;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
revoke execute on function public.can_manage(uuid) from public, anon;
revoke execute on function public.current_roles() from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.can_manage(uuid) to authenticated;
grant execute on function public.current_roles() to authenticated;

-- Remove políticas permissivas anteriores.
drop policy if exists departments_select on public.departments;
drop policy if exists departments_insert on public.departments;
drop policy if exists departments_update on public.departments;
drop policy if exists departments_delete on public.departments;
drop policy if exists positions_select on public.positions;
drop policy if exists positions_insert on public.positions;
drop policy if exists positions_update on public.positions;
drop policy if exists positions_delete on public.positions;
drop policy if exists work_schedules_select on public.work_schedules;
drop policy if exists work_schedules_insert on public.work_schedules;
drop policy if exists work_schedules_update on public.work_schedules;
drop policy if exists work_schedules_delete on public.work_schedules;
drop policy if exists holidays_select on public.holidays;
drop policy if exists holidays_insert on public.holidays;
drop policy if exists holidays_update on public.holidays;
drop policy if exists holidays_delete on public.holidays;
drop policy if exists occurrence_types_select on public.occurrence_types;
drop policy if exists occurrence_types_insert on public.occurrence_types;
drop policy if exists occurrence_types_update on public.occurrence_types;
drop policy if exists occurrence_types_delete on public.occurrence_types;
drop policy if exists employees_select on public.employees;
drop policy if exists employees_insert on public.employees;
drop policy if exists employees_update on public.employees;
drop policy if exists employees_delete on public.employees;
drop policy if exists time_periods_select on public.time_periods;
drop policy if exists time_periods_insert on public.time_periods;
drop policy if exists time_periods_update on public.time_periods;
drop policy if exists time_periods_delete on public.time_periods;
drop policy if exists time_records_select on public.time_records;
drop policy if exists time_records_insert on public.time_records;
drop policy if exists time_records_update on public.time_records;
drop policy if exists time_records_delete on public.time_records;
drop policy if exists time_adjustments_select on public.time_adjustments;
drop policy if exists time_adjustments_insert on public.time_adjustments;
drop policy if exists time_adjustments_update on public.time_adjustments;
drop policy if exists time_adjustments_delete on public.time_adjustments;
drop policy if exists overtime_records_select on public.overtime_records;
drop policy if exists overtime_records_insert on public.overtime_records;
drop policy if exists overtime_records_update on public.overtime_records;
drop policy if exists overtime_records_delete on public.overtime_records;
drop policy if exists bank_hours_select on public.bank_hours;
drop policy if exists bank_hours_insert on public.bank_hours;
drop policy if exists bank_hours_update on public.bank_hours;
drop policy if exists bank_hours_delete on public.bank_hours;
drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists attachments_update on public.attachments;
drop policy if exists attachments_delete on public.attachments;
drop policy if exists occurrences_select on public.occurrences;
drop policy if exists occurrences_insert on public.occurrences;
drop policy if exists occurrences_update on public.occurrences;
drop policy if exists occurrences_delete on public.occurrences;
drop policy if exists audit_logs_select on public.audit_logs;
drop policy if exists audit_logs_insert on public.audit_logs;
drop policy if exists audit_logs_update on public.audit_logs;
drop policy if exists audit_logs_delete on public.audit_logs;
drop policy if exists app_settings_select on public.app_settings;
drop policy if exists app_settings_insert on public.app_settings;
drop policy if exists app_settings_update on public.app_settings;
drop policy if exists app_settings_delete on public.app_settings;
drop policy if exists medical_certificates_select on public.medical_certificates;
drop policy if exists medical_certificates_insert on public.medical_certificates;
drop policy if exists medical_certificates_update on public.medical_certificates;
drop policy if exists medical_certificates_delete on public.medical_certificates;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists user_roles_select on public.user_roles;
drop policy if exists user_roles_admin_all on public.user_roles;
drop policy if exists medical_certificates_select on public.medical_certificates;
drop policy if exists medical_certificates_insert on public.medical_certificates;
drop policy if exists medical_certificates_update on public.medical_certificates;
drop policy if exists medical_certificates_delete on public.medical_certificates;

-- Nunca permitir acesso pelo anon às tabelas de negócio.
revoke all on table
  public.profiles,
  public.user_roles,
  public.departments,
  public.positions,
  public.work_schedules,
  public.holidays,
  public.occurrence_types,
  public.employees,
  public.time_periods,
  public.time_records,
  public.time_adjustments,
  public.overtime_records,
  public.bank_hours,
  public.attachments,
  public.occurrences,
  public.medical_certificates,
  public.audit_logs,
  public.app_settings
from anon;

grant select, insert, update on public.profiles to authenticated;
grant select on public.user_roles to authenticated;

grant select, insert, update, delete on
  public.departments,
  public.positions,
  public.work_schedules,
  public.holidays,
  public.occurrence_types,
  public.employees,
  public.time_periods,
  public.time_records,
  public.time_adjustments,
  public.overtime_records,
  public.bank_hours,
  public.attachments,
  public.occurrences,
  public.app_settings
to authenticated;

grant select, insert, update, delete on public.audit_logs to authenticated;

-- Atestados: o CID é protegido também por privilégio de coluna.
revoke all on table public.medical_certificates from anon, authenticated;
grant select, insert, update, delete on public.medical_certificates to authenticated;

-- RLS.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.departments enable row level security;
alter table public.positions enable row level security;
alter table public.work_schedules enable row level security;
alter table public.holidays enable row level security;
alter table public.occurrence_types enable row level security;
alter table public.employees enable row level security;
alter table public.time_periods enable row level security;
alter table public.time_records enable row level security;
alter table public.time_adjustments enable row level security;
alter table public.overtime_records enable row level security;
alter table public.bank_hours enable row level security;
alter table public.attachments enable row level security;
alter table public.occurrences enable row level security;
alter table public.medical_certificates enable row level security;
alter table public.audit_logs enable row level security;
alter table public.app_settings enable row level security;

-- Perfil: cada usuário lê/altera apenas o próprio perfil.
create policy profiles_select on public.profiles
for select to authenticated
using ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
for insert to authenticated
with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Papéis: usuário vê o próprio papel; administrador vê todos.
create policy user_roles_select on public.user_roles
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.has_role((select auth.uid()), 'administrador'::public.app_role))
);

create policy user_roles_admin_all on public.user_roles
for all to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)))
with check ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

-- Cadastros: todos os usuários autenticados podem consultar;
-- somente RH/administrador alteram; somente administrador exclui.
create policy departments_select on public.departments
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy departments_insert on public.departments
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy departments_update on public.departments
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy departments_delete on public.departments
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy positions_select on public.positions
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy positions_insert on public.positions
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy positions_update on public.positions
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy positions_delete on public.positions
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy work_schedules_select on public.work_schedules
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy work_schedules_insert on public.work_schedules
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy work_schedules_update on public.work_schedules
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy work_schedules_delete on public.work_schedules
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy holidays_select on public.holidays
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy holidays_insert on public.holidays
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy holidays_update on public.holidays
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy holidays_delete on public.holidays
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy occurrence_types_select on public.occurrence_types
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy occurrence_types_insert on public.occurrence_types
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy occurrence_types_update on public.occurrence_types
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy occurrence_types_delete on public.occurrence_types
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

-- Funcionários e dados operacionais.
create policy employees_select on public.employees
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy employees_insert on public.employees
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy employees_update on public.employees
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy employees_delete on public.employees
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy time_periods_select on public.time_periods
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy time_periods_insert on public.time_periods
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy time_periods_update on public.time_periods
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy time_periods_delete on public.time_periods
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy time_records_select on public.time_records
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy time_records_insert on public.time_records
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy time_records_update on public.time_records
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy time_records_delete on public.time_records
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy time_adjustments_select on public.time_adjustments
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy time_adjustments_insert on public.time_adjustments
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy time_adjustments_update on public.time_adjustments
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy time_adjustments_delete on public.time_adjustments
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy overtime_records_select on public.overtime_records
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy overtime_records_insert on public.overtime_records
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy overtime_records_update on public.overtime_records
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy overtime_records_delete on public.overtime_records
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy bank_hours_select on public.bank_hours
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy bank_hours_insert on public.bank_hours
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy bank_hours_update on public.bank_hours
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy bank_hours_delete on public.bank_hours
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy occurrences_select on public.occurrences
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy occurrences_insert on public.occurrences
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy occurrences_update on public.occurrences
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy occurrences_delete on public.occurrences
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

-- Anexos: somente usuários que podem operar o DP podem manipular arquivos.
create policy attachments_select on public.attachments
for select to authenticated using ((select public.can_manage((select auth.uid()))));
create policy attachments_insert on public.attachments
for insert to authenticated
with check (
  (select public.can_manage((select auth.uid())))
  and (uploaded_by is null or uploaded_by = (select auth.uid()))
);
create policy attachments_update on public.attachments
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy attachments_delete on public.attachments
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

-- Atestados: somente Administrador/RH podem acessar o registro que contém CID.
create policy medical_certificates_select on public.medical_certificates
for select to authenticated
using ((select public.can_manage((select auth.uid()))));
create policy medical_certificates_insert on public.medical_certificates
for insert to authenticated
with check ((select public.can_manage((select auth.uid()))));
create policy medical_certificates_update on public.medical_certificates
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy medical_certificates_delete on public.medical_certificates
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

-- Auditoria: somente administrador consulta. Usuários podem registrar
-- somente a própria identidade; o restante do acesso é feito pelo banco.
create policy audit_logs_select on public.audit_logs
for select to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy audit_logs_insert on public.audit_logs
for insert to authenticated
with check (user_id = (select auth.uid()));

create policy audit_logs_update on public.audit_logs
for update to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)))
with check ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

create policy audit_logs_delete on public.audit_logs
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

-- Configurações: leitura para autenticados; alteração para RH/administrador.
create policy app_settings_select on public.app_settings
for select to authenticated using ((select public.has_app_access((select auth.uid()))));
create policy app_settings_insert on public.app_settings
for insert to authenticated with check ((select public.can_manage((select auth.uid()))));
create policy app_settings_update on public.app_settings
for update to authenticated
using ((select public.can_manage((select auth.uid()))))
with check ((select public.can_manage((select auth.uid()))));
create policy app_settings_delete on public.app_settings
for delete to authenticated
using ((select public.has_role((select auth.uid()), 'administrador'::public.app_role)));

-- Índices usados pelas políticas.
create index if not exists user_roles_user_id_idx on public.user_roles(user_id);
create index if not exists attachments_uploaded_by_idx on public.attachments(uploaded_by);
create index if not exists audit_logs_user_id_idx on public.audit_logs(user_id);
