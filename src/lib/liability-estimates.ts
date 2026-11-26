import {
  addMonths, blockDays, entitledOf, getRegisteredVacationBlocks, getVacationCycles, proportionalEntitlement,
  type Employee, type Vacation,
} from "@/lib/vacation-periods";

export type LiabilityEmployee = Employee & { salary: number | null };

export function employmentEnd(employee: LiabilityEmployee, reference: string): string | null {
  if (employee.termination_date && employee.termination_date < reference) return employee.termination_date;
  if (!employee.termination_date && employee.status?.trim().toLowerCase() === "inativo") return null;
  return reference;
}

function countFgtsMonths(start: string, end: string): number {
  if (end < start) return 0;
  const [startYear, startMonth] = start.split("-").map(Number);
  const [endYear, endMonth] = end.split("-").map(Number);
  const elapsedMonths = (endYear! - startYear!) * 12 + endMonth! - startMonth!;
  return elapsedMonths - (addMonths(start, elapsedMonths) > end ? 1 : 0);
}

export function countThirteenthMonths(start: string, end: string, year: number): number {
  if (!start || !end || end < start) return 0;
  const dayMilliseconds = 86400000;
  let count = 0;
  for (let month = 0; month < 12; month++) {
    const first = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    const from = start > first ? start : first;
    const to = end < last ? end : last;
    if (from <= to && (Date.parse(to) - Date.parse(from)) / dayMilliseconds + 1 >= 15) count++;
  }
  return count;
}

function getVacationDays(employee: LiabilityEmployee, records: Vacation[], through: string) {
  const cyclesByStart = new Map(getVacationCycles(employee, records, through)
    .filter(period => period.acquisitionStart <= through).map(period => [period.acquisitionStart, period]));
  const periods = [...cyclesByStart.values()].map(period => {
    const registeredDays = getRegisteredVacationBlocks(period.vacations).reduce((sum, row) => sum + blockDays(row), 0);
    const entitlement = Math.max(0, entitledOf(period.vacations, period.acquisitionStart, period.acquisitionEnd));
    const inProgress = through < period.acquisitionEnd;
    const accrued = inProgress
      ? Math.min(entitlement, proportionalEntitlement(period.acquisitionStart, through))
      : entitlement;
    const paid = period.vacations.some(row => row.termination_paid);
    const balanceDays = paid ? 0 : Math.max(0, accrued - registeredDays);
    return { start: period.acquisitionStart, end: period.acquisitionEnd, accrued, registeredDays, paid, inProgress, balanceDays };
  });
  let openDays = 0;
  let proportionalDays = 0;
  for (const period of periods) {
    if (period.inProgress) proportionalDays += period.balanceDays;
    else openDays += period.balanceDays;
  }
  return { openDays, proportionalDays, periods: periods.filter(period => period.balanceDays > 0) };
}

export function calculateLiability(employee: LiabilityEmployee, records: Vacation[], reference: string) {
  const end = employmentEnd(employee, reference);
  const hasSalary = employee.salary != null && Number.isFinite(Number(employee.salary)) && Number(employee.salary) > 0;
  const salary = hasSalary ? Math.round(Number(employee.salary) * 100) : null;
  const estimatesByDate = end && employee.hire_date ? {
    months: countThirteenthMonths(employee.hire_date, end, Number(reference.slice(0, 4))),
    fgtsMonths: countFgtsMonths(employee.hire_date, end),
    ...getVacationDays(employee, records, end),
  } : null;
  const monthlyFgts = salary === null ? null : Math.round(salary * 0.08);
  const fgts = monthlyFgts === null || !estimatesByDate ? null : monthlyFgts * estimatesByDate.fgtsMonths;
  const fine = fgts === null ? null : Math.round(fgts * 0.4);
  const thirteenth = salary === null || !estimatesByDate ? null : Math.round(salary * estimatesByDate.months / 12);
  const vacation = salary === null || !estimatesByDate ? null :
    Math.round(salary * (estimatesByDate.openDays + estimatesByDate.proportionalDays) / 30);
  const third = vacation === null ? null : Math.round(vacation / 3);
  const total = fine === null || thirteenth === null || vacation === null || third === null
    ? null : fine + thirteenth + vacation + third;
  return { employee, salary, monthlyFgts, fgts, fine, thirteenth, vacation, third, total, dates: estimatesByDate };
}
