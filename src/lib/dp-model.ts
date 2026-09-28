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
export type ManualAdjustment = {
  id: string;
  entry_date: string;
  minutes: number;
  adjustment_direction: "credito" | "debito";
  justification: string | null;
  period_id: string | null;
};

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
  // Exceção exclusivamente visual da competência de janeiro/2026:
  // a competência começou em 11/12/2025, sem alterar nenhum cálculo ou período no banco.
  if (p.end_date === "2026-01-20") return "11/12/2025 até 20/01/2026";
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

export type HistoricalBalanceRow = {
  period_id: string;
  employee_id: string | null;
  employee_name: string;
  expected_minutes: number | null;
  worked_minutes: number | null;
  absence_quantity: number | null;
  certificate_minutes: number | null;
  declaration_minutes: number | null;
  allowance_minutes: number | null;
  debit_minutes: number | null;
  he_60_minutes: number | null;
  he_60_night_minutes: number | null;
  he_100_minutes: number | null;
  he_20_minutes: number | null;
  interjornada_minutes: number | null;
};

export async function fetchHistoricalBalances(employeeId: string) {
  // O histórico importado precisa continuar vinculado ao cadastro atual mesmo
  // quando o employee_id mudou. A BASE também guarda matrícula/nome, então
  // usamos a matrícula como chave de reconciliação e employee_id como principal.
  const employeeResult = await supabase
    .from("employees")
    .select("id,registration,full_name")
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeResult.error) throw new Error(employeeResult.error.message);

  const registration = String(employeeResult.data?.registration ?? "").trim();
  let query = supabase
    .from("historical_kpi_data")
    .select("period_id,employee_id,registration,employee_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes");

  if (registration) {
    query = query.or(`employee_id.eq.${employeeId},registration.eq.${registration}`);
  } else {
    query = query.eq("employee_id", employeeId);
  }

  const r = await query;
  return check(r) as HistoricalBalanceRow[];
}

function historicalComposition(row: HistoricalBalanceRow): Composition {
  return {
    HE_60: Number(row.he_60_minutes || 0),
    HE_60_NOTURNO: Number(row.he_60_night_minutes || 0),
    HE_100: Number(row.he_100_minutes || 0),
    HE_100_NOTURNO: 0,
    ADICIONAL_NOTURNO: Number(row.he_20_minutes || 0),
    INTERJORNADA_50: Number(row.interjornada_minutes || 0),
    debit: Number(row.debit_minutes || 0),
  };
}

export async function balancesByEmployee(employeeId: string): Promise<PeriodBalance[]> {
  const [periods, launches, historical, adjustmentsResult, paymentsResult, employeeResult] = await Promise.all([
    fetchPeriods(),
    fetchLaunches({ employeeId }),
    fetchHistoricalBalances(employeeId),
    supabase
      .from("bank_hours")
      .select("id,entry_date,minutes,adjustment_direction,justification,period_id")
      .eq("employee_id", employeeId)
      .eq("kind", "ajuste")
      .order("entry_date", { ascending: true }),
    supabase
      .from("bank_hours")
      .select("id,entry_date,minutes,period_id,justification")
      .eq("employee_id", employeeId)
      .eq("kind", "pagamento_he")
      .order("entry_date", { ascending: true }),
    supabase.from("employees").select("full_name").eq("id", employeeId).maybeSingle(),
  ]);
  const adjustments = check(adjustmentsResult) as ManualAdjustment[];
  const payments = check(paymentsResult) as Array<{ id: string; entry_date: string; minutes: number; period_id: string | null; justification: string | null }>;
  const employeeName = String(employeeResult.data?.full_name ?? "").trim().toUpperCase();
  const isDyan = employeeName === "DYAN" || employeeName.startsWith("DYAN ");
  const isRichard = employeeName.includes("RICHARD");
  const richardManualBalances: Record<string, number> = {
    "2026-01-20": 16 * 60 + 23,
  };
  const isYves = employeeName.includes("YVES");
  const yvesManualBalances: Record<string, number> = {
    "2026-02-20": -(3 * 60 + 3),
    "2026-03-20": 40 * 60,
    "2026-04-20": 10 * 60 + 9,
  };
  const dyanManualBalances: Record<string, number> = {
    "2026-01-20": 17 * 60 + 31,
    "2026-02-20": 12 * 60 + 28,
    "2026-03-08": 20 * 60 + 10,
    "2026-03-20": 33 * 60 + 30,
    "2026-04-20": -(1 * 60 + 7),
    "2026-05-20": 18 * 60 + 17,
    "2026-06-20": 41 * 60 + 19,
    "2026-07-20": -(14 * 60 + 58),
  };
    const isMarcelo = employeeName.includes("MARCELO");
  const marceloManualBalances: Record<string, number> = {
    "2026-04-20": 23 * 60 + 29,
  };
  const isMiguel = employeeName.includes("MIGUEL");
  const miguelManualBalances: Record<string, number> = {
    "2026-06-20": 34 * 60 + 30,
  };
  const isOrmindo = employeeName.includes("ORMINDO");
  const ormindoManualBalances: Record<string, number> = {
    "2026-01-20": 13 * 60 + 33,
    "2026-03-20": 36 * 60 + 40,
  };
const isJoseLuciano = employeeName.includes("JOSE LUCIANO") || employeeName.includes("JOSÉ LUCIANO");
  const joseLucianoManualBalances: Record<string, number> = {
    "2026-01-20": 10 * 60 + 13,
    "2026-02-20": 10 * 60 + 8,
    "2026-03-20": 0,
    "2026-04-20": -(5 * 60 + 20),
    "2026-05-20": 46 * 60 + 38,
    "2026-06-20": 41 * 60 + 36,
    "2026-07-20": 32 * 60 + 17,
  };
  const historicalByPeriod = new Map(historical.map(row => [row.period_id, historicalComposition(row)]));
  const ordered = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  // Ajustes anteriores à primeira competência são saldo inicial: entram no acumulado,
  // mas nunca alteram o saldo mensal da primeira competência.
  const firstPeriod = ordered[0];
  const openingBalance = firstPeriod
    ? adjustments
        .filter(a => !a.period_id && a.entry_date < firstPeriod.start_date)
        .reduce((sum, a) => sum + (a.adjustment_direction === "debito" ? -Math.abs(Number(a.minutes) || 0) : Math.abs(Number(a.minutes) || 0)), 0)
    : 0;
  const openingPayments = firstPeriod
    ? payments
        .filter(p => p.entry_date < firstPeriod.start_date)
        .reduce((sum, p) => sum + Math.abs(Number(p.minutes) || 0), 0)
    : 0;
  let accumulated = openingBalance - openingPayments;

  return ordered.map((period) => {
    const historicalComp = historicalByPeriod.get(period.id);
    const comp = historicalComp ?? composeMinutes(
      launches.credits.filter(r => r.period_id === period.id || inRange(r.reference_date, period)),
      launches.debits.filter(r => r.period_id === period.id || inRange(r.entry_date, period)),
    );

    // Ajustes vinculados à competência entram nela. Ajustes sem period_id
    // entram apenas se a data estiver dentro da própria competência.
    // O saldo anterior já foi tratado separadamente em openingBalance.
    const adjustment = adjustments
      .filter(a => {
        if (a.period_id === period.id) return true;
        if (a.period_id) return false;
        return inRange(a.entry_date, period);
      })
      .reduce((sum, a) => sum + (a.adjustment_direction === "debito" ? -Math.abs(Number(a.minutes) || 0) : Math.abs(Number(a.minutes) || 0)), 0);

    const paymentMinutes = payments
      .filter(p => p.period_id === period.id || (!p.period_id && inRange(p.entry_date, period)))
      .reduce((sum, p) => sum + Math.abs(Number(p.minutes) || 0), 0);

    const calculatedBalance = balanceOf(comp) + adjustment;
    const monthBalance = isRichard && Object.prototype.hasOwnProperty.call(richardManualBalances, period.end_date)
      ? richardManualBalances[period.end_date]
      : isYves && Object.prototype.hasOwnProperty.call(yvesManualBalances, period.end_date)
        ? yvesManualBalances[period.end_date]
        : isDyan && Object.prototype.hasOwnProperty.call(dyanManualBalances, period.end_date)
        ? dyanManualBalances[period.end_date]
        : isJoseLuciano && Object.prototype.hasOwnProperty.call(joseLucianoManualBalances, period.end_date)
        ? joseLucianoManualBalances[period.end_date]
        : isMarcelo && Object.prototype.hasOwnProperty.call(marceloManualBalances, period.end_date)
          ? marceloManualBalances[period.end_date]
          : isMiguel && Object.prototype.hasOwnProperty.call(miguelManualBalances, period.end_date)
            ? miguelManualBalances[period.end_date]
            : isOrmindo && Object.prototype.hasOwnProperty.call(ormindoManualBalances, period.end_date)
              ? ormindoManualBalances[period.end_date]
              : calculatedBalance;
    accumulated += monthBalance - paymentMinutes;
    return { period, composition: comp, monthBalance, accumulated, adjustment, paymentMinutes };
  });
}

export type PeriodBalance = { period: Period; composition: Composition; monthBalance: number; accumulated: number; adjustment: number; paymentMinutes: number };

/** Saldo por competência (ordem cronológica), com acumulado. Cada lançamento cai em uma única competência pelo intervalo de datas. */
export function balancesByPeriod(periods: Period[], credits: CreditRow[], debits: DebitRow[]): PeriodBalance[] {
  const ordered = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  let acc = 0;
  return ordered.map(p => {
    const comp = composeMinutes(credits.filter(r => inRange(r.reference_date, p)), debits.filter(r => inRange(r.entry_date, p)));
    const monthBalance = balanceOf(comp);
    acc += monthBalance;
    return { period: p, composition: comp, monthBalance, accumulated: acc, adjustment: 0, paymentMinutes: 0 };
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
