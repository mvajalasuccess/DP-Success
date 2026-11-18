-- Independent organizational records: no payroll/timekeeping changes.
create table if not exists public.employee_asset_access (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id) on delete restrict,
 kind text not null check (kind in ('company_key','box_key','uniform','phone','sim','notebook','door','alarm','other')),
 item_name text not null check (length(trim(item_name))>0),
 quantity integer not null default 1 check(quantity>0),
 identifier text,
 status text not null default 'pending' check(status in ('pending','delivered','not_applicable','returned')),
 delivered_on date,
 returned_on date,
 notes text,
 created_at timestamptz not null default now(),
 created_by uuid default auth.uid(),
 check(status not in ('delivered','returned') or delivered_on is not null),
 check(status <> 'returned' or (returned_on is not null and returned_on>=delivered_on))
);
create index if not exists employee_asset_access_employee_idx on public.employee_asset_access(employee_id,status);
alter table public.employee_asset_access enable row level security;
revoke all on public.employee_asset_access from public,anon,authenticated;
grant select,insert,update,delete on public.employee_asset_access to authenticated;
drop policy if exists asset_access_manage on public.employee_asset_access;
create policy asset_access_manage on public.employee_asset_access for all to authenticated
 using (private.can_manage((select auth.uid())))
 with check (private.can_manage((select auth.uid())));
