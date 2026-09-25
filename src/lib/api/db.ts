import type { Database } from "@/integrations/supabase/types";

type PublicSchema = Database["public"];

export type TableRow<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TableInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TableUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];

export type AppRole = PublicSchema["Enums"]["app_role"];
export type EmployeeStatus = PublicSchema["Enums"]["employee_status"];
export type PeriodStatus = PublicSchema["Enums"]["period_status"];
export type TimeRecordStatus = PublicSchema["Enums"]["time_record_status"];
export type BankHoursKind = PublicSchema["Enums"]["bank_hours_kind"];

export type Employee = TableRow<"employees">;
export type Department = TableRow<"departments">;
export type Position = TableRow<"positions">;
export type WorkSchedule = TableRow<"work_schedules">;
export type TimeRecord = TableRow<"time_records">;
export type TimePeriod = TableRow<"time_periods">;
export type TimeAdjustment = TableRow<"time_adjustments">;
export type OvertimeRecord = TableRow<"overtime_records">;
export type BankHoursEntry = TableRow<"bank_hours">;
export type Occurrence = TableRow<"occurrences">;
export type OccurrenceType = TableRow<"occurrence_types">;
export type MedicalCertificate = Omit<TableRow<"medical_certificates">, "cid">;
export type Holiday = TableRow<"holidays">;
export type AppSetting = TableRow<"app_settings">;
export type AuditLog = TableRow<"audit_logs">;

/** Colunas de atestado liberadas para leitura direta (o CID é restrito). */
export const CERTIFICATE_COLUMNS =
  "id, employee_id, start_date, end_date, days, certificate_type, notes, attachment_id, created_by, is_demo, created_at, updated_at";

export const ROLE_LABELS: Record<AppRole, string> = {
  administrador: "Administrador",
  rh: "RH/DP",
  gestor: "Gestor",
  consulta: "Consulta",
};

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  aberto: "Aberto",
  em_conferencia: "Em conferência",
  fechado: "Fechado",
};

export const TIME_STATUS_LABELS: Record<TimeRecordStatus, string> = {
  normal: "Normal",
  incompleto: "Incompleto",
  falta: "Falta",
  atraso: "Atraso",
  saida_antecipada: "Saída antecipada",
  folga: "Folga",
  feriado: "Feriado",
  ferias: "Férias",
  atestado: "Atestado",
  ajustado: "Ajustado",
};

export const BANK_KIND_LABELS: Record<BankHoursKind, string> = {
  credito: "Crédito",
  debito: "Débito",
  compensacao: "Compensação",
  ajuste: "Ajuste manual",
};
