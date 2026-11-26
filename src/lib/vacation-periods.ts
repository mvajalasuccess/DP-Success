import { isSettlementOnly } from "@/lib/vacation-settlement";

export type Vacation = {
  id: string;
  employee_id: string;
  title: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
  acquisition_start_date?: string | null;
  acquisition_end_date?: string | null;
  concession_start_date?: string | null;
  concession_end_date?: string | null;
  official_gozo_start_date?: string | null;
  official_gozo_end_date?: string | null;
  termination_paid?: boolean | null;
  leave_type?: string | null;
  days_quantity?: number | string | null;
  entitled_days?: number | string | null;
  employees?: { full_name: string } | null;
};

export type Employee = {
  id: string;
  full_name: string;
  status?: string | null;
  termination_date?: string | null;
  hire_date?: string | null;
  company_id?: string | null;
};

function addMonths(iso: string, months: number) {
  const [year = 0, month = 1, day = 1] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, last)))
    .toISOString().slice(0, 10);
}

export function proportionalEntitlement(start: string, end: string) {
  if (!start || !end || end < start) return 30;
  let months = 0;
  let cursor = start;
  while (months < 12) {
    const next = addMonths(start, months + 1);
    if (next > end) break;
    months++;
    cursor = next;
  }
  const remaining = Math.floor((Date.parse(end + "T00:00:00Z") - Date.parse(cursor + "T00:00:00Z")) / 86400000) + 1;
  if (remaining >= 15) months++;
  return Math.min(30, months * 2.5);
}

export function entitledOf(rows: Vacation[], fallbackStart?: string, fallbackEnd?: string) {
  const stored = rows.map(row => row.entitled_days).filter(value => value != null && value !== "")
    .map(Number).filter(Number.isFinite);
  if (stored.length) return Math.max(...stored);
  const period = rows.find(row => row.acquisition_start_date && row.acquisition_end_date);
  const start = period?.acquisition_start_date || fallbackStart;
  const end = period?.acquisition_end_date || fallbackEnd;
  return start && end ? proportionalEntitlement(start, end) : 30;
}

export function shiftDate(iso: string, days: number) {
  const date = new Date(iso + "T12:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function addYears(iso: string, years: number) {
  const [year, month, day] = iso.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return iso;
  const targetYear = year + years;
  const last = new Date(targetYear, month, 0).getDate();
  return String(targetYear) + "-" + String(month).padStart(2, "0") + "-" + String(Math.min(day, last)).padStart(2, "0");
}

function makeEntitlement(employee: Employee, cycle: number) {
  const acquisitionStart = addYears(employee.hire_date!, cycle);
  const nextAnniversary = addYears(employee.hire_date!, cycle + 1);
  return {
    employee, cycle: cycle + 1, acquisitionStart,
    acquisitionEnd: shiftDate(nextAnniversary, -1),
    concessionStart: nextAnniversary,
    concessionEnd: shiftDate(addYears(employee.hire_date!, cycle + 2), -1),
  };
}

const calendarDayCount = (start: string, end: string) =>
  Math.max(1, Math.round((new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) / 86400000) + 1);

export const dayCount = (a:string,b:string) => {
  if (b < a) return 0;
  // Blocos iniciados a partir de 21/12/2023 contam dias corridos, incluindo feriados.
  if (a >= "2023-12-21") return calendarDayCount(a,b);
  // Para blocos iniciados antes de 21/12/2023, mantém-se a regra histórica:
  // Natal (25/12) e Ano-Novo (01/01) não consomem dias do bloco.
  const start = new Date(a+"T00:00:00Z");
  const end = new Date(b+"T00:00:00Z");
  let total = 0;
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate()+1)) {
    const month = date.getUTCMonth()+1;
    const day = date.getUTCDate();
    if (!((month === 12 && day === 25) || (month === 1 && day === 1))) total++;
  }
  return total;
};
export const isVacationLeave=(p:{leave_type?:string|null})=>(p.leave_type||"ferias")==="ferias";
export function blockDays(period: Vacation) {
  const quantity = period.days_quantity == null ? null : Number(period.days_quantity);
  const start = period.start_date || period.official_gozo_start_date;
  const end = period.end_date || period.official_gozo_end_date;
  if (quantity != null && Number.isFinite(quantity)) return quantity;
  return start && end ? dayCount(start, end) : 0;
}
export const blockKey=(p:Vacation)=>(p.start_date||p.official_gozo_start_date)+"|"+(p.end_date||p.official_gozo_end_date)+"|"+(p.leave_type||"ferias");

export const startOf = (period: Vacation) => isSettlementOnly(period) ? "" : period.start_date || period.official_gozo_start_date || "";
export const endOf = (period: Vacation) => isSettlementOnly(period) ? "" : period.end_date || period.official_gozo_end_date || "";

export function getRegisteredVacationBlocks(periods: Vacation[]) {
  return [...new Map(periods.filter(isVacationLeave).filter(period => startOf(period) && endOf(period))
    .map(period => [blockKey(period), period])).values()];
}

export function getVacationCycles(employee: Employee, periods: Vacation[], through: string) {
  if (!employee.hire_date) return [];
  const employeePeriods = periods.filter(period => period.employee_id === employee.id);
  const cycles = [];
  for (let index = 0; index < 60; index++) {
    const generated = makeEntitlement(employee, index);
    if (generated.acquisitionStart > through) break;
    const saved = employeePeriods.find(period =>
      period.acquisition_start_date && period.acquisition_end_date &&
      period.acquisition_start_date <= generated.acquisitionEnd &&
      period.acquisition_end_date >= generated.acquisitionStart);
    const cycle = saved ? {
      ...generated,
      acquisitionStart: saved.acquisition_start_date!,
      acquisitionEnd: saved.acquisition_end_date!,
      concessionStart: saved.concession_start_date || shiftDate(saved.acquisition_end_date!, 1),
      concessionEnd: saved.concession_end_date || shiftDate(addYears(saved.concession_start_date || shiftDate(saved.acquisition_end_date!, 1), 1), -1),
    } : generated;
    const vacations = employeePeriods.filter(period => period.acquisition_start_date === cycle.acquisitionStart);
    cycles.push({ ...cycle, vacations });
  }
  return cycles;
}
