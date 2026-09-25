import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthRange } from "@/lib/format";
import type { Occurrence, TableInsert, TableUpdate } from "./db";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export type OccurrenceWithRelations = Occurrence & {
  employees: { full_name: string; registration: string | null; department_id: string | null } | null;
  occurrence_types: { name: string; code: string; unit: string } | null;
};

const SELECT = `
  *,
  employees:employee_id (full_name, registration, department_id),
  occurrence_types:occurrence_type_id (name, code, unit)
`;

export const occurrencesQuery = (params: {
  year?: number;
  month?: number;
  employeeId?: string;
  departmentId?: string;
  typeCode?: string;
}) =>
  queryOptions({
    queryKey: ["occurrences", params],
    queryFn: async (): Promise<OccurrenceWithRelations[]> => {
      let query = supabase.from("occurrences").select(SELECT).order("occurrence_date", { ascending: false });
      if (params.year && params.month) {
        const { start, end } = monthRange(params.year, params.month);
        query = query.gte("occurrence_date", start).lte("occurrence_date", end);
      }
      if (params.employeeId) query = query.eq("employee_id", params.employeeId);
      let rows = unwrap(await query) as unknown as OccurrenceWithRelations[];
      if (params.departmentId) {
        rows = rows.filter((row) => row.employees?.department_id === params.departmentId);
      }
      if (params.typeCode) {
        rows = rows.filter((row) => row.occurrence_types?.code === params.typeCode);
      }
      return rows;
    },
  });

export async function createOccurrence(input: TableInsert<"occurrences">) {
  return unwrap(await supabase.from("occurrences").insert(input).select().single());
}

export async function updateOccurrence(id: string, input: TableUpdate<"occurrences">) {
  return unwrap(await supabase.from("occurrences").update(input).eq("id", id).select().single());
}

export async function deleteOccurrence(id: string) {
  const { error } = await supabase.from("occurrences").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
