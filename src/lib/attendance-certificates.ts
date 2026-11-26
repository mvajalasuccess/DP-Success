import { supabase } from "@/integrations/supabase/client";

export async function fetchAttendanceCertificates(startDate: string, endDate: string) {
  const result = await (supabase as any).rpc("attendance_certificate_indicators", {
    range_start: startDate,
    range_end: endDate,
  });

  // Keep the existing read path available until the new database migration is applied.
  if (result.error?.code !== "PGRST202") return result;

  return supabase.from("medical_certificates")
    .select("id,employee_id,start_date,end_date,days")
    .lte("start_date", endDate)
    .gte("end_date", startDate);
}
