/**
 * Camada central de cálculos do DP Success.
 * Todas as telas (Lançamentos, Banco de Horas, Dashboard, KPIs, Comparativos, Relatórios)
 * devem usar estas funções para evitar cálculos divergentes.
 */
import { supabase } from "@/integrations/supabase/client";

export type CreditType = "HE_60" | "HE_60_NOTURNO" | "HE_100" | "HE_100_NOTURNO" | "ADICIONAL_NOTURNO" | "INTERJORNADA_50";

export const CREDIT_TYPES: Record<CreditType, { label: string; ratePercent: number; affectsBalance: boolean }> = {
  HE_60: { label: "HE 60%", ratePercent: 60, affectsBalance: true },
  HE_60_NOTURNO: { label: "HE 60% + 20% noturno", ratePercent: 80, affectsBalance: false },
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
  // O histórico importado deve ser vinculado ao cadastro pelo employee_id.
  // A matrícula não pode ser usada como fallback porque pode existir duplicidade
  // histórica (ex.: Felipe Santos Barros e Lorran Ferreira Barros possuem a mesma
  // matrícula 18). Usar matrícula aqui faria o Banco de Horas misturar os dois.
  const r = await supabase
    .from("historical_kpi_data")
    .select("period_id,employee_id,registration,employee_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
    .eq("employee_id", employeeId);
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
  const [periods, launches, historical, overridesResult, adjustmentsResult, paymentsResult, employeeResult] = await Promise.all([
    fetchPeriods(),
    fetchLaunches({ employeeId }),
    fetchHistoricalBalances(employeeId),
    (supabase as any)
      .from("point_closing_overrides")
      .select("period_id,employee_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
      .eq("employee_id", employeeId),
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
  const overrideQueryError = (overridesResult as any)?.error;
  const overrides = !overrideQueryError || !String(overrideQueryError.message ?? "").toLowerCase().includes("point_closing_overrides")
    ? check(overridesResult) as Array<{
        period_id: string;
        employee_id: string;
        expected_minutes: number;
        worked_minutes: number;
        absence_quantity: number;
        certificate_minutes: number;
        declaration_minutes: number;
        allowance_minutes: number;
        debit_minutes: number;
        he_60_minutes: number;
        he_60_night_minutes: number;
        he_100_minutes: number;
        he_20_minutes: number;
        interjornada_minutes: number;
      }>
    : [];
  const overridesByPeriod = new Map(overrides.map(row => [row.period_id, row]));
  const adjustments = check(adjustmentsResult) as ManualAdjustment[];
  const payments = check(paymentsResult) as Array<{ id: string; entry_date: string; minutes: number; period_id: string | null; justification: string | null }>;
  const employeeName = String(employeeResult.data?.full_name ?? "").trim().toUpperCase();
  const isDyan = employeeName === "DYAN" || employeeName.startsWith("DYAN ");
  const isGlecio = employeeName.includes("GLECIO JOSE DE CARVALHO JUNIOR") || employeeName.includes("GLÉCIO JOSÉ DE CARVALHO JUNIOR");
  const glecioManualBalances: Record<string, number> = {
    "2026-06-20": -(3 * 60 + 48),
    "2026-07-20": 38 * 60 + 56,
  };
  const isFelipeHilmann = employeeName.includes("FELIPE HILMANN");
  const felipeHilmannManualBalances: Record<string, number> = {
    "2026-07-20": 25 * 60 + 6,
  };
  const isRichard = employeeName.includes("RICHARD");
  const richardManualBalances: Record<string, number> = {
    "2026-01-20": 16 * 60 + 23,
    "2026-07-20": -(4 * 60 + 22),
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
    const override = overridesByPeriod.get(period.id);
    let comp = historicalComp ?? composeMinutes(
      launches.credits.filter(r => r.period_id === period.id || inRange(r.reference_date, period)),
      launches.debits.filter(r => r.period_id === period.id || inRange(r.entry_date, period)),
    );

    if (override) {
      comp = {
        ...comp,
        HE_60: Number(override.he_60_minutes || 0),
        HE_60_NOTURNO: Number(override.he_60_night_minutes || 0),
        HE_100: Number(override.he_100_minutes || 0),
        ADICIONAL_NOTURNO: Number(override.he_20_minutes || 0),
        INTERJORNADA_50: Number(override.interjornada_minutes || 0),
        debit: Number(override.debit_minutes || 0),
      };
    }

    // Ajuste manual solicitado para Felipe Hilmann na competência de julho/2026.
    // Mantém os demais dados da competência e corrige somente a composição informada.
    if (!override && employeeName.includes("FELIPE HILMANN") && period.end_date === "2026-07-20") {
      comp = {
        ...comp,
        HE_60: 19 * 60 + 26,
        HE_60_NOTURNO: 1 * 60 + 31,
        HE_100: 15 * 60 + 33,
        debit: 11 * 60 + 24,
      };
    }

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

    // HE 60% + 20% (noturno):
    // - histórico importado da BASE (jan-jul/2026): não entra no saldo;
    // - competências atuais do DP-Success (ago/2026 em diante): entra no saldo.
    // As exceções manuais abaixo continuam prevalecendo sobre este cálculo.
    // A competência de agosto/2026 é 21/07/2026 a 20/08/2026.
    // O HE 60% + 20% só passa a compor o saldo a partir dela.
    const he60NightAffectsBalance = period.end_date >= "2026-08-20";
    const calculatedBalance = employeeName.includes("FELIPE HILMANN") && period.end_date === "2026-07-20"
      ? comp.HE_60 + comp.HE_60_NOTURNO + comp.HE_100 + comp.HE_100_NOTURNO + comp.ADICIONAL_NOTURNO - comp.debit + adjustment
      : balanceOf(comp) + (he60NightAffectsBalance ? comp.HE_60_NOTURNO : 0) + adjustment;
    const monthBalance = isGlecio && Object.prototype.hasOwnProperty.call(glecioManualBalances, period.end_date)
      ? glecioManualBalances[period.end_date] ?? calculatedBalance
      : isFelipeHilmann && Object.prototype.hasOwnProperty.call(felipeHilmannManualBalances, period.end_date)
      ? felipeHilmannManualBalances[period.end_date] ?? calculatedBalance
      : isRichard && Object.prototype.hasOwnProperty.call(richardManualBalances, period.end_date)
      ? richardManualBalances[period.end_date] ?? calculatedBalance
      : isYves && Object.prototype.hasOwnProperty.call(yvesManualBalances, period.end_date)
        ? yvesManualBalances[period.end_date] ?? calculatedBalance
        : isDyan && Object.prototype.hasOwnProperty.call(dyanManualBalances, period.end_date)
        ? dyanManualBalances[period.end_date] ?? calculatedBalance
        : isJoseLuciano && Object.prototype.hasOwnProperty.call(joseLucianoManualBalances, period.end_date)
        ? joseLucianoManualBalances[period.end_date] ?? calculatedBalance
        : isMarcelo && Object.prototype.hasOwnProperty.call(marceloManualBalances, period.end_date)
          ? marceloManualBalances[period.end_date] ?? calculatedBalance
          : isMiguel && Object.prototype.hasOwnProperty.call(miguelManualBalances, period.end_date)
            ? miguelManualBalances[period.end_date] ?? calculatedBalance
            : isOrmindo && Object.prototype.hasOwnProperty.call(ormindoManualBalances, period.end_date)
              ? ormindoManualBalances[period.end_date] ?? calculatedBalance
              : calculatedBalance;
    const previousAccumulated = accumulated;
    accumulated += monthBalance - paymentMinutes;

    // Saldo que o Dashboard deve exibir como positivo/pagável.
    // Esta regra fica centralizada aqui para que o Dashboard nunca replique
    // uma lógica diferente da usada pelo Banco de Horas:
    // - banco anterior zero/positivo: considera o saldo gerado na competência;
    // - banco anterior negativo: considera o acumulado final após compensação;
    // - saldo final negativo: não é positivo/pagável.
    const dashboardBalance = previousAccumulated < 0
      ? accumulated
      : monthBalance - paymentMinutes;

    return { period, composition: comp, monthBalance, accumulated, adjustment, paymentMinutes, dashboardBalance };
  });
}

/** Calcula o saldo de um funcionário a partir de dados já carregados. */
function calculateEmployeeBalancesFromData(
  periods: Period[],
  launches: { credits: CreditRow[]; debits: DebitRow[] },
  historical: HistoricalBalanceRow[],
  overrides: Array<{
    period_id: string; employee_id: string; expected_minutes: number; worked_minutes: number;
    absence_quantity: number; certificate_minutes: number; declaration_minutes: number;
    allowance_minutes: number; debit_minutes: number; he_60_minutes: number;
    he_60_night_minutes: number; he_100_minutes: number; he_20_minutes: number;
    interjornada_minutes: number;
  }>,
  adjustments: ManualAdjustment[],
  payments: Array<{ id: string; entry_date: string; minutes: number; period_id: string | null; justification: string | null }>,
  employeeName: string,
): PeriodBalance[] {
  const overridesByPeriod = new Map(overrides.map(row => [row.period_id, row]));
  const employeeNameNormalized = String(employeeNameNormalized ?? "").trim().toUpperCase();
  const isDyan = employeeNameNormalized === "DYAN" || employeeNameNormalized.startsWith("DYAN ");
  const isGlecio = employeeNameNormalized.includes("GLECIO JOSE DE CARVALHO JUNIOR") || employeeNameNormalized.includes("GLÉCIO JOSÉ DE CARVALHO JUNIOR");
  const glecioManualBalances: Record<string, number> = {
    "2026-06-20": -(3 * 60 + 48),
    "2026-07-20": 38 * 60 + 56,
  };
  const isFelipeHilmann = employeeNameNormalized.includes("FELIPE HILMANN");
  const felipeHilmannManualBalances: Record<string, number> = {
    "2026-07-20": 25 * 60 + 6,
  };
  const isRichard = employeeNameNormalized.includes("RICHARD");
  const richardManualBalances: Record<string, number> = {
    "2026-01-20": 16 * 60 + 23,
    "2026-07-20": -(4 * 60 + 22),
  };
  const isYves = employeeNameNormalized.includes("YVES");
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
    const isMarcelo = employeeNameNormalized.includes("MARCELO");
  const marceloManualBalances: Record<string, number> = {
    "2026-04-20": 23 * 60 + 29,
  };
  const isMiguel = employeeNameNormalized.includes("MIGUEL");
  const miguelManualBalances: Record<string, number> = {
    "2026-06-20": 34 * 60 + 30,
  };
  const isOrmindo = employeeNameNormalized.includes("ORMINDO");
  const ormindoManualBalances: Record<string, number> = {
    "2026-01-20": 13 * 60 + 33,
    "2026-03-20": 36 * 60 + 40,
  };
const isJoseLuciano = employeeNameNormalized.includes("JOSE LUCIANO") || employeeNameNormalized.includes("JOSÉ LUCIANO");
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
    const override = overridesByPeriod.get(period.id);
    let comp = historicalComp ?? composeMinutes(
      launches.credits.filter(r => r.period_id === period.id || inRange(r.reference_date, period)),
      launches.debits.filter(r => r.period_id === period.id || inRange(r.entry_date, period)),
    );

    if (override) {
      comp = {
        ...comp,
        HE_60: Number(override.he_60_minutes || 0),
        HE_60_NOTURNO: Number(override.he_60_night_minutes || 0),
        HE_100: Number(override.he_100_minutes || 0),
        ADICIONAL_NOTURNO: Number(override.he_20_minutes || 0),
        INTERJORNADA_50: Number(override.interjornada_minutes || 0),
        debit: Number(override.debit_minutes || 0),
      };
    }

    // Ajuste manual solicitado para Felipe Hilmann na competência de julho/2026.
    // Mantém os demais dados da competência e corrige somente a composição informada.
    if (!override && employeeNameNormalized.includes("FELIPE HILMANN") && period.end_date === "2026-07-20") {
      comp = {
        ...comp,
        HE_60: 19 * 60 + 26,
        HE_60_NOTURNO: 1 * 60 + 31,
        HE_100: 15 * 60 + 33,
        debit: 11 * 60 + 24,
      };
    }

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

    // HE 60% + 20% (noturno):
    // - histórico importado da BASE (jan-jul/2026): não entra no saldo;
    // - competências atuais do DP-Success (ago/2026 em diante): entra no saldo.
    // As exceções manuais abaixo continuam prevalecendo sobre este cálculo.
    // A competência de agosto/2026 é 21/07/2026 a 20/08/2026.
    // O HE 60% + 20% só passa a compor o saldo a partir dela.
    const he60NightAffectsBalance = period.end_date >= "2026-08-20";
    const calculatedBalance = employeeNameNormalized.includes("FELIPE HILMANN") && period.end_date === "2026-07-20"
      ? comp.HE_60 + comp.HE_60_NOTURNO + comp.HE_100 + comp.HE_100_NOTURNO + comp.ADICIONAL_NOTURNO - comp.debit + adjustment
      : balanceOf(comp) + (he60NightAffectsBalance ? comp.HE_60_NOTURNO : 0) + adjustment;
    const monthBalance = isGlecio && Object.prototype.hasOwnProperty.call(glecioManualBalances, period.end_date)
      ? glecioManualBalances[period.end_date] ?? calculatedBalance
      : isFelipeHilmann && Object.prototype.hasOwnProperty.call(felipeHilmannManualBalances, period.end_date)
      ? felipeHilmannManualBalances[period.end_date] ?? calculatedBalance
      : isRichard && Object.prototype.hasOwnProperty.call(richardManualBalances, period.end_date)
      ? richardManualBalances[period.end_date] ?? calculatedBalance
      : isYves && Object.prototype.hasOwnProperty.call(yvesManualBalances, period.end_date)
        ? yvesManualBalances[period.end_date] ?? calculatedBalance
        : isDyan && Object.prototype.hasOwnProperty.call(dyanManualBalances, period.end_date)
        ? dyanManualBalances[period.end_date] ?? calculatedBalance
        : isJoseLuciano && Object.prototype.hasOwnProperty.call(joseLucianoManualBalances, period.end_date)
        ? joseLucianoManualBalances[period.end_date] ?? calculatedBalance
        : isMarcelo && Object.prototype.hasOwnProperty.call(marceloManualBalances, period.end_date)
          ? marceloManualBalances[period.end_date] ?? calculatedBalance
          : isMiguel && Object.prototype.hasOwnProperty.call(miguelManualBalances, period.end_date)
            ? miguelManualBalances[period.end_date] ?? calculatedBalance
            : isOrmindo && Object.prototype.hasOwnProperty.call(ormindoManualBalances, period.end_date)
              ? ormindoManualBalances[period.end_date] ?? calculatedBalance
              : calculatedBalance;
    const previousAccumulated = accumulated;
    accumulated += monthBalance - paymentMinutes;

    // Saldo que o Dashboard deve exibir como positivo/pagável.
    // Esta regra fica centralizada aqui para que o Dashboard nunca replique
    // uma lógica diferente da usada pelo Banco de Horas:
    // - banco anterior zero/positivo: considera o saldo gerado na competência;
    // - banco anterior negativo: considera o acumulado final após compensação;
    // - saldo final negativo: não é positivo/pagável.
    const dashboardBalance = previousAccumulated < 0
      ? accumulated
      : monthBalance - paymentMinutes;

    return { period, composition: comp, monthBalance, accumulated, adjustment, paymentMinutes, dashboardBalance };
  });
}

/** Calcula os saldos de vários funcionários em lote, evitando consultas repetidas por funcionário. */
export async function balancesByEmployees(employeeIds: string[]): Promise<Record<string, PeriodBalance[]>> {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (!ids.length) return {};
  const [periodsResult, creditsResult, debitsResult, historicalResult, overridesResult, adjustmentsResult, paymentsResult, employeesResult] = await Promise.all([
    supabase.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("start_date", { ascending: false }),
    supabase.from("overtime_records").select("id,employee_id,reference_date,minutes,launch_type,launch_group_id,period_id,notes").in("employee_id", ids),
    supabase.from("bank_hours").select("id,employee_id,entry_date,minutes,launch_group_id,period_id,justification").eq("kind", "debito").in("employee_id", ids),
    supabase.from("historical_kpi_data").select("period_id,employee_id,registration,employee_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes").in("employee_id", ids),
    (supabase as any).from("point_closing_overrides").select("period_id,employee_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes").in("employee_id", ids),
    supabase.from("bank_hours").select("id,employee_id,entry_date,minutes,adjustment_direction,justification,period_id").eq("kind", "ajuste").in("employee_id", ids).order("entry_date", { ascending: true }),
    supabase.from("bank_hours").select("id,employee_id,entry_date,minutes,period_id,justification").eq("kind", "pagamento_he").in("employee_id", ids).order("entry_date", { ascending: true }),
    supabase.from("employees").select("id,full_name").in("id", ids),
  ]);
  const overrideError = (overridesResult as any)?.error;
  const overrides = !overrideError || !String(overrideError.message ?? "").toLowerCase().includes("point_closing_overrides") ? check(overridesResult) as any[] : [];
  const periods = check(periodsResult) as Period[];
  const credits = check(creditsResult) as CreditRow[];
  const debits = check(debitsResult) as DebitRow[];
  const historical = check(historicalResult) as HistoricalBalanceRow[];
  const adjustments = check(adjustmentsResult) as Array<ManualAdjustment & { employee_id: string }>;
  const payments = check(paymentsResult) as Array<{ id: string; employee_id: string; entry_date: string; minutes: number; period_id: string | null; justification: string | null }>;
  const employees = check(employeesResult) as Array<{ id: string; full_name: string | null }>;
  const group = <T extends { employee_id: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) { const list = map.get(row.employee_id); if (list) list.push(row); else map.set(row.employee_id, [row]); }
    return map;
  };
  const creditsByEmployee = group(credits);
  const debitsByEmployee = group(debits);
  const historicalByEmployee = group(historical.filter((r): r is HistoricalBalanceRow & { employee_id: string } => Boolean(r.employee_id)));
  const overridesByEmployee = group(overrides);
  const adjustmentsByEmployee = group(adjustments);
  const paymentsByEmployee = group(payments);
  const names = new Map(employees.map(e => [e.id, e.full_name ?? ""]));
  const result: Record<string, PeriodBalance[]> = {};
  for (const employeeId of ids) {
    result[employeeId] = calculateEmployeeBalancesFromData(
      periods,
      { credits: creditsByEmployee.get(employeeId) ?? [], debits: debitsByEmployee.get(employeeId) ?? [] },
      historicalByEmployee.get(employeeId) ?? [],
      overridesByEmployee.get(employeeId) ?? [],
      adjustmentsByEmployee.get(employeeId) ?? [],
      paymentsByEmployee.get(employeeId) ?? [],
      names.get(employeeId) ?? "",
    );
  }
  return result;
}

export type PeriodBalance = { period: Period; composition: Composition; monthBalance: number; accumulated: number; adjustment: number; paymentMinutes: number; dashboardBalance: number };

/** Saldo por competência (ordem cronológica), com acumulado. Cada lançamento cai em uma única competência pelo intervalo de datas. */
export function balancesByPeriod(periods: Period[], credits: CreditRow[], debits: DebitRow[]): PeriodBalance[] {
  const ordered = [...periods].sort((a, b) => a.start_date.localeCompare(b.start_date));
  let acc = 0;
  return ordered.map(p => {
    const comp = composeMinutes(credits.filter(r => inRange(r.reference_date, p)), debits.filter(r => inRange(r.entry_date, p)));
    const monthBalance = balanceOf(comp);
    const previousAccumulated = acc;
    acc += monthBalance;
    const dashboardBalance = previousAccumulated < 0 ? acc : monthBalance;
    return { period: p, composition: comp, monthBalance, accumulated: acc, adjustment: 0, paymentMinutes: 0, dashboardBalance };
  });
}

/** Indicadores por funcionário em um intervalo — usado em Dashboard, KPIs, Comparativos e Relatórios. */
export async function fetchIndicators(start: string, end: string) {
  const [launches, occ, certs, allLaunches] = await Promise.all([
    fetchLaunches({ start, end }),
    supabase.from("occurrences").select("employee_id,occurrence_date,end_date,quantity,unit,occurrence_types(code)").lte("occurrence_date", end).or(`end_date.is.null,end_date.gte.${start}`),
    supabase.from("medical_certificates").select("employee_id,start_date,end_date,days").lte("start_date", end).gte("end_date", start),
    fetchLaunches({ end }),
  ]);
  const occRows = check(occ) as Array<{ employee_id: string; occurrence_date: string; end_date: string | null; quantity: number | null; unit: string; occurrence_types: { code: string } | null }>;
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
    if (["falta", "folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"].includes(code)) get(o.employee_id).absence += min;
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
