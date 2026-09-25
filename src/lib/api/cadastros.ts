import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AppSetting,
  Department,
  Holiday,
  OccurrenceType,
  Position,
  TableInsert,
  TableUpdate,
  WorkSchedule,
} from "./db";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export const departmentsQuery = () =>
  queryOptions({
    queryKey: ["departments"],
    queryFn: async (): Promise<Department[]> =>
      unwrap(await supabase.from("departments").select("*").order("name")),
  });

export const positionsQuery = () =>
  queryOptions({
    queryKey: ["positions"],
    queryFn: async (): Promise<Position[]> =>
      unwrap(await supabase.from("positions").select("*").order("name")),
  });

export const workSchedulesQuery = () =>
  queryOptions({
    queryKey: ["work_schedules"],
    queryFn: async (): Promise<WorkSchedule[]> =>
      unwrap(await supabase.from("work_schedules").select("*").order("name")),
  });

export const holidaysQuery = () =>
  queryOptions({
    queryKey: ["holidays"],
    queryFn: async (): Promise<Holiday[]> =>
      unwrap(await supabase.from("holidays").select("*").order("holiday_date")),
  });

export const occurrenceTypesQuery = () =>
  queryOptions({
    queryKey: ["occurrence_types"],
    queryFn: async (): Promise<OccurrenceType[]> =>
      unwrap(await supabase.from("occurrence_types").select("*").order("name")),
  });

export const settingsQuery = () =>
  queryOptions({
    queryKey: ["app_settings"],
    queryFn: async (): Promise<AppSetting[]> =>
      unwrap(await supabase.from("app_settings").select("*").order("key")),
  });

export async function saveDepartment(input: TableInsert<"departments"> & { id?: string }) {
  if (input.id) {
    const { id, ...rest } = input;
    return unwrap(
      await supabase.from("departments").update(rest as TableUpdate<"departments">).eq("id", id).select().single(),
    );
  }
  return unwrap(await supabase.from("departments").insert(input).select().single());
}

export async function savePosition(input: TableInsert<"positions"> & { id?: string }) {
  if (input.id) {
    const { id, ...rest } = input;
    return unwrap(
      await supabase.from("positions").update(rest as TableUpdate<"positions">).eq("id", id).select().single(),
    );
  }
  return unwrap(await supabase.from("positions").insert(input).select().single());
}

export async function saveWorkSchedule(input: TableInsert<"work_schedules"> & { id?: string }) {
  if (input.id) {
    const { id, ...rest } = input;
    return unwrap(
      await supabase
        .from("work_schedules")
        .update(rest as TableUpdate<"work_schedules">)
        .eq("id", id)
        .select()
        .single(),
    );
  }
  return unwrap(await supabase.from("work_schedules").insert(input).select().single());
}

export async function saveHoliday(input: TableInsert<"holidays"> & { id?: string }) {
  if (input.id) {
    const { id, ...rest } = input;
    return unwrap(
      await supabase.from("holidays").update(rest as TableUpdate<"holidays">).eq("id", id).select().single(),
    );
  }
  return unwrap(await supabase.from("holidays").insert(input).select().single());
}

export async function deleteRecord(
  table: "departments" | "positions" | "work_schedules" | "holidays" | "occurrence_types",
  id: string,
) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function toggleOccurrenceType(id: string, active: boolean) {
  return unwrap(await supabase.from("occurrence_types").update({ active }).eq("id", id).select().single());
}
