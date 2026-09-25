import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PeriodStatus, TimePeriod } from "./db";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export const periodsQuery = () =>
  queryOptions({
    queryKey: ["time_periods"],
    queryFn: async (): Promise<TimePeriod[]> =>
      unwrap(
        await supabase
          .from("time_periods")
          .select("*")
          .order("reference_year", { ascending: false })
          .order("reference_month", { ascending: false }),
      ),
  });

export const periodQuery = (year: number, month: number) =>
  queryOptions({
    queryKey: ["time_period", year, month],
    queryFn: async (): Promise<TimePeriod | null> => {
      const { data, error } = await supabase
        .from("time_periods")
        .select("*")
        .eq("reference_year", year)
        .eq("reference_month", month)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

export async function ensurePeriod(year: number, month: number): Promise<TimePeriod> {
  const existing = await supabase
    .from("time_periods")
    .select("*")
    .eq("reference_year", year)
    .eq("reference_month", month)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return existing.data;
  return unwrap(
    await supabase
      .from("time_periods")
      .insert({ reference_year: year, reference_month: month, status: "aberto" })
      .select()
      .single(),
  );
}

export async function setPeriodStatus(params: {
  year: number;
  month: number;
  status: PeriodStatus;
  userId: string;
  notes?: string | null;
}): Promise<TimePeriod> {
  const period = await ensurePeriod(params.year, params.month);
  const patch: Record<string, unknown> = { status: params.status, notes: params.notes ?? period.notes };
  if (params.status === "fechado") {
    patch.closed_by = params.userId;
    patch.closed_at = new Date().toISOString();
  }
  if (params.status === "aberto" && period.status === "fechado") {
    patch.reopened_by = params.userId;
    patch.reopened_at = new Date().toISOString();
  }
  return unwrap(await supabase.from("time_periods").update(patch).eq("id", period.id).select().single());
}
