/**
 * Camada central de cálculos do DP Success.
 * Todas as telas (Lançamentos, Banco de Horas, Dashboard, KPIs, Comparativos, Relatórios)
 * devem usar estas funções para evitar cálculos divergentes.
 */
import { supabase } from "@/integrations/supabase/client";

export type CreditType = "HE_60" | "HE_60_NOTURNO" | "HE_100" | "HE_100_NOTURNO" | "ADICIONAL_NOTURNO" | "INTERJORNADA_50";

export const CREDIT_TYPES: Record<CreditType, { label: string; ratePercent: number; affectsBalance: boolean }> = {
  HE_60: { label: "HE 60%", ratePercent: 60, affectsBalance: true },
  HE_60_NOTURNO: { label: "HE 60% + 20% noturno", ratePercent: 80, affectsBalance: true },
  HE_100: { label: "HE 100% (domingo/feriado)", ratePercent: 100, affectsBalance: true },
  HE_100_NOTURNO: { label: "HE 100% + 20% noturno", ratePercent: 120, affectsBalance: true },
  ADICIONAL_NOTURNO: { label: "Adicional noturno 20%", ratePercent: 20, affectsBalance: true },
  // Interjornada é apenas informativa: nunca altera o saldo.
  INTERJORNADA_50: { label: "Interjornada 50%", ratePercent: 50, affectsBalance: false },
};
export const CREDIT_TYPE_KEYS = Object.keys(CREDIT_TYPES) as CreditType[];

export type Period = {
  id: string; reference_year: number; reference_month: number;
  start_date: string; end_date: string; status: "aberto" | "em_conferencia" | "fechado";
};
export type CreditRow = { id: string; employee_id: string; reference_date: string; minutes: number; launch_type: CreditType; launch_group_id: string | null; period_id: string | null; notes: string | null };
export type DebitRow = { id: string; employee_id: string; entry_date: string; minutes: number; launch_group_id: string | null; period_id: string | null; justification: string | null };

export type Composition = Record<CreditType, number> & { debit: number };

export function emptyComposition(): Composition {
  return { HE_60: 0, HE_60_NOTURNO: 0, HE_100: 0, HE_100_NOTURNO: 0, ADICIONAL_NOTURNO: 0, INTERJORNADA_50: 0, debit: 0 };
}

export function composeMinutes(credits: Pick<CreditRow, "minutes" | "launch_type">[], debits: Pick<DebitRow, "minutes">[]): Composition {
  const c = emptyComposition();
  for (const r of credits) if (r.launch_type in CREDIT_TYPES) c[r.launch_type] += Math.abs(Number(r.minutes) || 0);
  for (const d of debits) c.debit += Math.abs(Number(d.minutes) || 0);
  return c;
}

/** Créditos que entram no saldo (exclui interjornada). */
export function creditTotal(c: Composition) {
  return CREDIT_TYPE_KEYS.filter(k => CREDIT_TYPES[k].affectsBalance).reduce((s, k) => s + c[k], 0);
}
/** Saldo = 60% + 60%+20% + 100% + 100%+20% + noturno − débitos. Interjornada não entra. */
export function balanceOf(c: Composition) {
  return creditTotal(c) - c.debit;
}

export const inRange = (date: string, p: Pick<Period, "start_date" | "end_date">) => date >= p.start_date && date <= p.end_date;

/** Encontra a competência (por start_date/end_date) que contém a data. */
export function periodForDate(periods: Period[], date: string) {
  return periods.find(p => inRange(date, p)) ?? null;
}

export function hoursToMinutes(value: string) {
  const [h = "0", m = "0"] = value.trim().split(":");
  const hh = Number(h), mm = Number(m);
  return (Number.isFinite(hh) ? hh : 0) * 60 + (Number.isFinite(mm) ? mm : 0);
}
export function minutesToHours(total: number, signed = false) {
  const sign = total < 0 ? "-" : signed && total > 0 ? "+" : "";
  const a = Math.abs(Math.round(total));
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
export function formatDateBR(value?: string | null) {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}
export function periodRangeLabel(p: Pick<Period, "start_date" | "end_date">) {
  return `${formatDateBR(p.start_date)} até ${formatDateBR(p.end_date)}`;
}
export const PERIOD_STATUS_LABEL: Record<string, string> = { aberto: "Aberto", em_conferencia: "Em conferência", fechado: "Fechado" };

/** Converte quantidade de uma ocorrência para minutos (dias = jornada diária informada, padrão 480). */
export function occurrenceMinutes(quantity: number | null, unit: string, dailyMinutes = 480) {
  const q = Number(quantity || 0);
  const u = unit.toLowerCase();
  if (u.startsWith("min")) return q;
  if (u.startsWith("hor")) return Math.round(q * 60);
  if (u.startsWith("dia")) return Math.round(q * dailyMinutes);
  return 0;
}

// ---------- Acesso a dados compartilhado ----------
function check<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as T;
}

export async function fetchPeriods(): Promise<Period[]> {
  return check(await supabase.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("start_date", { ascending: false })) as Period[];
}
export async function fetchActiveEmployees() {
  return check(await supabase.from("employees").select("id,full_name,department_id,position_id,status,departments(name)").order("full_name")) as Array<{ id: string; full_name: string; department_id: string | null; position_id: string | null; status: string; departments: { name: string } | null }>;
}
export async function fetchLaunches(filter: { employeeId?: string; start?: string; end?: string } = {}) {
  let cq = supabase.from("overtime_records").select("id,employee_id,reference_date,minutes,launch_type,launch_group_id,period_id,notes");
  let dq = supabase.from("bank_hours").select("id,employee_id,entry_date,minutes,launch_group_id,period_id,justification").eq("kind", "debito");
  if (filter.employeeId) { cq = cq.eq("employee_id", filter.employeeId); dq = dq.eq("employee_id", filter.employeeId); }
  if (filter.start) { cq = cq.gte("reference_date", filter.start); dq = dq.gte("entry_date", filter.start); }
  if (filter.end) { cq = cq.lte("reference_date", filter.end); dq = dq.lte("entry_date", filter.end); }
  const [c, d] = await Promise.all([cq, dq]);
  return { credits: check(c) as CreditRow[], debits: check(d) as DebitRow[] };
}

export type PeriodBalance = { period: Period; composition: Composition; monthBalance: number; accumulated: number };

/** Saldo por competência (ordem cronológica), com acumulado. Cada lançamento cai em uma única competência pelo intervalo de datas. */
export function balancesByPeriod(periods: Period[], credits: CreditRow[], debits: DebitRow[]): PeriodBalance[] {
  const ordered = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  let acc = 0;
  return ordered.map(p => {
    const comp = composeMinutes(credits.filter(r => inRange(r.reference_date, p)), debits.filter(r => inRange(r.entry_date, p)));
    const monthBalance = balanceOf(comp);
    acc += monthBalance;
    return { period: p, composition: comp, monthBalance, accumulated: acc };
  });
}

/** Indicadores por funcionário em um intervalo — usado em Dashboard, KPIs, Comparativos e Relatórios. */
export async function fetchIndicators(start: string, end: string) {
  const [launches, occ, certs, allLaunches] = await Promise.all([
    fetchLaunches({ start, end }),
    supabase.from("occurrences").select("employee_id,occurrence_date,quantity,unit,occurrence_types(code)").gte("occurrence_date", start).lte("occurrence_date", end),
    supabase.from("medical_certificates").select("employee_id,start_date,end_date,days").lte("start_date", end).gte("end_date", start),
    fetchLaunches({ end }),
  ]);
  const occRows = check(occ) as Array<{ employee_id: string; quantity: number | null; unit: string; occurrence_types: { code: string } | null }>;
  const certRows = check(certs) as Array<{ employee_id: string; days: number }>;
  const map = new Map<string, { overtime: number; composition: Composition; late: number; absence: number; certificates: number; certificateDays: number; accumulated: number }>();
  const get = (id: string) => {
    let v = map.get(id);
    if (!v) { v = { overtime: 0, composition: emptyComposition(), late: 0, absence: 0, certificates: 0, certificateDays: 0, accumulated: 0 }; map.set(id, v); }
    return v;
  };
  const ids = new Set([...launches.credits.map(r => r.employee_id), ...launches.debits.map(r => r.employee_id)]);
  for (const id of ids) {
    const v = get(id);
    v.composition = composeMinutes(launches.credits.filter(r => r.employee_id === id), launches.debits.filter(r => r.employee_id === id));
    v.overtime = creditTotal(v.composition);
  }
  const allIds = new Set([...allLaunches.credits.map(r => r.employee_id), ...allLaunches.debits.map(r => r.employee_id)]);
  for (const id of allIds) {
    get(id).accumulated = balanceOf(composeMinutes(allLaunches.credits.filter(r => r.employee_id === id), allLaunches.debits.filter(r => r.employee_id === id)));
  }
  for (const o of occRows) {
    const code = o.occurrence_types?.code ?? "";
    const min = occurrenceMinutes(o.quantity, o.unit);
    if (code === "atraso" || code === "saida_antecipada") get(o.employee_id).late += min;
    if (code === "falta") get(o.employee_id).absence += min;
  }
  for (const c of certRows) { const v = get(c.employee_id); v.certificates += 1; v.certificateDays += Number(c.days || 0); }
  return map;
}

export function csvEscape(value: unknown) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const content = "\uFEFF" + [headers, ...rows].map(r => r.map(csvEscape).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
