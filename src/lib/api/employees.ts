import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Employee, EmployeeStatus, TableInsert, TableUpdate, WorkSchedule } from "./db";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export type EmployeeWithRelations = Employee & {
  departments: { name: string } | null;
  positions: { name: string } | null;
  work_schedules: Pick<
    WorkSchedule,
    "name" | "daily_minutes" | "weekly_minutes" | "entry_time" | "break_start" | "break_end" | "exit_time" | "schedule_type"
  > | null;
  manager: { full_name: string } | null;
};

const SELECT_WITH_RELATIONS = `
  *,
  departments:department_id (name),
  positions:position_id (name),
  work_schedules:work_schedule_id (name, daily_minutes, weekly_minutes, entry_time, break_start, break_end, exit_time, schedule_type),
  manager:manager_id (full_name)
`;

export type EmployeeFilters = {
  search?: string;
  departmentId?: string;
  positionId?: string;
  status?: EmployeeStatus | "todos";
};

export const employeesQuery = (filters: EmployeeFilters = {}) =>
  queryOptions({
    queryKey: ["employees", filters],
    queryFn: async (): Promise<EmployeeWithRelations[]> => {
      let query = supabase.from("employees").select(SELECT_WITH_RELATIONS).order("full_name");
      if (filters.search) {
        query = query.or(
          `full_name.ilike.%${filters.search}%,registration.ilike.%${filters.search}%,cpf.ilike.%${filters.search}%`,
        );
      }
      if (filters.departmentId) query = query.eq("department_id", filters.departmentId);
      if (filters.positionId) query = query.eq("position_id", filters.positionId);
      if (filters.status && filters.status !== "todos") query = query.eq("status", filters.status);
      return unwrap(await query) as unknown as EmployeeWithRelations[];
    },
  });

export const employeeQuery = (id: string) =>
  queryOptions({
    queryKey: ["employee", id],
    queryFn: async (): Promise<EmployeeWithRelations> =>
      unwrap(
        await supabase.from("employees").select(SELECT_WITH_RELATIONS).eq("id", id).single(),
      ) as unknown as EmployeeWithRelations,
  });

export const employeeOptionsQuery = () =>
  queryOptions({
    queryKey: ["employee-options"],
    queryFn: async () =>
      unwrap(
        await supabase
          .from("employees")
          .select("id, full_name, registration, department_id, position_id, status, work_schedule_id")
          .order("full_name"),
      ),
  });

export async function createEmployee(input: TableInsert<"employees">) {
  return unwrap(await supabase.from("employees").insert(input).select().single());
}

export async function updateEmployee(id: string, input: TableUpdate<"employees">) {
  return unwrap(await supabase.from("employees").update(input).eq("id", id).select().single());
}

export async function deleteEmployee(id: string) {
  const { error } = await supabase.from("employees").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
