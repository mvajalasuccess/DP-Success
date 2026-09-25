import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { monthRange } from "@/lib/format";
import { CERTIFICATE_COLUMNS, type MedicalCertificate, type TableInsert, type TableUpdate } from "./db";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data as T;
}

export type CertificateWithEmployee = MedicalCertificate & {
  employees: { full_name: string; registration: string | null; department_id: string | null } | null;
};

const SELECT = `${CERTIFICATE_COLUMNS}, employees:employee_id (full_name, registration, department_id)`;

export const certificatesQuery = (params: {
  year?: number;
  month?: number;
  employeeId?: string;
  departmentId?: string;
}) =>
  queryOptions({
    queryKey: ["medical_certificates", params],
    queryFn: async (): Promise<CertificateWithEmployee[]> => {
      let query = supabase
        .from("medical_certificates")
        .select(SELECT)
        .order("start_date", { ascending: false });
      if (params.year && params.month) {
        const { start, end } = monthRange(params.year, params.month);
        query = query.gte("start_date", start).lte("start_date", end);
      }
      if (params.employeeId) query = query.eq("employee_id", params.employeeId);
      let rows = unwrap(await query) as unknown as CertificateWithEmployee[];
      if (params.departmentId) {
        rows = rows.filter((row) => row.employees?.department_id === params.departmentId);
      }
      return rows;
    },
  });

/**
 * O CID é dado de saúde com acesso restrito: somente Administrador e RH/DP
 * conseguem lê-lo, e a verificação acontece no banco de dados.
 */
export async function fetchCertificateCid(certificateId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("certificate_cid", { _certificate_id: certificateId });
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function createCertificate(input: TableInsert<"medical_certificates">) {
  const { error } = await supabase.from("medical_certificates").insert(input);
  if (error) throw new Error(error.message);
}

export async function updateCertificate(id: string, input: TableUpdate<"medical_certificates">) {
  const { error } = await supabase.from("medical_certificates").update(input).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteCertificate(id: string) {
  const { error } = await supabase.from("medical_certificates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
