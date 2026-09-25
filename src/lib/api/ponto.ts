import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthRange } from "@/lib/format";
import type { TableInsert, TableUpdate, TimeAdjustment, TimeRecord } from "./db";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export type TimeRecordWithEmployee = TimeRecord & {
  employees: { full_name: string; registration: string | null; department_id: string | null } | null;
};

export const timeRecordsQuery = (params: {
  year: number;
  month: number;
  employeeId?: string;
  departmentId?: string;
}) =>
  queryOptions({
    queryKey: ["time_records", params],
    queryFn: async (): Promise<TimeRecordWithEmployee[]> => {
      const { start, end } = monthRange(params.year, params.month);
      let query = supabase
        .from("time_records")
        .select("*, employees:employee_id (full_name, registration, department_id)")
        .gte("work_date", start)
        .lte("work_date", end)
        .order("work_date");
      if (params.employeeId) query = query.eq("employee_id", params.employeeId);
      const rows = unwrap(await query) as unknown as TimeRecordWithEmployee[];
      if (params.departmentId) {
        return rows.filter((row) => row.employees?.department_id === params.departmentId);
      }
      return rows;
    },
  });

export const timeAdjustmentsQuery = (employeeId: string) =>
  queryOptions({
    queryKey: ["time_adjustments", employeeId],
    queryFn: async (): Promise<TimeAdjustment[]> =>
      unwrap(
        await supabase
          .from("time_adjustments")
          .select("*")
          .eq("employee_id", employeeId)
          .order("created_at", { ascending: false }),
      ),
  });

export async function upsertTimeRecord(input: TableInsert<"time_records">) {
  return unwrap(
    await supabase.from("time_records").upsert(input, { onConflict: "employee_id,work_date" }).select().single(),
  );
}

export async function updateTimeRecord(id: string, input: TableUpdate<"time_records">) {
  return unwrap(await supabase.from("time_records").update(input).eq("id", id).select().single());
}

export async function registerAdjustment(input: TableInsert<"time_adjustments">) {
  return unwrap(await supabase.from("time_adjustments").insert(input).select().single());
}

export async function deleteTimeRecord(id: string) {
  const { error } = await supabase.from("time_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
