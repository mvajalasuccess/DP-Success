import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthRange } from "@/lib/format";
import type { BankHoursEntry, OvertimeRecord, TableInsert } from "./db";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export type OvertimeWithEmployee = OvertimeRecord & {
  employees: {
    full_name: string;
    registration: string | null;
    department_id: string | null;
    position_id: string | null;
  } | null;
};

export const overtimeQuery = (params: {
  year: number;
  month: number;
  employeeId?: string;
  departmentId?: string;
  positionId?: string;
}) =>
  queryOptions({
    queryKey: ["overtime_records", params],
    queryFn: async (): Promise<OvertimeWithEmployee[]> => {
      const { start, end } = monthRange(params.year, params.month);
      let query = supabase
        .from("overtime_records")
        .select("*, employees:employee_id (full_name, registration, department_id, position_id)")
        .gte("reference_date", start)
        .lte("reference_date", end)
        .order("reference_date", { ascending: false });
      if (params.employeeId) query = query.eq("employee_id", params.employeeId);
      let rows = unwrap(await query) as unknown as OvertimeWithEmployee[];
      if (params.departmentId) rows = rows.filter((r) => r.employees?.department_id === params.departmentId);
      if (params.positionId) rows = rows.filter((r) => r.employees?.position_id === params.positionId);
      return rows;
    },
  });

export type BankHoursWithEmployee = BankHoursEntry & {
  employees: { full_name: string; registration: string | null; department_id: string | null } | null;
};

export const bankHoursQuery = (params: { employeeId?: string; departmentId?: string } = {}) =>
  queryOptions({
    queryKey: ["bank_hours", params],
    queryFn: async (): Promise<BankHoursWithEmployee[]> => {
      let query = supabase
        .from("bank_hours")
        .select("*, employees:employee_id (full_name, registration, department_id)")
        .order("entry_date", { ascending: false });
      if (params.employeeId) query = query.eq("employee_id", params.employeeId);
      let rows = unwrap(await query) as unknown as BankHoursWithEmployee[];
      if (params.departmentId) rows = rows.filter((r) => r.employees?.department_id === params.departmentId);
      return rows;
    },
  });

export async function createBankHoursEntry(input: TableInsert<"bank_hours">) {
  return unwrap(await supabase.from("bank_hours").insert(input).select().single());
}

export async function deleteBankHoursEntry(id: string) {
  const { error } = await supabase.from("bank_hours").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function createOvertimeRecord(input: TableInsert<"overtime_records">) {
  return unwrap(await supabase.from("overtime_records").insert(input).select().single());
}

export async function deleteOvertimeRecord(id: string) {
  const { error } = await supabase.from("overtime_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
