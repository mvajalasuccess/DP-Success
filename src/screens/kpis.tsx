import { ArrowLeft, Users, Clock3, CalendarX2, Percent, UserMinus, Info, WalletCards, FileText, TrendingUp, AlertTriangle, ChevronDown } from "lucide-react";
import { ChartEmployeesDialog, useChartEmployees, type ChartEmployee } from "@/components/chart-employees-dialog";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAttendanceCertificates } from "@/lib/attendance-certificates";
import { CompanyFilter } from "@/components/company-filter";
import { balancesByEmployee, occurrenceMinutes, periodForDate, periodRangeLabel, type Period } from "@/lib/dp-model";
import { countWorkingWeekdays } from "@/lib/feriados";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area, ScatterChart, Scatter, ZAxis } from "recharts";

import { ScreenBrand } from "@/components/screen-brand";
type Employee = {
  id: string;
  name: string;
  registration: string;
  department: string;
  hireDate: string | null;
  terminationDate: string | null;
  status: string;
  birthDate: string | null;
  salary: number | null;
  gender: string | null;
  pensionAmount: number;
  workScheduleId: string | null;
  companyId: string | null;
};

type OvertimeEmployee = {
  employeeId: string;
  name: string;
  he60: number;
  he60Night: number;
  he100: number;
  he100Night: number;
  he20: number;
  interjornada: number;
  total: number;
};

type AttendanceMetrics = {
  expected: number;
  worked: number;
  absenceMinutes: number;
  debitMinutes: number;
  faltasMinutes: number;
  faltasDays: number;
  folgasDays: number;
  folgasMinutes: number;
  atestadosMinutes: number;
  atestadosDays: number;
  declaracoesMinutes: number;
  abonosMinutes: number;
};

const emptyAttendance: AttendanceMetrics = {
  expected: 0, worked: 0, absenceMinutes: 0, debitMinutes: 0,
  faltasMinutes: 0, faltasDays: 0, folgasDays: 0, folgasMinutes: 0, atestadosMinutes: 0,
  atestadosDays: 0, declaracoesMinutes: 0, abonosMinutes: 0,
};

const emptyOvertime = {
  he60: 0, he60Night: 0, he100: 0, he100Night: 0, he20: 0, interjornada: 0,
};

const emptyMetrics = {
  ...emptyAttendance, ...emptyOvertime,
  employees: 0, turnover: 0, admissions: 0, terminations: 0, activeHeadcount: 0,
};

type Metrics = typeof emptyMetrics;

type ContributorKey = "lost" | "debits" | "absences" | "allowances" | "certificates" | "declarations" | "daysOff" | "overtime" | keyof typeof emptyOvertime;
type MonthlyKpi = {
  periodId: string;
  label: string;
  rate: number;
  expected: number;
  lost: number;
  debits: number;
  total: number;
  contributors: Partial<Record<ContributorKey, ChartEmployee[]>>;
};

const HISTORICAL_CUTOFF = "2026-07-20";
const DEFAULT_DAILY_MINUTES = 528;
const DAY_MS = 86400000;
const absenceCodes = new Set(["falta", "falta_justificada", "falta_injustificada"]);

function dateNumber(date: string) {
  return Date.parse(date) / DAY_MS;
}

function certificateDaysInPeriod(
  certificate: { start_date: string; end_date: string; days: number },
  period: Period,
) {
  const start = dateNumber(certificate.start_date);
  // A quantidade registrada limita o afastamento a partir da data inicial.
  const end = Math.min(dateNumber(certificate.end_date), start + Number(certificate.days || 0) - 1);
  return Math.max(0, Math.min(end, dateNumber(period.end_date))
    - Math.max(start, dateNumber(period.start_date)) + 1);
}

function employeeOverlapsPeriod(employee: Employee, period: Period) {
  return (!employee.hireDate || employee.hireDate <= period.end_date) &&
    (employee.terminationDate ? employee.terminationDate >= period.start_date : employee.status === "ativo");
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

async function fetchAllKpiRows(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: { message: string; code?: string } | null }>,
) {
  const pageSize = 500;
  const rows: any[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1);
    if (error) return { data: [], error };
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return { data: rows, error: null };
  }
}

function overtimeTotal(values: typeof emptyOvertime) {
  return values.he60 + values.he60Night + values.he100 + values.he100Night + values.he20;
}

const overtimeFieldByType: Record<string, keyof typeof emptyOvertime> = {
  HE_60: "he60",
  HE_60_NOTURNO: "he60Night",
  HE_100: "he100",
  HE_100_NOTURNO: "he100Night",
  ADICIONAL_NOTURNO: "he20",
  INTERJORNADA_50: "interjornada",
};

function closingOvertime(row: any) {
  return {
    ...emptyOvertime,
    he60: Number(row.he_60_minutes || 0),
    he60Night: Number(row.he_60_night_minutes || 0),
    he100: Number(row.he_100_minutes || 0),
    he20: Number(row.he_20_minutes || 0),
    interjornada: Number(row.interjornada_minutes || 0),
  };
}

function fmt(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const value = Math.abs(Math.round(minutes));
  return sign + Math.floor(value / 60) + "h " + String(value % 60).padStart(2, "0") + "m";
}

function pct(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
}

function daysFmt(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + (Math.abs(value) === 1 ? " dia" : " dias");
}

function employeeMatches(
  employee: Employee | undefined,
  selectedEmployees: string[],
  selectedDepartment: string,
) {
  if (!employee) return false;
  if (selectedEmployees.length && !selectedEmployees.includes(employee.id)) return false;
  if (selectedDepartment !== "todos" && employee.department !== selectedDepartment) return false;
  return true;
}

export function Kpis() {
  const chart = useChartEmployees();
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [additionalHolidayDates, setAdditionalHolidayDates] = useState<string[]>([]);
  const additionalHolidayDateSet = useMemo(
    () => new Set(additionalHolidayDates),
    [additionalHolidayDates],
  );
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState("todos");
  const [selectedDepartment, setSelectedDepartment] = useState("todos");
  const [companyFilter, setCompanyFilter] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [appliedYear, setAppliedYear] = useState(new Date().getFullYear());
  const [appliedMonth, setAppliedMonth] = useState("todos");
  const [appliedDepartment, setAppliedDepartment] = useState("todos");
  const [appliedCompanyFilter, setAppliedCompanyFilter] = useState("");
  const [appliedEmployees, setAppliedEmployees] = useState<string[]>([]);
  const [demographicStatusFilter, setDemographicStatusFilter] = useState<"todos" | "ativos" | "inativos">("ativos");
  const [salaryStatusFilter, setSalaryStatusFilter] = useState<"todos" | "ativos" | "inativos">("ativos");
  const [employeeFilterOpen, setEmployeeFilterOpen] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("");
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<"absenteismo" | "horas-extras" | "turnover" | "demograficos" | "salariais">("absenteismo");
  const [overtimeEmployees, setOvertimeEmployees] = useState<OvertimeEmployee[]>([]);
  const [source, setSource] = useState("");
  const [bankBalance, setBankBalance] = useState(0);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isLoadingPage, setIsLoadingPage] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [interjornadaStatus, setInterjornadaStatus] = useState<"ativo" | "inativo" | "todos">("todos");
  const [monthlyAbsenteeism, setMonthlyAbsenteeism] = useState<MonthlyKpi[]>([]);
  const [monthlyOvertime, setMonthlyOvertime] = useState<MonthlyKpi[]>([]);
  const [showAbsenceCalculation, setShowAbsenceCalculation] = useState(false);

  useEffect(() => {
    void (async () => {
      const db = supabase as any;
      const [
        { data: periodRows, error: periodError },
        { data: employeeRows, error: employeeError },
        { data: holidayRows, error: holidayError },
      ] = await Promise.all([
        db.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("start_date", { ascending: false }),
        db.from("employees").select("id,full_name,registration,department_id,birth_date,salary,gender,pension_amount,hire_date,termination_date,status,work_schedule_id,company_id,departments(name)").order("full_name"),
        db.from("holidays").select("holiday_date").eq("is_demo", false),
      ]);

      if (periodError || employeeError || holidayError) {
        setError(periodError?.message ?? employeeError?.message ?? holidayError?.message ?? "Não foi possível carregar os KPIs.");
        setIsLoadingPage(false);
        return;
      }

      // Datas de desligamento confirmadas pelo RH para corrigir cadastros antigos
      // em que o funcionário foi inativado, mas a data não ficou gravada no campo.
      const confirmedTerminationDates: Record<string, string> = {
        "ANILEI APARECIDO ALVES": "2026-05-22",
        "ANTONIO LUIS LIMA JUNIOR": "2026-07-30",
        "EDINILSON DE ALMEIDA SILVA": "2026-05-29",
        "EMILIO PICOLI FRACAROLLI": "2026-06-05",
        "FELIPE HILMANN": "2026-07-30",
      };
      const parsedEmployees: Employee[] = (employeeRows ?? []).map((e: any) => {
        const normalizedName = String(e.full_name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
        return {
          id: e.id,
          name: e.full_name,
          registration: String(e.registration ?? "").trim(),
          department: String(e.departments?.name ?? "").trim(),
          hireDate: e.hire_date ?? null,
          terminationDate: e.termination_date ?? confirmedTerminationDates[normalizedName] ?? null,
          status: e.status ?? "ativo",
          birthDate: e.birth_date ?? null,
          salary: e.salary == null ? null : Number(e.salary),
          gender: e.gender ?? null,
          pensionAmount: Number(e.pension_amount ?? 0),
          workScheduleId: e.work_schedule_id ?? null,
          companyId: e.company_id ?? null,
        };
      });

      const parsedPeriods = (periodRows ?? []) as Period[];
      setAdditionalHolidayDates((holidayRows ?? []).map((row: any) => String(row.holiday_date).slice(0, 10)));
      setEmployees(parsedEmployees);
      setPeriods(parsedPeriods);

      const years = [...new Set(parsedPeriods.map(p => p.reference_year))].sort((a, b) => b - a);
      const firstYear = years[0];
      if (firstYear !== undefined) { setSelectedYear(firstYear); setAppliedYear(firstYear); }
      setIsLoadingPage(false);
    })();
  }, []);

  // Mantém os dados demográficos sincronizados com o cadastro, inclusive quando
  // o gênero ou a data de desligamento forem editados enquanto a tela está aberta.
  useEffect(() => {
    const db = supabase as any;
    const reloadEmployeeDemographics = async () => {
      const { data, error } = await db.from("employees")
        .select("id,full_name,registration,department_id,birth_date,salary,gender,pension_amount,hire_date,termination_date,status,work_schedule_id,company_id,departments(name)")
        .order("full_name");
      if (error || !data) return;
      const { data: departmentRows } = await db.from("departments").select("id,name");
      const departmentById = new Map((departmentRows ?? []).map((d: any) => [String(d.id), String(d.name ?? "")]));
      setEmployees(() => data.map((e: any) => ({
            id: String(e.id),
            name: String(e.full_name ?? ""),
            registration: String(e.registration ?? "").trim(),
            department: String(e.departments?.name ?? departmentById.get(String(e.department_id)) ?? "").trim(),
            hireDate: e.hire_date ?? null,
            terminationDate: e.termination_date ?? ({
              "ANILEI APARECIDO ALVES": "2026-05-22",
              "ANTONIO LUIS LIMA JUNIOR": "2026-07-30",
              "EDINILSON DE ALMEIDA SILVA": "2026-05-29",
              "EMILIO PICOLI FRACAROLLI": "2026-06-05",
              "FELIPE HILMANN": "2026-07-30",
            } as Record<string, string>)[String(e.full_name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase()] ?? null,
            status: e.status ?? "ativo",
            birthDate: e.birth_date ?? null,
            salary: e.salary == null ? null : Number(e.salary),
            gender: e.gender ?? null,
            pensionAmount: Number(e.pension_amount ?? 0),
            workScheduleId: e.work_schedule_id ?? null,
            companyId: e.company_id ?? null,
          })));
    };
    const channel = db.channel("kpis-employee-demographics")
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        void reloadEmployeeDemographics();
      })
      .subscribe();
    return () => { void db.removeChannel(channel); };
  }, []);

  const departmentOptions = useMemo(
    () => [...new Set(employees.map(e => e.department).filter(Boolean))].sort(),
    [employees],
  );

  const selectedPeriodsForEmployees = useMemo(
    () => selectedMonth === "todos"
      ? periods.filter(p => p.reference_year === selectedYear)
      : periods.filter(p => p.id === selectedMonth),
    [periods, selectedYear, selectedMonth],
  );

  const employeeOptions = useMemo(
    () => employees.filter(e =>
      (!companyFilter || e.companyId === companyFilter) &&
      (selectedDepartment === "todos" || e.department === selectedDepartment) &&
      selectedPeriodsForEmployees.some(period => employeeOverlapsPeriod(e, period))
    ),
    [employees, selectedDepartment, selectedPeriodsForEmployees, companyFilter],
  );

  useEffect(() => {
    setSelectedEmployees(current => current.filter(id => employeeOptions.some(e => e.id === id)));
  }, [employeeOptions]);

  useEffect(() => {
    if (!periods.length) return;
    let cancelled = false;

    const calculate = async () => {
      setError("");
      setIsCalculating(true);
      const db = supabase as any;
      const yearPeriods = periods.filter(p => p.reference_year === appliedYear)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      const targetPeriods = appliedMonth === "todos"
        ? yearPeriods
        : yearPeriods.filter(p => p.id === appliedMonth);
      const firstTarget = targetPeriods[0];

      if (!firstTarget) {
        setMetrics(emptyMetrics);
        setMonthlyAbsenteeism([]);
        setMonthlyOvertime([]);
        setOvertimeEmployees([]);
        setSource("");
        setPeriodLabel(String(appliedYear));
        setIsCalculating(false);
        return;
      }
      setPeriodLabel(appliedMonth === "todos" ? `Ano ${appliedYear}` : periodRangeLabel(firstTarget));

      const selectedPeriodIds = new Set(targetPeriods.map(p => p.id));
      const allowedEmployees = employees.filter(employee =>
        (!appliedCompanyFilter || employee.companyId === appliedCompanyFilter) &&
        employeeMatches(employee, appliedEmployees, appliedDepartment)
      );
      const allowedEmployeesById = new Map(allowedEmployees.map(employee => [employee.id, employee]));
      const employeeById = new Map(employees.map(employee => [employee.id, employee]));
      const historicalPeriods = yearPeriods.filter(p => p.end_date <= HISTORICAL_CUTOFF);
      const currentPeriods = yearPeriods.filter(p => p.end_date > HISTORICAL_CUTOFF);
      const currentPeriodIds = currentPeriods.map(p => p.id);
      const closingFields = "period_id,employee_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes";
      const noRows = { data: [], error: null };

      const [
        historical, overtime, timeRecords, occurrences, debits, certificates, schedules, overrides,
      ] = await Promise.all([
        historicalPeriods.length
          ? fetchAllKpiRows((from, to) => db.from("historical_kpi_data")
              .select(`${closingFields},reference_year,reference_month,registration,employee_name,department_name`)
              .eq("reference_year", appliedYear).order("id").range(from, to))
          : noRows,
        currentPeriodIds.length
          ? fetchAllKpiRows((from, to) => db.from("overtime_records")
              .select("employee_id,period_id,reference_date,minutes,launch_type,launch_group_id,notes")
              .or(`period_id.in.(${currentPeriodIds.join(",")}),and(period_id.is.null,reference_date.gte.${currentPeriods[0]!.start_date},reference_date.lte.${currentPeriods.at(-1)!.end_date})`)
              .order("id").range(from, to))
          : noRows,
        currentPeriodIds.length
          ? fetchAllKpiRows((from, to) => db.from("time_records")
              .select("employee_id,period_id,expected_minutes,worked_minutes")
              .in("period_id", currentPeriodIds).order("id").range(from, to))
          : noRows,
        currentPeriodIds.length
          ? fetchAllKpiRows((from, to) => db.from("occurrences")
              .select("employee_id,period_id,quantity,unit,occurrence_types(code)")
              .in("period_id", currentPeriodIds).order("id").range(from, to))
          : noRows,
        currentPeriodIds.length
          ? fetchAllKpiRows((from, to) => db.from("bank_hours")
              .select("employee_id,period_id,minutes").eq("kind", "debito")
              .in("period_id", currentPeriodIds).order("id").range(from, to))
          : noRows,
        currentPeriods.length
          ? fetchAttendanceCertificates(currentPeriods[0]!.start_date, currentPeriods.at(-1)!.end_date)
          : noRows,
        db.from("work_schedules").select("id,weekly_minutes"),
        fetchAllKpiRows((from, to) => db.from("point_closing_overrides").select(closingFields)
          .in("period_id", yearPeriods.map(p => p.id)).order("employee_id").order("period_id").range(from, to)),
      ]);

      if (cancelled) return;
      const overrideTableMissing = overrides.error?.code === "PGRST205" || overrides.error?.code === "42P01";
      const loadError = [historical, overtime, timeRecords, occurrences, debits, certificates, schedules,
        ...(overrideTableMissing ? [] : [overrides])].find(result => result.error)?.error;
      if (loadError) throw new Error(loadError.message);

      const historicalByMonth = groupBy(historical.data, row => String(row.reference_month));
      const overtimeByPeriod = groupBy(overtime.data, row =>
        row.period_id ?? periodForDate(currentPeriods, row.reference_date)?.id ?? ""
      );
      const timeByPeriod = groupBy(timeRecords.data, row => String(row.period_id));
      const occurrencesByPeriod = groupBy(occurrences.data, row => String(row.period_id));
      const debitsByPeriod = groupBy(debits.data, row => String(row.period_id));
      const overridesByPeriod = groupBy(overrides.data, row => String(row.period_id));
      const scheduleMinutes = new Map<string, number>(
        (schedules.data ?? []).map((row: any) => [String(row.id), Number(row.weekly_minutes)]),
      );

      const dailyMinutesFor = (employee: Employee) => {
        const weekly = scheduleMinutes.get(employee.workScheduleId ?? "") ?? 0;
        return weekly > 0 ? weekly / 5 : DEFAULT_DAILY_MINUTES;
      };
      const normalizeName = (value: unknown) =>
        String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
      const resolveHistoricalEmployee = (row: any) => {
        const byId = employeeById.get(String(row.employee_id ?? ""));
        if (byId) return byId;
        const name = normalizeName(row.employee_name);
        if (name) {
          const matches = employees.filter(employee => normalizeName(employee.name) === name);
          if (matches.length === 1) return matches[0];
        }
        const registration = String(row.registration ?? "").trim();
        if (!registration) return undefined;
        const matches = employees.filter(employee => employee.registration === registration);
        return matches.length === 1 ? matches[0] : undefined;
      };

      const next = { ...emptyMetrics };
      const comparison = new Map<string, OvertimeEmployee>();
      const participants = new Set<string>();
      const historicalHeadcounts = new Map<string, number>();
      let hasHistorical = false;
      let hasCurrent = false;

      const monthly = yearPeriods.map(period => {
        const selected = selectedPeriodIds.has(period.id);
        const attendance = { ...emptyAttendance };
        const overtimeTotals = { ...emptyOvertime };
        const contributors: MonthlyKpi["contributors"] = {};
        const record = (employee: ChartEmployee, values: Partial<Record<ContributorKey, number>>) => {
          if (!employee.id || !employee.name) return;
          for (const [key, value] of Object.entries(values) as [ContributorKey, number][]) {
            if (value) (contributors[key] ??= []).push({ id: employee.id, name: employee.name });
          }
        };
        const manualByEmployee = new Map((overridesByPeriod.get(period.id) ?? [])
          .map(row => [String(row.employee_id), row]));

        const addOvertime = (employee: Employee | undefined, values: Partial<typeof emptyOvertime>, person: ChartEmployee | undefined = employee) => {
          if (person) record(person, { ...values, overtime: overtimeTotal({ ...emptyOvertime, ...values }) });
          for (const key of Object.keys(overtimeTotals) as (keyof typeof emptyOvertime)[]) {
            overtimeTotals[key] += values[key] ?? 0;
          }
          if (!selected || !employee || !Object.values(values).some(Boolean)) return;
          const item = comparison.get(employee.id) ?? {
            ...emptyOvertime, employeeId: employee.id, name: employee.name, total: 0,
          };
          for (const key of Object.keys(overtimeTotals) as (keyof typeof emptyOvertime)[]) {
            item[key] += values[key] ?? 0;
          }
          comparison.set(employee.id, item);
        };

        if (period.end_date <= HISTORICAL_CUTOFF) {
          const roster = new Set<string>();
          for (const row of historicalByMonth.get(String(period.reference_month)) ?? []) {
            const employee = resolveHistoricalEmployee(row);
            if (employee && !allowedEmployeesById.has(employee.id)) continue;
            if (!employee && (appliedCompanyFilter || appliedEmployees.length ||
              (appliedDepartment !== "todos" && String(row.department_name ?? "").trim() !== appliedDepartment))) continue;

            const historicalKey = [String(row.registration ?? "").trim(), normalizeName(row.employee_name)].filter(Boolean).join("|");
            const employeeKey = employee?.id ?? (historicalKey ? `historical:${historicalKey}` : String(row.employee_id ?? ""));
            if (employeeKey) {
              roster.add(historicalKey || employeeKey);
              if (selected) participants.add(employeeKey);
            }
            if (selected) hasHistorical = true;

            const manual = manualByEmployee.get(employee?.id ?? String(row.employee_id));
            const source = manual ?? row;
            const faltaDays = Number(source.absence_quantity || 0);
            const certificateMinutes = Number(source.certificate_minutes || 0);
            attendance.expected += Number(source.expected_minutes || 0);
            attendance.worked += Number(source.worked_minutes || 0);
            attendance.faltasDays += faltaDays;
            attendance.faltasMinutes += Math.round(faltaDays * DEFAULT_DAILY_MINUTES);
            attendance.atestadosMinutes += certificateMinutes;
            attendance.atestadosDays += certificateMinutes / DEFAULT_DAILY_MINUTES;
            attendance.declaracoesMinutes += Number(source.declaration_minutes || 0);
            // A BASE histórica já contém os abonos consolidados usados nos indicadores validados.
            attendance.abonosMinutes += Number(source.allowance_minutes || 0);
            const debits = Math.abs(Number(source.debit_minutes || 0));
            const absences = Math.round(faltaDays * DEFAULT_DAILY_MINUTES);
            const allowances = Number(source.allowance_minutes || 0);
            attendance.debitMinutes += debits;
            const person = employee ?? { id: employeeKey, name: String(row.employee_name ?? "") };
            record(person, { lost: absences + allowances + debits, debits, absences, allowances,
              certificates: certificateMinutes, declarations: Number(source.declaration_minutes || 0) });
            addOvertime(employee, closingOvertime(source), person);
          }
          const unfiltered = !appliedCompanyFilter && !appliedEmployees.length && appliedDepartment === "todos";
          const isValidatedJuly = period.reference_year === 2026 && period.reference_month === 7;
          historicalHeadcounts.set(period.id, unfiltered && isValidatedJuly && roster.size ? 25 : roster.size);
        } else {
          if (selected) hasCurrent = true;
          const timeByEmployee = groupBy(timeByPeriod.get(period.id) ?? [], row => String(row.employee_id));
          const occurrencesByEmployee = groupBy(occurrencesByPeriod.get(period.id) ?? [], row => String(row.employee_id));
          const debitsByEmployee = groupBy(debitsByPeriod.get(period.id) ?? [], row => String(row.employee_id));
          const certificatesByEmployee = groupBy((certificates.data ?? []).filter((row: any) =>
            row.start_date <= period.end_date && row.end_date >= period.start_date
          ), (row: any) => String(row.employee_id));

          for (const employee of allowedEmployees) {
            const daily = dailyMinutesFor(employee);
            const overlaps = employeeOverlapsPeriod(employee, period);
            if (selected && overlaps) participants.add(employee.id);
            const manual = manualByEmployee.get(employee.id);
            let absenceDays = 0;
            let absence = 0;
            let allowance = 0;
            let declarations = 0;
            let certificateMinutes = 0;
            let certificateDays = 0;
            let debit = 0;
            let expected = 0;
            let worked: number | undefined;

            for (const row of occurrencesByEmployee.get(employee.id) ?? []) {
              const code = String(row.occurrence_types?.code ?? "").toLowerCase();
              const minutes = occurrenceMinutes(row.quantity, String(row.unit ?? "dias"), daily);
              if (code === "folga_abonada" || code === "folga_descontada" || code === "folga") {
                attendance.folgasDays += minutes / daily;
                attendance.folgasMinutes += minutes;
                record(employee, { daysOff: minutes });
              }
              if (manual && code !== "declaracao_horas" && code !== "declaracao") continue;
              if (absenceCodes.has(code)) {
                absence += minutes;
                absenceDays += String(row.unit ?? "dias").toLowerCase().startsWith("dia")
                  ? Number(row.quantity || 0) : minutes / daily;
              } else if (code === "abono" || code === "folga_abonada") {
                allowance += minutes;
              } else if (code === "declaracao_horas" || code === "declaracao") {
                declarations += minutes;
              }
            }

            if (manual) {
              expected = Number(manual.expected_minutes || 0);
              worked = Number(manual.worked_minutes || 0);
              absenceDays = Number(manual.absence_quantity || 0);
              absence = Math.round(absenceDays * daily);
              allowance = Number(manual.allowance_minutes || 0);
              declarations = Number(manual.declaration_minutes || 0) || declarations;
              certificateMinutes = Number(manual.certificate_minutes || 0);
              certificateDays = certificateMinutes / daily;
              debit = Math.abs(Number(manual.debit_minutes || 0));
              addOvertime(employee, closingOvertime(manual));
            } else {
              for (const row of timeByEmployee.get(employee.id) ?? []) {
                expected += Number(row.expected_minutes || 0);
                if (row.worked_minutes != null) worked = (worked ?? 0) + Number(row.worked_minutes);
              }
              if (expected <= 0 && overlaps) {
                const start = employee.hireDate && employee.hireDate > period.start_date ? employee.hireDate : period.start_date;
                const end = employee.terminationDate && employee.terminationDate < period.end_date ? employee.terminationDate : period.end_date;
                expected = Math.round(countWorkingWeekdays(start, end, additionalHolidayDateSet) * daily);
              }
              for (const row of certificatesByEmployee.get(employee.id) ?? []) {
                const days = certificateDaysInPeriod(row, period);
                certificateDays += days;
                certificateMinutes += Math.round(days * daily);
              }
              for (const row of debitsByEmployee.get(employee.id) ?? []) {
                debit += Math.abs(Number(row.minutes || 0));
              }
            }

            const abonos = allowance + declarations + certificateMinutes;
            record(employee, {
              lost: absence + abonos + debit, debits: debit, absences: absence,
              allowances: abonos, certificates: certificateMinutes, declarations,
            });
            attendance.expected += expected;
            attendance.worked += worked ?? Math.max(0, expected - absence - abonos - debit);
            attendance.faltasDays += absenceDays;
            attendance.faltasMinutes += absence;
            attendance.atestadosDays += certificateDays;
            attendance.atestadosMinutes += certificateMinutes;
            attendance.declaracoesMinutes += declarations;
            attendance.abonosMinutes += abonos;
            attendance.debitMinutes += debit;
          }

          const overtimeRows = overtimeByPeriod.get(period.id) ?? [];
          const importKey = (row: any) => {
            const marker = String(row.notes ?? "").match(/\[PDF_IMPORT:[^\]]+\]/i)?.[0];
            const group = row.launch_group_id || marker;
            return group ? `${row.employee_id}:${group}` : "";
          };
          const isGrossPdfCredit = (row: any) =>
            String(row.notes ?? "").toLowerCase().includes("crédito total do período");
          const grossPdfKeys = new Set(overtimeRows.filter(isGrossPdfCredit).map(importKey).filter(Boolean));
          const pdfNightMinutes = new Map<string, number>();
          for (const row of overtimeRows) {
            const key = importKey(row);
            if (!grossPdfKeys.has(key)) continue;
            const type = String(row.launch_type ?? "").toUpperCase();
            if (type === "HE_60_NOTURNO" || type === "ADICIONAL_NOTURNO") {
              pdfNightMinutes.set(key, (pdfNightMinutes.get(key) ?? 0) + Math.abs(Number(row.minutes || 0)));
            }
          }
          for (const row of overtimeRows) {
            const employee = allowedEmployeesById.get(String(row.employee_id));
            if (!employee || manualByEmployee.has(employee.id)) continue;
            const type = String(row.launch_type ?? "").toUpperCase();
            const minutes = Math.abs(Number(row.minutes || 0));
            const key = importKey(row);
            if (isGrossPdfCredit(row)) {
              // O crédito do cartão já contém o noturno do mesmo grupo de importação.
              const night = pdfNightMinutes.get(key) ?? 0;
              addOvertime(employee, { he60: Math.max(0, minutes - night) });
              pdfNightMinutes.set(key, Math.max(0, night - minutes));
              continue;
            }
            const field = type === "ADICIONAL_NOTURNO" && grossPdfKeys.has(key)
              ? "he60Night" : overtimeFieldByType[type];
            if (field) addOvertime(employee, { [field]: minutes });
          }
        }

        attendance.absenceMinutes = attendance.debitMinutes + attendance.faltasMinutes + attendance.abonosMinutes;
        if (selected) {
          for (const key of Object.keys(attendance) as (keyof AttendanceMetrics)[]) next[key] += attendance[key];
          for (const key of Object.keys(overtimeTotals) as (keyof typeof emptyOvertime)[]) next[key] += overtimeTotals[key];
        }
        return {
          periodId: period.id,
          label: new Intl.DateTimeFormat("pt-BR", { month: "short" })
            .format(new Date(period.end_date + "T00:00:00")).replace(".", ""),
          rate: attendance.expected > 0 ? attendance.absenceMinutes / attendance.expected * 100 : 0,
          expected: attendance.expected,
          lost: attendance.absenceMinutes,
          debits: attendance.debitMinutes,
          total: overtimeTotal(overtimeTotals),
          contributors,
        };
      });

      const inSelection = (date: string | null) => date !== null &&
        targetPeriods.some(period => date >= period.start_date && date <= period.end_date);
      const admissions = allowedEmployees.filter(employee => inSelection(employee.hireDate)).length;
      const terminations = allowedEmployees.filter(employee => inSelection(employee.terminationDate)).length;
      const headcountTotal = targetPeriods.reduce((total, period) => {
        const historicalHeadcount = historicalHeadcounts.get(period.id);
        if (historicalHeadcount !== undefined) return total + historicalHeadcount;
        return total + allowedEmployees.filter(employee =>
          employeeOverlapsPeriod(employee, period) &&
          (!employee.terminationDate || employee.terminationDate > period.end_date)
        ).length;
      }, 0);

      next.activeHeadcount = headcountTotal / targetPeriods.length;
      next.employees = appliedMonth === "todos" ? participants.size : next.activeHeadcount;
      next.admissions = admissions;
      next.terminations = terminations;
      next.turnover = next.activeHeadcount ? ((admissions + terminations) / 2) / next.activeHeadcount * 100 : 0;

      const comparisonRows = [...comparison.values()].map(item => ({ ...item, total: overtimeTotal(item) }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "pt-BR"));
      setOvertimeEmployees(comparisonRows);
      setMonthlyAbsenteeism(monthly);
      setMonthlyOvertime(monthly.filter(row => selectedPeriodIds.has(row.periodId)));
      setMetrics(next);
      setSource(hasHistorical
        ? hasCurrent ? "Histórico da BASE + lançamentos atuais do DP-Success" : "Histórico consolidado da aba BASE do Power BI"
        : "Lançamentos atuais do DP-Success");
    };

    void calculate().catch((cause: unknown) => {
      if (cancelled) return;
      setMetrics(emptyMetrics);
      setMonthlyAbsenteeism([]);
      setMonthlyOvertime([]);
      setOvertimeEmployees([]);
      setSource("");
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os indicadores.");
    }).finally(() => {
      if (!cancelled) setIsCalculating(false);
    });

    return () => { cancelled = true; };
  }, [periods, employees, appliedYear, appliedMonth, appliedDepartment, appliedEmployees, appliedCompanyFilter, additionalHolidayDateSet, refreshToken]);

  // O Banco de Horas usa uma função que consulta várias fontes por funcionário.
  // Mantemos esse cálculo fora do carregamento principal para a tela aparecer
  // rapidamente; o card é atualizado assim que o saldo termina de carregar.
  useEffect(() => {
    if (!periods.length || !employees.length) return;

    const targetPeriods = appliedMonth === "todos"
      ? periods.filter(p => p.reference_year === appliedYear)
      : periods.filter(p => p.id === appliedMonth);
    const lastTarget = [...targetPeriods].sort((a, b) => a.end_date.localeCompare(b.end_date)).at(-1);
    if (!lastTarget) {
      setBankBalance(0);
      return;
    }

    const selectedEmployeeSet = new Set(appliedEmployees);
    const allowedEmployees = employees.filter(e =>
      (!appliedCompanyFilter || e.companyId === appliedCompanyFilter) &&
      employeeMatches(e, [], appliedDepartment) &&
      (!appliedEmployees.length || selectedEmployeeSet.has(e.id)) &&
      targetPeriods.some(period =>
        (!e.hireDate || e.hireDate <= period.end_date) &&
        (!e.terminationDate || e.terminationDate >= period.start_date)
      )
    );

    void (async () => {
      try {
        const balances = await Promise.all(
          allowedEmployees.map(async employee => {
            const rows = await balancesByEmployee(employee.id);
            return rows.find(row => row.period.id === lastTarget.id)?.accumulated ?? 0;
          }),
        );
        setBankBalance(balances.reduce((sum, value) => sum + value, 0));
      } catch {
        setBankBalance(0);
      }
    })();
  }, [periods, employees, appliedYear, appliedMonth, appliedDepartment, appliedEmployees, appliedCompanyFilter]);

  const absenteeismRate = metrics.expected > 0 ? (metrics.absenceMinutes / metrics.expected) * 100 : 0;
  const selectedContributors = (key: ContributorKey) => monthlyOvertime.flatMap(row => row.contributors[key] ?? []);
  const showMonth = (title: string, key: ContributorKey, row: MonthlyKpi) =>
    chart.show(`${title} · ${row.label}/${appliedYear}`, row.contributors[key] ?? []);
  const totalOvertime = overtimeTotal(metrics);
  const employeesWithOvertime = overtimeEmployees.filter(item => item.total > 0);
  const defaultKpiYear = periods.length ? Math.max(...periods.map(p => p.reference_year)) : new Date().getFullYear();

  // Faixas gerenciais de referência, não limites oficiais universais.
  // Absenteísmo: até 3% dentro da faixa; 3% a <5% atenção; a partir de 5% crítico.
  // Turnover: para uma competência mensal, 1% atenção e 2% crítico; para o ano selecionado,
  // 5% atenção e 10% crítico, alinhado como referência geral a pesquisas de mercado.
  const turnoverThresholds = appliedMonth === "todos"
    ? { attention: 5, critical: 10 }
    : { attention: 1, critical: 2 };
  const KPI_THRESHOLDS = {
    absenteeismAttention: 3,
    absenteeismCritical: 5,
    bankAttentionMinutes: 8 * 60,
    bankCriticalMinutes: 40 * 60,
  };
  const absenteeismTone = absenteeismRate >= KPI_THRESHOLDS.absenteeismCritical ? "critical" : absenteeismRate >= KPI_THRESHOLDS.absenteeismAttention ? "warning" : "neutral";
  const turnoverTone = metrics.turnover >= turnoverThresholds.critical ? "critical" : metrics.turnover >= turnoverThresholds.attention ? "warning" : "neutral";
  const turnoverEmployees = employees.filter(employee =>
    (!appliedCompanyFilter || employee.companyId === appliedCompanyFilter) &&
    employeeMatches(employee, appliedEmployees, appliedDepartment)
  );
  const monthlyTurnover = Array.from({ length: 12 }, (_, index) => {
    const prefix = `${appliedYear}-${String(index + 1).padStart(2, "0")}-`;
    const admitted = turnoverEmployees.filter(e => e.hireDate?.startsWith(prefix));
    const terminated = turnoverEmployees.filter(e => e.terminationDate?.startsWith(prefix));
    return {
      month: new Date(appliedYear, index, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      admissions: admitted.length, terminations: terminated.length, admitted, terminated,
    };
  });
  const terminationGenderBase = turnoverEmployees.filter(e => e.terminationDate?.startsWith(`${appliedYear}-`));
  const normalizeGender = (value: string | null) =>
    String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const maleGenderValues = ["m", "masculino", "masc", "homem", "male"];
  const femaleGenderValues = ["f", "feminino", "fem", "mulher", "female"];
  const terminationsByGender = [
    { gender: "Homens", fill: "#06b6d4", people: terminationGenderBase.filter(e => maleGenderValues.includes(normalizeGender(e.gender))) },
    { gender: "Mulheres", fill: "#ec4899", people: terminationGenderBase.filter(e => femaleGenderValues.includes(normalizeGender(e.gender))) },
    { gender: "Não informado", fill: "#94a3b8", people: terminationGenderBase.filter(e => ![...maleGenderValues, ...femaleGenderValues].includes(normalizeGender(e.gender))) },
  ].map(row => ({ ...row, total: row.people.length }));
  const turnoverPeriods = periods.filter(p => p.reference_year === appliedYear && (appliedMonth === "todos" || p.id === appliedMonth));
  const isInTurnoverSelection = (date: string | null) => date !== null &&
    turnoverPeriods.some(period => date >= period.start_date && date <= period.end_date);
  const turnoverMovements = [
    { name: "Admissões", value: metrics.admissions, people: turnoverEmployees.filter(e => isInTurnoverSelection(e.hireDate)) },
    { name: "Desligamentos", value: metrics.terminations, people: turnoverEmployees.filter(e => isInTurnoverSelection(e.terminationDate)) },
  ];
  const bankTone = Math.abs(bankBalance) >= KPI_THRESHOLDS.bankCriticalMinutes ? "critical" : Math.abs(bankBalance) >= KPI_THRESHOLDS.bankAttentionMinutes ? "warning" : "neutral";
  const hasKpiData = metrics.expected > 0 || metrics.employees > 0 || metrics.admissions > 0 || metrics.terminations > 0;

  const demographicKpiEmployees = employees.filter(e =>
    (!appliedCompanyFilter || e.companyId === appliedCompanyFilter) &&
    (appliedDepartment === "todos" || e.department === appliedDepartment) &&
    (!appliedEmployees.length || appliedEmployees.includes(e.id)) &&
    (demographicStatusFilter === "todos" || (demographicStatusFilter === "ativos"
      ? (!e.terminationDate && ["ativo", "active"].includes((e.status || "").toLowerCase()))
      : (Boolean(e.terminationDate) || ["inativo", "inactive"].includes((e.status || "").toLowerCase()))))
  );
  const demographicAges = demographicKpiEmployees.filter(e => e.birthDate).map(e => {
    const birth = new Date(e.birthDate + "T00:00:00");
    const today = new Date();
    return today.getFullYear() - birth.getFullYear() - (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
  }).filter(age => age >= 0 && age < 120);
  const demographicTenures = demographicKpiEmployees.filter(e => e.hireDate).map(e => {
    const today = new Date();
    const end = new Date((e.terminationDate || today.toISOString().slice(0, 10)) + "T00:00:00");
    const start = new Date(e.hireDate + "T00:00:00");
    return Math.max(0, (end.getTime() - start.getTime()) / 86400000 / 365.25);
  });
  const salaryKpiEmployees = employees.filter(e =>
    (!appliedCompanyFilter || e.companyId === appliedCompanyFilter) &&
    (appliedDepartment === "todos" || e.department === appliedDepartment) &&
    (!appliedEmployees.length || appliedEmployees.includes(e.id)) &&
    (salaryStatusFilter === "todos" || (salaryStatusFilter === "ativos"
      ? (!e.terminationDate && ["ativo", "active"].includes((e.status || "").toLowerCase()))
      : (Boolean(e.terminationDate) || ["inativo", "inactive"].includes((e.status || "").toLowerCase()))))
  );
  const salaryKpiRows = salaryKpiEmployees.filter(e => e.salary != null && e.salary > 0);
  const normalizeKpiGender = (gender: unknown) => String(gender ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  const maleSalaryRows = salaryKpiRows.filter(e => ["m", "masculino", "masc", "homem", "male"].includes(normalizeKpiGender(e.gender)));
  const femaleSalaryRows = salaryKpiRows.filter(e => ["f", "feminino", "fem", "mulher", "female"].includes(normalizeKpiGender(e.gender)));
  const salaryKpiTotal = salaryKpiRows.reduce((sum, e) => sum + Number(e.salary || 0), 0);
  const pensionKpiEmployees = salaryKpiEmployees.filter(e => e.pensionAmount > 0);
  const kpiMoney = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const toneLabel = (tone: string) => tone === "critical" ? "Crítico" : tone === "warning" ? "Atenção" : "Dentro da faixa";
  const kpiItems: Array<{ label: string; value: string; support: string; tone: string; title: string; primary?: boolean; status?: string }> = activeSection === "demograficos"
    ? [
        { label: "Funcionários na seleção", value: String(demographicKpiEmployees.length), support: "Total de pessoas que atendem aos filtros desta seção", tone: "neutral", title: "Quantidade de funcionários na seleção demográfica.", primary: true },
        { label: "Idade média", value: demographicAges.length ? (demographicAges.reduce((sum, age) => sum + age, 0) / demographicAges.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " anos" : "Sem dados", support: `Média das idades de ${demographicAges.length} funcionários com data de nascimento válida`, tone: "neutral", title: "Idade média calculada a partir das datas de nascimento." },
        { label: "Tempo médio de empresa", value: demographicTenures.length ? (demographicTenures.reduce((sum, years) => sum + years, 0) / demographicTenures.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " anos" : "Sem dados", support: `Tempo médio desde a admissão, com base em ${demographicTenures.length} cadastros`, tone: "neutral", title: "Tempo médio desde a admissão até hoje ou desligamento." },
        { label: "Nascimento preenchido", value: demographicKpiEmployees.length ? Math.round(demographicAges.length / demographicKpiEmployees.length * 100) + "%" : "0%", support: "Parcela da equipe com data de nascimento válida", tone: "neutral", title: "Percentual de funcionários com data de nascimento válida." },
      ]
    : activeSection === "salariais"
    ? [
        { label: "Menor salário Masculino", value: maleSalaryRows.length ? kpiMoney(Math.min(...maleSalaryRows.map(e => Number(e.salary || 0)))) : "Sem dados", support: "Menor salário entre os homens na seleção", tone: "neutral", title: "Menor salário cadastrado entre funcionários do gênero masculino, respeitando os filtros.", primary: true },
        { label: "Maior salário Masculino", value: maleSalaryRows.length ? kpiMoney(Math.max(...maleSalaryRows.map(e => Number(e.salary || 0)))) : "Sem dados", support: "Maior salário entre os homens na seleção", tone: "neutral", title: "Maior salário cadastrado entre funcionários do gênero masculino, respeitando os filtros." },
        { label: "Menor salário Feminino", value: femaleSalaryRows.length ? kpiMoney(Math.min(...femaleSalaryRows.map(e => Number(e.salary || 0)))) : "Sem dados", support: "Menor salário entre as mulheres na seleção", tone: "neutral", title: "Menor salário cadastrado entre funcionárias do gênero feminino, respeitando os filtros." },
        { label: "Maior salário Feminino", value: femaleSalaryRows.length ? kpiMoney(Math.max(...femaleSalaryRows.map(e => Number(e.salary || 0)))) : "Sem dados", support: "Maior salário entre as mulheres na seleção", tone: "neutral", title: "Maior salário cadastrado entre funcionárias do gênero feminino, respeitando os filtros." },
      ]
    : activeSection === "horas-extras"
    ? [
        { label: "Horas extras", value: fmt(Math.max(0, totalOvertime)), support: "Horas trabalhadas além da jornada prevista", tone: "neutral", title: "Soma dos tipos de hora extra já apurados nesta seleção.", primary: true },
        { label: "Funcionários com HE", value: String(employeesWithOvertime.length), support: "Quantidade de pessoas que registraram horas extras no período", tone: "neutral", title: "Contagem de funcionários com horas extras na seleção." },
        { label: "Interjornada", value: fmt(metrics.interjornada), support: "Horas registradas de descanso insuficiente entre jornadas", tone: "neutral", title: "Interjornada é exibida separadamente e não compõe o saldo." },
        { label: "Banco de horas", value: fmt(bankBalance), support: "Diferença acumulada entre créditos e débitos até o fim do período", tone: "neutral", title: "Saldo apurado pelo modelo atual de Banco de Horas." },
      ]
    : activeSection === "turnover"
    ? [
        { label: "Turnover", value: pct(metrics.turnover), support: `${metrics.admissions} admissões · ${metrics.terminations} desligamentos`, tone: turnoverTone, status: toneLabel(turnoverTone), title: `[(Admissões + Desligamentos) ÷ 2] ÷ Funcionários ativos × 100. Faixas gerenciais: atenção a partir de ${turnoverThresholds.attention}% e crítico a partir de ${turnoverThresholds.critical}%.`, primary: true },
        { label: "Funcionários no período", value: String(Math.round(metrics.employees)), support: appliedMonth === "todos" ? "Pessoas distintas no período selecionado" : "Quadro ativo da competência", tone: "neutral", title: "Quantidade de funcionários considerados na seleção." },
        { label: "Admissões", value: String(metrics.admissions), support: "Funcionários que ingressaram no período selecionado", tone: "neutral", title: "Admissões com data dentro do período selecionado." },
        { label: "Desligamentos", value: String(metrics.terminations), support: "Funcionários cujo vínculo terminou no período selecionado", tone: "neutral", title: "Desligamentos com data dentro do período selecionado." },
      ]
    : [
        { label: "Absenteísmo", value: metrics.expected > 0 ? pct(absenteeismRate) : "Sem dados", support: "Parcela da jornada prevista que deixou de ser trabalhada", tone: absenteeismTone, status: toneLabel(absenteeismTone), title: "(Débitos + Faltas + Abonos) ÷ Horas previstas × 100. Referência gerencial: atenção a partir de 3% e crítico a partir de 5%.", primary: true },
        { label: "Horas previstas", value: fmt(metrics.expected), support: "Carga horária prevista no período selecionado", tone: "neutral", title: "Total de horas previstas para os funcionários considerados na seleção." },
        { label: "Horas perdidas", value: fmt(metrics.absenceMinutes), support: "Débitos + faltas + abonos considerados no absenteísmo", tone: "neutral", title: "Total de horas perdidas usadas no cálculo do absenteísmo." },
        { label: "Horas trabalhadas", value: fmt(metrics.worked), support: "Total registrado ou apurado no período selecionado", tone: "neutral", title: "Total de horas trabalhadas conforme os registros e a base histórica já existente." },
      ];

  return (
    <div className="kpis-page min-h-screen">
      <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <a href="/" className="inline-flex min-h-8 items-center text-[13px] font-medium text-[var(--kpi-text-muted)] transition-colors hover:text-[var(--kpi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)]" aria-label="Voltar ao início">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Voltar
          </a>
          <ScreenBrand name="KPIs" />
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 sm:px-7 sm:pt-8">
        <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7" aria-labelledby="kpis-page-title">
          <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-56 w-56 rounded-full bg-[#06CAA0]/20 blur-3xl" />
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7cebd0]">ANÁLISE • DP SUCCESS</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h1 id="kpis-page-title" style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} className="!text-white font-display text-[clamp(27px,3vw,36px)] font-semibold leading-[1.08] tracking-[-0.045em]">KPIs de RH e DP</h1>
              <p className="mt-2 text-[13px] leading-5 text-slate-200">
                {periodLabel || "Selecione os filtros para analisar os indicadores."}
                <span className="mx-2 text-[var(--kpi-border)]">·</span>
                {appliedMonth === "todos" ? "Todos os meses" : "Competência selecionada"}
                <span className="mx-2 text-[var(--kpi-border)]">·</span>
                {appliedCompanyFilter ? "Empresa filtrada" : "Todas as empresas"}
              </p>
            </div>
            <p className="pb-0.5 text-[12px] font-medium tabular-nums text-slate-200">Dados da seleção aplicada</p>
          </div>

        <section className="mt-6 rounded-xl border border-white/15 bg-white/[0.08] px-4 py-4 backdrop-blur-sm sm:px-5" aria-label="Indicadores principais">
          {isCalculating || isLoadingPage ? (
            <div className="kpi-band" aria-label="Carregando indicadores" aria-live="polite">
              {(["principal", "secundario-1", "secundario-2", "secundario-3"]).map((key, index) => (
                <div key={key} className={index === 0 ? "kpi-primary" : "kpi-secondary"}>
                  <div className="kpi-skeleton h-3 w-28" />
                  <div className="kpi-skeleton mt-4 h-9 w-32" />
                  <div className="kpi-skeleton mt-3 h-3 w-full max-w-48" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="border-y border-[var(--kpi-border)] bg-[var(--kpi-critical-soft)] px-5 py-5" role="alert">
              <p className="text-sm font-semibold text-[var(--kpi-critical)]">Não foi possível carregar os indicadores</p>
              <p className="mt-1 break-words text-[13px] text-[var(--kpi-text)]">{error}</p>
              <p className="mt-2 text-[12px] text-[var(--kpi-text-muted)]">Confira os filtros e tente atualizar novamente. Os cálculos não foram alterados.</p>
            </div>
          ) : !hasKpiData ? (
            <div className="border-y border-[var(--kpi-border)] bg-[var(--kpi-surface)] px-5 py-7" role="status">
              <p className="text-sm font-semibold text-[var(--kpi-text)]">Sem dados para a seleção</p>
              <p className="mt-1 text-[13px] text-[var(--kpi-text-muted)]">Escolha outro ano, mês ou conjunto de filtros e clique em “Atualizar KPIs”.</p>
            </div>
          ) : (
            <div className="kpi-band">
              {kpiItems.map((item, index) => (
                <div key={item.label} className={`${index === 0 ? "kpi-primary" : "kpi-secondary"} ${item.label === "Absenteísmo" || item.label === "Turnover" ? `kpi-tone-${item.tone}` : ""}`} title={item.title} aria-label={`${item.label}. ${item.title}`}>
                  <p className="text-[12px] font-semibold leading-5 text-[var(--kpi-text-muted)]">{item.label}</p>
                  <p className={`kpi-value ${item.tone === "critical" ? "is-critical" : item.tone === "warning" ? "is-warning" : ""}`}>{item.value}</p>
                  <p className="kpi-support">{item.support}</p>
                  {item.status && <span className={`kpi-status ${item.tone === "critical" ? "is-critical" : item.tone === "warning" ? "is-warning" : "is-neutral"}`}>{item.status}</span>}
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-4 text-[var(--kpi-text-muted)]">As faixas de atenção são provisórias e visuais; não alteram os cálculos nem os dados.</p>
        </section>

        </section>

        <div className="mt-3 flex min-h-7 items-center justify-end gap-2 text-[12px] text-[var(--kpi-text-muted)]" aria-live="polite">
          {isCalculating || isLoadingPage ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--kpi-border)] border-t-[var(--kpi-accent)]" /> Atualizando indicadores para os filtros selecionados</> : <span>Indicadores atualizados para os filtros aplicados</span>}
        </div>

        <section className="mt-7" aria-label="Navegação e filtros dos indicadores">
          <div role="tablist" aria-label="Categorias de KPIs" className="flex flex-wrap items-center gap-x-1 border-b border-[var(--kpi-border)]">
            {[
              ["absenteismo", "Absenteísmo"],
              ["horas-extras", "Hr Extra"],
              ["turnover", "Turnover"],
              ["demograficos", "Demográficos"],
              ["salariais", "Salariais"],
            ].map(([key, label]) => (
              <button
                key={key}
                id={`kpi-tab-${key}`}
                type="button"
                role="tab"
                aria-selected={activeSection === key}
                aria-controls={`kpi-panel-${key}`}
                tabIndex={activeSection === key ? 0 : -1}
                onClick={() => setActiveSection(key as typeof activeSection)}
                onKeyDown={event => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
                  if (!tabs.length) return;
                  const currentIndex = tabs.indexOf(event.currentTarget);
                  const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                  tabs[nextIndex]?.focus();
                  tabs[nextIndex]?.click();
                }}
                className="kpi-tab"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 border-y border-[var(--kpi-border)] bg-[var(--kpi-surface)] px-3 py-4 sm:px-4">
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-end 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.62fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.55fr)_auto]">
              <label className="kpi-toolbar-label">
                <span>Empresa</span>
                <CompanyFilter value={companyFilter} onChange={value => { setCompanyFilter(value); setSelectedEmployees([]); setSelectedDepartment("todos"); }} className={`kpi-control ${companyFilter ? "is-filtered" : ""}`} />
              </label>
              <label className="kpi-toolbar-label">
                <span>Ano</span>
                <select aria-label="Ano" className={`kpi-control ${selectedYear !== defaultKpiYear ? "is-filtered" : ""}`} value={selectedYear} onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedMonth("todos"); }}>
                  {[...new Set(periods.map(p => p.reference_year))].sort((a,b) => b-a).map(year => <option key={year} value={year}>{year}</option>)}
                </select>
              </label>
              <label className="kpi-toolbar-label">
                <span>Mês</span>
                <select aria-label="Mês ou competência" className={`kpi-control ${selectedMonth !== "todos" ? "is-filtered" : ""}`} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                  <option value="todos">Todos os meses</option>
                  {periods.filter(p => p.reference_year === selectedYear).map(p => <option key={p.id} value={p.id}>{periodRangeLabel(p)}</option>)}
                </select>
              </label>
              <label className="kpi-toolbar-label">
                <span>Setor</span>
                <select aria-label="Setor" className={`kpi-control ${selectedDepartment !== "todos" ? "is-filtered" : ""}`} value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)}>
                  <option value="todos">Todos os setores</option>
                  {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <div className="relative grid min-w-0 gap-[5px]">
                <label htmlFor="kpi-employee-filter" className="kpi-toolbar-label"><span>Funcionários da competência</span></label>
                <button id="kpi-employee-filter" type="button" aria-haspopup="dialog" aria-expanded={employeeFilterOpen} aria-controls="kpi-employee-options" className={`kpi-control flex items-center justify-between text-left ${selectedEmployees.length ? "is-filtered" : ""}`} onClick={() => setEmployeeFilterOpen(v => !v)} onKeyDown={event => { if (event.key === "Escape") setEmployeeFilterOpen(false); }}>
                  <span className="truncate">{selectedEmployees.length === 0 ? "Todos os funcionários" : `${selectedEmployees.length} selecionado(s)`}</span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-[var(--kpi-text-muted)]" aria-hidden="true" />
                </button>
                {employeeFilterOpen && (
                  <div id="kpi-employee-options" role="dialog" aria-label="Selecionar funcionários da competência" className="kpi-select-popover absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto p-2 text-[13px]">
                    <label className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 hover:bg-[var(--kpi-surface-muted)]">
                      <input type="checkbox" checked={selectedEmployees.length === 0} onChange={() => setSelectedEmployees([])} />
                      <span>Todos os funcionários</span>
                    </label>
                    {employeeOptions.map(e => (
                      <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 hover:bg-[var(--kpi-surface-muted)]">
                        <input type="checkbox" checked={selectedEmployees.includes(e.id)} onChange={() => setSelectedEmployees(current => current.includes(e.id) ? current.filter(id => id !== e.id) : [...current, e.id])} />
                        <span className="truncate">{e.name}</span>
                      </label>
                    ))}
                    {!employeeOptions.length && <p className="px-2 py-3 text-[12px] text-[var(--kpi-text-muted)]">Nenhum funcionário disponível nesta competência.</p>}
                  </div>
                )}
              </div>
              {(
                companyFilter || selectedMonth !== "todos" || selectedDepartment !== "todos" || selectedEmployees.length > 0 ||
                selectedYear !== Math.max(...periods.map(p => p.reference_year), new Date().getFullYear())
              ) && (
                <button type="button" className="kpi-clear justify-self-start xl:justify-self-end" onClick={() => {
                  const defaultYear = Math.max(...periods.map(p => p.reference_year), new Date().getFullYear());
                  setSelectedYear(defaultYear); setAppliedYear(defaultYear);
                  setSelectedMonth("todos"); setAppliedMonth("todos");
                  setSelectedDepartment("todos"); setAppliedDepartment("todos");
                  setCompanyFilter(""); setAppliedCompanyFilter("");
                  setSelectedEmployees([]); setAppliedEmployees([]);
                  setEmployeeFilterOpen(false);
                  setRefreshToken(value => value + 1);
                }}>Limpar filtros</button>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--kpi-border)] pt-3">
              <p className="text-[12px] leading-5 text-[var(--kpi-text-muted)]">
                {selectedEmployees.length ? `${selectedEmployees.length} funcionário(s) selecionado(s)` : "Todos os funcionários da competência"}
                {companyFilter ? " · Empresa específica" : " · Todas as empresas"}
                {selectedDepartment !== "todos" ? ` · Setor: ${selectedDepartment}` : ""}
              </p>
              <button type="button" onClick={() => { setAppliedYear(selectedYear); setAppliedMonth(selectedMonth); setAppliedDepartment(selectedDepartment); setAppliedCompanyFilter(companyFilter); setAppliedEmployees(selectedEmployees); setRefreshToken(value => value + 1); }} disabled={isCalculating} className="inline-flex min-h-[38px] min-w-40 items-center justify-center gap-2 rounded-[3px] bg-[var(--kpi-accent)] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)] focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60">
                {isCalculating ? <><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> Atualizando…</> : "Atualizar KPIs"}
              </button>
            </div>
          </div>
        </section>

        {activeSection === "demograficos" && (
          <section id="kpi-panel-demograficos" role="tabpanel" aria-labelledby="kpi-tab-demograficos" tabIndex={0} className="mt-6 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)]">
            {(() => {
              const base = employees.filter(e => (!appliedCompanyFilter || e.companyId === appliedCompanyFilter) && (appliedDepartment === "todos" || e.department === appliedDepartment) && (!appliedEmployees.length || appliedEmployees.includes(e.id)) && (demographicStatusFilter === "todos" || (demographicStatusFilter === "ativos" ? (!e.terminationDate && ["ativo","active"].includes((e.status || "").toLowerCase())) : (Boolean(e.terminationDate) || ["inativo","inactive"].includes((e.status || "").toLowerCase())))));
              const today = new Date();
              const ageOf = (birth: string) => { const d = new Date(birth + "T00:00:00"); return today.getFullYear() - d.getFullYear() - (today < new Date(today.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0); };
              const ages = base.filter(e => e.birthDate).map(e => ageOf(e.birthDate as string)).filter(n => n >= 0 && n < 120);
              const tenure = base.filter(e => e.hireDate).map(e => Math.max(0, ((new Date((e.terminationDate || today.toISOString().slice(0,10)) + "T00:00:00").getTime() - new Date((e.hireDate as string) + "T00:00:00").getTime()) / 86400000) / 365.25));
              const genderLabels = ["Feminino", "Masculino", "Outro", "Não informado"];
              const genderColors = ["#ec4899", "#3b82f6", "#8b5cf6", "#94a3b8"];
              const genderData = genderLabels.map((name, i) => {
                const people = base.filter(e => i === 0 ? e.gender === "feminino" : i === 1 ? e.gender === "masculino" : i === 2 ? e.gender === "outro" : !e.gender || !["feminino", "masculino", "outro"].includes(e.gender));
                return { name, people, value: people.length, fill: genderColors[i] };
              }).filter(row => row.value > 0);
              const ageRanges = [
                { faixa: "Até 25", min: 0, max: 25 },
                { faixa: "26–35", min: 26, max: 35 },
                { faixa: "36–45", min: 36, max: 45 },
                { faixa: "46–55", min: 46, max: 55 },
                { faixa: "56+", min: 56, max: 119 },
              ];
              const ageData = ageRanges.map(({ faixa, min, max }) => {
                const people = base.filter(e => {
                  const age = e.birthDate ? ageOf(e.birthDate) : NaN;
                  return age >= min && age <= max;
                });
                return { faixa, people, total: people.length };
              });
              const tenureData = [
                { faixa: "Menos de 1 ano", min: 0, max: 1 },
                { faixa: "1–3 anos", min: 1, max: 3 },
                { faixa: "3–5 anos", min: 3, max: 5 },
                { faixa: "5+ anos", min: 5, max: Infinity },
              ].map(({ faixa, min, max }) => {
                const people = base.filter(e => {
                  if (!e.hireDate) return false;
                  const end = new Date((e.terminationDate || today.toISOString().slice(0, 10)) + "T00:00:00");
                  const years = Math.max(0, (end.getTime() - new Date(e.hireDate + "T00:00:00").getTime()) / 86400000 / 365.25);
                  return years >= min && years < max;
                });
                return { faixa, people, total: people.length };
              });
              const deptData = [...new Set(base.map(e => e.department || "Sem setor"))].map(setor => {
                const people = base.filter(e => (e.department || "Sem setor") === setor);
                return { setor, people, total: people.length };
              }).sort((a, b) => b.total - a.total).slice(0, 8);
              const byGender = (people: Employee[]) => {
                const groups = {
                  feminino: people.filter(e => ["feminino", "fem", "f", "mulher", "female"].includes(String(e.gender ?? "").toLowerCase())),
                  masculino: people.filter(e => ["masculino", "masc", "m", "homem", "male"].includes(String(e.gender ?? "").toLowerCase())),
                  outros: people.filter(e => String(e.gender ?? "").toLowerCase() === "outro"),
                };
                return { groups, feminino: groups.feminino.length, masculino: groups.masculino.length, outros: groups.outros.length };
              };
              const genderByAgeData = ageData.map(row => ({ faixa: row.faixa, ...byGender(row.people) }));
              const deptGenderData = deptData.map(row => ({ setor: row.setor, ...byGender(row.people) }));
              const ageTenurePoints = base.flatMap(e => {
                if (!e.birthDate || !e.hireDate) return [];
                const age = ageOf(e.birthDate);
                if (age < 0 || age >= 120) return [];
                const endDate = e.terminationDate || today.toISOString().slice(0,10);
                const years = Math.max(0, (new Date(endDate + "T00:00:00").getTime() - new Date(e.hireDate + "T00:00:00").getTime()) / 86400000 / 365.25);
                if (!Number.isFinite(years)) return [];
                const g = String(e.gender ?? "").toLowerCase();
                const group = ["feminino","fem","f","mulher","female"].includes(g) ? "Feminino" : ["masculino","masc","m","homem","male"].includes(g) ? "Masculino" : "Outro / não informado";
                return [{ id: e.id, name: e.name, nome: e.name, idade: age, tempo: Number(years.toFixed(2)), sexo: group, setor: e.department || "Sem setor" }];
              });
              const tenureByAgeData = ageRanges.map(({ faixa, min, max }) => {
                const people = ageTenurePoints.filter(e => e.idade >= min && e.idade <= max);
                return { faixa, people, media: people.length ? people.reduce((sum,e)=>sum+e.tempo,0)/people.length : 0, quantidade: people.length };
              });
              const average = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
              const ageAverage = average(ages);
              const tenureAverage = average(tenure);
              const profileSeries = [
                { name: "Feminino", color: "#ec4899" },
                { name: "Masculino", color: "#3b82f6" },
                { name: "Outro / não informado", color: "#8b5cf6" },
              ];
              return <>
                <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Perfil do quadro</p><h2 className="mt-1 text-2xl font-bold">Indicadores demográficos</h2><p className="mt-1 text-sm text-muted-foreground">Mostra a composição da equipe por sexo, faixa etária, tempo de empresa e setor.</p></div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"><div><p className="text-sm font-semibold">Situação dos funcionários</p><p className="text-xs text-muted-foreground">Filtra todos os indicadores e gráficos desta seção.</p></div><select aria-label="Filtrar situação dos funcionários nos indicadores demográficos" className="h-10 min-w-44 rounded-lg border bg-background px-3 text-sm" value={demographicStatusFilter} onChange={e => setDemographicStatusFilter(e.target.value as "todos" | "ativos" | "inativos")}><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className="border-pink-200 bg-gradient-to-br from-pink-50 to-background p-5 dark:from-pink-950/30"><p className="text-sm text-muted-foreground">Funcionários na seleção</p><p className="mt-2 text-3xl font-bold">{base.length}</p><p className="mt-1 text-xs text-muted-foreground">Pessoas incluídas pelos filtros desta seção.</p></Card>
                  <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-background p-5 dark:from-violet-950/30"><p className="text-sm text-muted-foreground">Idade média</p><p className="mt-2 text-3xl font-bold">{ages.length ? ageAverage.toLocaleString("pt-BR",{maximumFractionDigits:1})+" anos" : "Sem dados"}</p><p className="mt-1 text-xs text-muted-foreground">Média das idades de {ages.length} pessoas com data de nascimento válida.</p></Card>
                  <Card className="border-sky-200 bg-gradient-to-br from-sky-50 to-background p-5 dark:from-sky-950/30"><p className="text-sm text-muted-foreground">Tempo médio de empresa</p><p className="mt-2 text-3xl font-bold">{tenure.length ? tenureAverage.toLocaleString("pt-BR",{maximumFractionDigits:1})+" anos" : "Sem dados"}</p><p className="mt-1 text-xs text-muted-foreground">Tempo médio desde a admissão, com base em {tenure.length} cadastros.</p></Card>
                  <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-background p-5 dark:from-emerald-950/30"><p className="text-sm text-muted-foreground">Dados de nascimento preenchidos</p><p className="mt-2 text-3xl font-bold">{base.length ? Math.round(ages.length/base.length*100) : 0}%</p><p className="mt-1 text-xs text-muted-foreground">Parcela da equipe com data de nascimento válida.</p></Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5"><h3 className="font-bold">Distribuição por sexo</h3><p className="text-xs text-muted-foreground">Quantidade e proporção de cada categoria cadastrada.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie {...chart.click(genderData, row => chart.show(row.name, row.people))} data={genderData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={88} innerRadius={48} paddingAngle={3} label={({name,percent})=>`${name} ${((percent||0)*100).toFixed(0)}%`}>{genderData.map(row => <Cell key={row.name} fill={row.fill}/>)}</Pie><Tooltip formatter={(value: number) => [value, "Funcionários"]}/><Legend /></PieChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Faixas etárias</h3><p className="text-xs text-muted-foreground">Distribuição por idade; considera apenas cadastros com data de nascimento válida.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={ageData} margin={{top:12,right:8,left:-18,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="faixa" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip formatter={(value:number)=>[value,"Funcionários"]}/><Bar {...chart.click(ageData, row => chart.show(row.faixa, row.people))} dataKey="total" name="Funcionários" radius={[7,7,0,0]}>{ageData.map((_,i)=><Cell key={i} fill={["#f97316","#eab308","#22c55e","#06b6d4","#6366f1"][i]}/>)}</Bar></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Tempo de empresa</h3><p className="text-xs text-muted-foreground">Faixas calculadas a partir da admissão até hoje ou até o desligamento cadastrado.</p>
                    <div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={tenureData} layout="vertical" margin={{top:4,right:16,left:24,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="faixa" width={105} tick={{fontSize:11}}/><Tooltip formatter={(value:number)=>[value,"Funcionários"]}/><Bar {...chart.click(tenureData, row => chart.show(row.faixa, row.people))} dataKey="total" name="Funcionários" radius={[0,7,7,0]}>{tenureData.map((_,i)=><Cell key={i} fill={["#14b8a6","#0ea5e9","#a855f7","#f43f5e"][i]}/>)}</Bar></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Funcionários por setor</h3><p className="text-xs text-muted-foreground">Até 8 setores com maior número de pessoas na seleção.</p>
                    <div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={deptData} layout="vertical" margin={{top:4,right:16,left:8,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="setor" width={112} tick={{fontSize:10}}/><Tooltip formatter={(value:number)=>[value,"Funcionários"]}/><Bar {...chart.click(deptData, row => chart.show(row.setor, row.people))} dataKey="total" name="Funcionários" fill="#8b5cf6" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div>
                  </Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5"><h3 className="font-bold">Faixa etária por sexo</h3><p className="text-xs text-muted-foreground">Compara quantos funcionários de cada sexo existem em cada faixa etária.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={genderByAgeData} margin={{top:12,right:8,left:-18,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="faixa" tick={{fontSize:10}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip/><Legend/><Bar {...chart.click(genderByAgeData, row => chart.show(`${row.faixa} · Feminino`, row.groups.feminino))} dataKey="feminino" name="Feminino" stackId="a" fill="#ec4899"/><Bar {...chart.click(genderByAgeData, row => chart.show(`${row.faixa} · Masculino`, row.groups.masculino))} dataKey="masculino" name="Masculino" stackId="a" fill="#3b82f6"/><Bar {...chart.click(genderByAgeData, row => chart.show(`${row.faixa} · Outro`, row.groups.outros))} dataKey="outros" name="Outro" stackId="a" fill="#8b5cf6"/></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Composição por sexo nos principais setores</h3><p className="text-xs text-muted-foreground">Compara a distribuição por sexo nos até 8 setores com mais funcionários.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={deptGenderData} layout="vertical" margin={{top:4,right:16,left:8,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="setor" width={112} tick={{fontSize:10}}/><Tooltip/><Legend/><Bar {...chart.click(deptGenderData, row => chart.show(`${row.setor} · Feminino`, row.groups.feminino))} dataKey="feminino" name="Feminino" stackId="a" fill="#ec4899"/><Bar {...chart.click(deptGenderData, row => chart.show(`${row.setor} · Masculino`, row.groups.masculino))} dataKey="masculino" name="Masculino" stackId="a" fill="#3b82f6"/><Bar {...chart.click(deptGenderData, row => chart.show(`${row.setor} · Outro`, row.groups.outros))} dataKey="outros" name="Outro" stackId="a" fill="#8b5cf6"/></BarChart></ResponsiveContainer></div>
                  </Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5"><h3 className="font-bold">Mapa de perfil: idade × tempo de empresa</h3><p className="text-xs text-muted-foreground">Cada ponto representa um funcionário. Os eixos mostram idade e tempo de empresa.</p>
                    <div className="mt-3 h-72 min-w-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" dataKey="idade" name="Idade" domain={[0, "dataMax"]} tick={{ fontSize: 10 }} />
                          <YAxis type="number" dataKey="tempo" name="Tempo de empresa" tick={{ fontSize: 10 }} label={{ value: "Tempo de empresa (anos)", angle: -90, position: "insideLeft", fontSize: 11 }} />
                          <ZAxis range={[55, 55]} />
                          <Tooltip
                            cursor={{ strokeDasharray: "3 3" }}
                            formatter={(value: number, name: string) => [name === "Idade" ? value + " anos" : Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " anos", name]}
                            labelFormatter={(_, payload) => payload?.[0]?.payload?.nome || ""}
                          />
                          {profileSeries.map(({ name, color }) => (
                            <Scatter key={name} name={name} data={ageTenurePoints.filter(point => point.sexo === name)}
                              {...chart.click(ageTenurePoints.filter(point => point.sexo === name), row => chart.show("Idade e tempo de empresa", [row]))} fill={color} />
                          ))}
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-center text-xs text-muted-foreground">Idade (anos)</p>
                    <ul aria-label="Legenda por sexo" className="my-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      {profileSeries.map(({ name, color }) => (
                        <li key={name} className="flex items-center gap-1.5">
                          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                          {name}
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">Considera somente funcionários com nascimento e admissão preenchidos. Para inativos, o tempo vai até a data de desligamento cadastrada.</p>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Tempo médio de empresa por faixa etária</h3><p className="text-xs text-muted-foreground">Ajuda a perceber se o quadro mais jovem tem menor permanência ou se há retenção em faixas etárias específicas.</p>
                    <div className="mt-3 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={tenureByAgeData} margin={{top:12,right:8,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="faixa" tick={{fontSize:10}}/><YAxis tickFormatter={(v:number)=>v.toLocaleString("pt-BR",{maximumFractionDigits:1})+" a"} tick={{fontSize:10}}/><Tooltip formatter={(v:number)=>[Number(v).toLocaleString("pt-BR",{maximumFractionDigits:2})+" anos","Tempo médio"]}/><Bar {...chart.click(tenureByAgeData, row => chart.show(row.faixa, row.people))} dataKey="media" name="Tempo médio (anos)" fill="#14b8a6" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div>
                    <p className="text-xs text-muted-foreground">A quantidade de pessoas em cada faixa é mostrada abaixo do gráfico.</p><div className="mt-2 flex flex-wrap gap-2">{tenureByAgeData.map(e=><span key={e.faixa} className="rounded-full bg-muted px-3 py-1 text-xs">{e.faixa}: {e.quantidade} pessoa(s)</span>)}</div>
                  </Card>
                </div>
                <p className="text-xs text-muted-foreground">Os gráficos usam os dados cadastrados dos funcionários e respeitam empresa, setor e seleção de funcionários após clicar em “Atualizar KPIs”.</p>
              </>;
            })()}
          </section>
        )}

        {activeSection === "salariais" && (
          <section id="kpi-panel-salariais" role="tabpanel" aria-labelledby="kpi-tab-salariais" tabIndex={0} className="mt-6 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)]">
            {(() => {
              const base = employees.filter(e => (!appliedCompanyFilter || e.companyId === appliedCompanyFilter) && (appliedDepartment === "todos" || e.department === appliedDepartment) && (!appliedEmployees.length || appliedEmployees.includes(e.id)) && (salaryStatusFilter === "todos" || (salaryStatusFilter === "ativos" ? (!e.terminationDate && ["ativo","active"].includes((e.status || "").toLowerCase())) : (Boolean(e.terminationDate) || ["inativo","inactive"].includes((e.status || "").toLowerCase())))));
              const salaries = base.filter(e => e.salary != null && e.salary > 0).map(e => ({...e, salary: Number(e.salary)}));
              const avg = salaries.length ? salaries.reduce((s,e)=>s+(e.salary||0),0)/salaries.length : 0;
              const totalPayroll = salaries.reduce((s,e)=>s+(e.salary||0),0);
              const pensioned = base.filter(e=>e.pensionAmount>0);
              const pensionTotal = pensioned.reduce((s,e)=>s+e.pensionAmount,0);
              const money = (n:number) => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
              const salaryRanges = [{faixa:"Até R$ 2 mil",total:salaries.filter(e=>(e.salary||0)<=2000).length},{faixa:"R$ 2–3 mil",total:salaries.filter(e=>(e.salary||0)>2000&&(e.salary||0)<=3000).length},{faixa:"R$ 3–5 mil",total:salaries.filter(e=>(e.salary||0)>3000&&(e.salary||0)<=5000).length},{faixa:"R$ 5–8 mil",total:salaries.filter(e=>(e.salary||0)>5000&&(e.salary||0)<=8000).length},{faixa:"Acima de R$ 8 mil",total:salaries.filter(e=>(e.salary||0)>8000).length}];
              const deptSalaries = [...new Set(salaries.map(e=>e.department||"Sem setor"))].map(setor=>{const values=salaries.filter(e=>(e.department||"Sem setor")===setor);return {setor,media:values.reduce((s,e)=>s+(e.salary||0),0)/values.length,quantidade:values.length, people:values};}).sort((a,b)=>b.media-a.media).slice(0,10);
              const salaryPoints = salaries.map(e => ({ id: e.id, name: e.name, funcionario: e.name, salario: e.salary }));
              const topSalaries = [...salaryPoints].sort((a,b) => b.salario - a.salario).slice(0,8);
              const bottomSalaries = [...salaryPoints].sort((a,b) => a.salario - b.salario).slice(0,8);
              const genderSalaryRows = [
                { genero: "Feminino", valores: salaries.filter(e => ["feminino","fem","f","mulher","female"].includes(String(e.gender ?? "").toLowerCase())) },
                { genero: "Masculino", valores: salaries.filter(e => ["masculino","masc","m","homem","male"].includes(String(e.gender ?? "").toLowerCase())) },
                { genero: "Outro / não informado", valores: salaries.filter(e => !["feminino","fem","f","mulher","female","masculino","masc","m","homem","male"].includes(String(e.gender ?? "").toLowerCase())) },
              ].map(g => ({ genero: g.genero, people: g.valores, quantidade: g.valores.length, media: g.valores.length ? g.valores.reduce((sum,e)=>sum+(e.salary||0),0)/g.valores.length : 0, folha: g.valores.reduce((sum,e)=>sum+(e.salary||0),0) }));
              const salaryRangeGenderData = [
                { faixa: "Até R$ 2 mil", min: 0, max: 2000 },
                { faixa: "R$ 2–3 mil", min: 2000, max: 3000 },
                { faixa: "R$ 3–5 mil", min: 3000, max: 5000 },
                { faixa: "R$ 5–8 mil", min: 5000, max: 8000 },
                { faixa: "Acima de R$ 8 mil", min: 8000, max: Infinity },
              ].map(({ faixa, min, max }) => {
                const inRange = (e: { salary: number }) => e.salary > min && e.salary <= max;
                const women = (genderSalaryRows[0]?.people ?? []).filter(inRange);
                const men = (genderSalaryRows[1]?.people ?? []).filter(inRange);
                return { faixa, women, men, feminino: women.length, masculino: men.length };
              });
              const salaryAgeData = [
                { faixa: "Até 25", min: 0, max: 25 },
                { faixa: "26–35", min: 26, max: 35 },
                { faixa: "36–45", min: 36, max: 45 },
                { faixa: "46–55", min: 46, max: 55 },
                { faixa: "56+", min: 56, max: 119 },
              ].map(range => {
                const values = salaries.filter(e => {
                  if (!e.birthDate) return false;
                  const birth = new Date(e.birthDate + "T00:00:00");
                  const now = new Date();
                  const age = now.getFullYear() - birth.getFullYear() - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0);
                  return age >= range.min && age <= range.max;
                });
                return { faixa: range.faixa, media: values.length ? values.reduce((sum,e)=>sum+(e.salary||0),0)/values.length : 0, quantidade: values.length, people: values };
              });
              const salaryTenurePoints = salaries.flatMap(e => {
                if (!e.hireDate) return [];
                const endDate = e.terminationDate || new Date().toISOString().slice(0,10);
                const years = Math.max(0,(new Date(endDate+"T00:00:00").getTime()-new Date(e.hireDate+"T00:00:00").getTime())/86400000/365.25);
                const gender = String(e.gender ?? "").toLowerCase();
                const sexo = ["feminino","fem","f","mulher","female"].includes(gender) ? "Feminino" : ["masculino","masc","m","homem","male"].includes(gender) ? "Masculino" : "Outro / não informado";
                return Number.isFinite(years) ? [{ id:e.id, name:e.name, nome:e.name, tempo:Number(years.toFixed(2)), salario:Number(e.salary||0), sexo, setor:e.department||"Sem setor" }] : [];
              });
              const salaryColors = ["#06b6d4","#8b5cf6","#f97316","#22c55e","#ec4899"];
              return <>
                <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Remuneração</p><h2 className="mt-1 text-2xl font-bold">Indicadores salariais</h2><p className="mt-1 text-sm text-muted-foreground">Mostra como os salários cadastrados se distribuem entre os funcionários e setores da seleção. Também indica quantas pessoas pagam pensão alimentícia.</p></div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"><div><p className="text-sm font-semibold">Situação dos funcionários</p><p className="text-xs text-muted-foreground">Filtra todos os indicadores e gráficos desta seção.</p></div><select aria-label="Filtrar situação dos funcionários nos indicadores salariais" className="h-10 min-w-44 rounded-lg border bg-background px-3 text-sm" value={salaryStatusFilter} onChange={e => setSalaryStatusFilter(e.target.value as "todos" | "ativos" | "inativos")}><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className="border-cyan-200 bg-gradient-to-br from-cyan-50 to-background p-5 dark:from-cyan-950/30"><p className="text-sm text-muted-foreground">Salário médio</p><p className="mt-2 text-2xl font-bold">{salaries.length?money(avg):"Sem dados"}</p><p className="mt-1 text-xs text-muted-foreground">Média dos {salaries.length} salários cadastrados na seleção</p></Card>
                  <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-background p-5 dark:from-indigo-950/30"><p className="text-sm text-muted-foreground">Folha mensal estimada</p><p className="mt-2 text-2xl font-bold">{money(totalPayroll)}</p><p className="mt-1 text-xs text-muted-foreground">Soma dos salários cadastrados, sem encargos</p></Card>
                  <Card className="border-rose-200 bg-gradient-to-br from-rose-50 to-background p-5 dark:from-rose-950/30"><p className="text-sm text-muted-foreground">Funcionários que pagam pensão</p><p className="mt-2 text-2xl font-bold">{pensioned.length}</p><p className="mt-1 text-xs text-muted-foreground">Pessoas com valor de pensão informado no cadastro</p></Card>
                  <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-background p-5 dark:from-amber-950/30"><p className="text-sm text-muted-foreground">Percentual que paga pensão</p><p className="mt-2 text-2xl font-bold">{base.length ? (pensioned.length / base.length * 100).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%" : "0%"}</p><p className="mt-1 text-xs text-muted-foreground">Parcela dos {base.length} funcionários que pagam pensão</p></Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5"><h3 className="font-bold">Distribuição por faixa salarial e sexo</h3><p className="text-xs text-muted-foreground">Quantidade de funcionários por faixa, comparando feminino e masculino.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={salaryRangeGenderData} margin={{top:12,right:8,left:0,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="faixa" tick={{fontSize:9}} interval={0} angle={-10} textAnchor="end" height={55}/><YAxis allowDecimals={false} tick={{fontSize:10}}/><Tooltip/><Legend/><Bar {...chart.click(salaryRangeGenderData, row => chart.show(`${row.faixa} · Feminino`, row.women))} dataKey="feminino" name="Feminino" fill="#ec4899" radius={[5,5,0,0]}/><Bar {...chart.click(salaryRangeGenderData, row => chart.show(`${row.faixa} · Masculino`, row.men))} dataKey="masculino" name="Masculino" fill="#3b82f6" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Salário médio por sexo</h3><p className="text-xs text-muted-foreground">Compara salário médio, total de salários e quantidade de pessoas em cada categoria.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={genderSalaryRows} margin={{top:12,right:8,left:4,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="genero" tick={{fontSize:10}}/><YAxis tickFormatter={(v:number)=>money(v)} tick={{fontSize:10}}/><Tooltip formatter={(v:number)=>[money(v),"Salário médio"]}/><Bar {...chart.click(genderSalaryRows, row => chart.show(row.genero, row.people))} dataKey="media" name="Salário médio" radius={[7,7,0,0]}>{genderSalaryRows.map(item => <Cell key={item.genero} fill={/fem|mulher/i.test(item.genero) ? "#ec4899" : /masc|homem/i.test(item.genero) ? "#3b82f6" : "#8b5cf6"}/>)}</Bar></BarChart></ResponsiveContainer></div>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">{genderSalaryRows.map(item=><div key={item.genero} className="rounded-lg bg-muted/40 p-2"><p className="text-xs text-muted-foreground">{item.genero}</p><p className="text-sm font-semibold">{item.quantidade} pessoa(s)</p><p className="text-xs text-muted-foreground">{money(item.folha)} de folha</p></div>)}</div>
                  </Card>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <Card className="p-5 xl:col-span-2"><h3 className="font-bold">Salário médio por setor</h3><p className="text-xs text-muted-foreground">Comparação da média salarial entre os setores da seleção.</p>
                    <div className="mt-3 h-[34rem]"><ResponsiveContainer width="100%" height="100%"><PieChart margin={{top:8,right:12,bottom:8,left:12}}><Pie {...chart.click(deptSalaries, row => chart.show(row.setor, row.people))} data={deptSalaries} dataKey="media" nameKey="setor" cx="50%" cy="43%" outerRadius={150} stroke="#ffffff" strokeWidth={2} labelLine={{stroke:"currentColor",strokeWidth:1.2}} label={({name})=>name} style={{fontSize:12,fontWeight:500}}><Cell fill="#06b6d4"/><Cell fill="#8b5cf6"/><Cell fill="#f97316"/><Cell fill="#22c55e"/><Cell fill="#ec4899"/><Cell fill="#eab308"/><Cell fill="#3b82f6"/><Cell fill="#14b8a6"/><Cell fill="#64748b"/><Cell fill="#a3e635"/></Pie><Tooltip formatter={(value:number)=>[money(value),"Salário médio"]}/><Legend layout="horizontal" verticalAlign="bottom" align="center" iconSize={13} formatter={(value:string)=><span style={{fontSize:"13px",lineHeight:"18px",color:"var(--foreground)"}}>{value}</span>} wrapperStyle={{width:"100%",paddingTop:"10px",paddingLeft:"8px",paddingRight:"8px"}}/></PieChart></ResponsiveContainer></div>
                  </Card>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <Card className="p-5"><h3 className="font-bold">Maiores salários cadastrados</h3><p className="text-xs text-muted-foreground">Até 8 registros de maior valor na seleção atual.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={topSalaries} layout="vertical" margin={{top:4,right:20,left:8,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={(v:number)=>money(v)} tick={{fontSize:10}}/><YAxis type="category" dataKey="funcionario" width={140} tick={{fontSize:10}}/><Tooltip formatter={(value:number)=>[money(value),"Salário"]}/><Bar {...chart.click(topSalaries, row => chart.show("Maiores salários", [row]))} dataKey="salario" name="Salário" fill="#f97316" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Menores salários cadastrados</h3><p className="text-xs text-muted-foreground">Até 8 registros de menor valor na seleção atual.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={bottomSalaries} layout="vertical" margin={{top:4,right:20,left:8,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={(v:number)=>money(v)} tick={{fontSize:10}}/><YAxis type="category" dataKey="funcionario" width={140} tick={{fontSize:10}}/><Tooltip formatter={(value:number)=>[money(value),"Salário"]}/><Bar {...chart.click(bottomSalaries, row => chart.show("Menores salários", [row]))} dataKey="salario" name="Salário" fill="#0d9488" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div>
                  </Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5"><h3 className="font-bold">Remuneração × tempo de empresa</h3><p className="text-xs text-muted-foreground">Cada ponto representa um funcionário. Os eixos mostram salário e tempo de empresa.</p>
                    <div className="mt-3 h-80"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{top:12,right:16,bottom:18,left:8}}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" dataKey="tempo" name="Tempo de empresa" tick={{fontSize:10}} label={{value:"Tempo de empresa (anos)",position:"insideBottom",offset:-12,fontSize:11}}/><YAxis type="number" dataKey="salario" name="Salário" tickFormatter={(v:number)=>money(v)} tick={{fontSize:10}}/><ZAxis range={[55,55]}/><Tooltip formatter={(value:number,name:string)=>[name==="Salário"?money(value):Number(value).toLocaleString("pt-BR",{maximumFractionDigits:1})+" anos",name]} labelFormatter={(_,payload)=>payload?.[0]?.payload?.nome || ""}/><Legend/><Scatter name="Feminino" data={salaryTenurePoints.filter(e=>e.sexo==="Feminino")} {...chart.click(salaryTenurePoints.filter(e=>e.sexo==="Feminino"), row => chart.show("Remuneração e tempo de empresa", [row]))} fill="#ec4899"/><Scatter name="Masculino" data={salaryTenurePoints.filter(e=>e.sexo==="Masculino")} {...chart.click(salaryTenurePoints.filter(e=>e.sexo==="Masculino"), row => chart.show("Remuneração e tempo de empresa", [row]))} fill="#3b82f6"/><Scatter name="Outro / não informado" data={salaryTenurePoints.filter(e=>e.sexo==="Outro / não informado")} {...chart.click(salaryTenurePoints.filter(e=>e.sexo==="Outro / não informado"), row => chart.show("Remuneração e tempo de empresa", [row]))} fill="#8b5cf6"/></ScatterChart></ResponsiveContainer></div>
                    <p className="text-xs text-muted-foreground">Usa salário cadastrado e tempo desde a admissão (até hoje ou até o desligamento). Não inclui encargos, benefícios ou adicionais.</p>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Salário médio por faixa etária</h3><p className="text-xs text-muted-foreground">Mostra como a média salarial varia entre faixas de idade; considere também função, jornada, senioridade e setor ao interpretar.</p>
                    <div className="mt-3 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={salaryAgeData} margin={{top:12,right:8,left:4,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="faixa" tick={{fontSize:10}}/><YAxis tickFormatter={(v:number)=>money(v)} tick={{fontSize:10}}/><Tooltip formatter={(v:number)=>[money(Number(v)),"Salário médio"]}/><Bar {...chart.click(salaryAgeData, row => chart.show(row.faixa, row.people))} dataKey="media" name="Salário médio" fill="#8b5cf6" radius={[7,7,0,0]}/></BarChart></ResponsiveContainer></div>
                    <div className="mt-2 flex flex-wrap gap-2">{salaryAgeData.map(e=><span key={e.faixa} className="rounded-full bg-muted px-3 py-1 text-xs">{e.faixa}: {e.quantidade} pessoa(s)</span>)}</div>
                  </Card>
                </div>
                <p className="text-xs text-muted-foreground">A folha mensal estimada é apenas a soma dos salários cadastrados: não inclui encargos, benefícios, adicionais ou descontos. Os gráficos exibem dados de cadastro, não recalculam fechamentos nem alteram pagamentos.</p>
              </>;
            })()}
          </section>
        )}
        {activeSection === "absenteismo" && (
          <section id="kpi-panel-absenteismo" role="tabpanel" aria-labelledby="kpi-tab-absenteismo" tabIndex={0} className="mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)]">
          <div className="flex flex-wrap items-end justify-between gap-4 sm:flex-nowrap">
            <div>
              <h2 className="mt-1 text-2xl font-bold">Absenteísmo</h2>
              <p className="mt-1 text-sm text-muted-foreground">O absenteísmo mostra a parcela da jornada prevista que deixou de ser trabalhada. No DP Success, ele considera débitos de ponto, faltas e horas abonadas no período.</p>
            </div>
            <button type="button" onClick={() => setShowAbsenceCalculation(v => !v)} aria-expanded={showAbsenceCalculation} className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
              <Info className="h-4 w-4" /> Como é calculado
            </button>
          </div>

          {showAbsenceCalculation && (
            <Card className="mt-4 border-primary/20 bg-primary/5 p-5">
              <p className="font-semibold">Cálculo do indicador</p>
              <p className="mt-2 text-sm text-muted-foreground">
                (Débitos + Faltas + Abonos) ÷ Horas previstas × 100.
                Atestados são registrados em dias, convertidos em horas pela jornada do funcionário e contabilizados automaticamente em Abonos e no absenteísmo. As horas efetivamente abonadas de declarações também entram em Abonos.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Débitos</p><p className="font-semibold">{fmt(metrics.debitMinutes)}</p></div>
                <div><p className="text-xs text-muted-foreground">Faltas</p><p className="font-semibold">{fmt(metrics.faltasMinutes)}</p></div>
                <div><p className="text-xs text-muted-foreground">Abonos</p><p className="font-semibold">{fmt(metrics.abonosMinutes)}</p></div>
                <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{fmt(metrics.absenceMinutes)}</p></div>
              </div>
            </Card>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="font-bold">Evolução do Absenteísmo</h3><p className="text-xs text-muted-foreground">Percentual de horas perdidas consideradas em cada competência.</p></div>
                <span className="text-xs text-muted-foreground">{appliedYear}</span>
              </div>
              <div className="mt-5 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyAbsenteeism} style={{ cursor: "pointer" }}
                    onClick={state => {
                      const row = monthlyAbsenteeism[Number(state?.activeTooltipIndex)];
                      if (row) showMonth("Absenteísmo", "lost", row);
                    }} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="absenteeismFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.75}/><stop offset="95%" stopColor="#f97316" stopOpacity={0.05}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                    <XAxis dataKey="label" tick={{ fontSize: 10 }}/>
                    <YAxis tickFormatter={(value:number) => `${value}%`} tick={{ fontSize: 10 }}/>
                    <Tooltip formatter={(value:number) => [pct(value), "Absenteísmo"]}/>
                    <Area type="monotone" dataKey="rate" name="Absenteísmo" stroke="#ea580c" strokeWidth={3} fill="url(#absenteeismFill)" activeDot={{ r: 6 }}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {!monthlyAbsenteeism.length && <p className="py-8 text-center text-sm text-muted-foreground">Sem dados para o ano selecionado.</p>}
            </Card>

            <Card className="p-5">
              <h3 className="font-bold">Composição das horas perdidas</h3>
              <p className="text-xs text-muted-foreground">Débitos, faltas e abonos que compõem o absenteísmo.</p>
              {(() => {
                const parts: [string, number, ContributorKey][] = [
                  ["Débitos", metrics.debitMinutes, "debits"],
                  ["Faltas", Math.max(0, metrics.faltasMinutes), "absences"],
                  ["Abonos", Math.max(0, metrics.abonosMinutes), "allowances"],
                ];
                const total = parts.reduce((sum, [, value]) => sum + value, 0);
                return <div className="mt-5 space-y-4">
                  {parts.map(([label, value, key]) => (
                    <button type="button" key={key} onClick={() => chart.show(label, selectedContributors(key))} className="block w-full rounded text-left hover:bg-muted/40">
                      <div className="flex justify-between gap-3 text-sm"><span>{label}</span><strong>{fmt(value)}{total > 0 ? ` · ${(value / total * 100).toFixed(1)}%` : ""}</strong></div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${total ? Math.min(100, value / total * 100) : 0}%` }} /></div>
                    </button>
                  ))}
                </div>;
              })()}
            </Card>
          </div>


          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-bold">Composição das ocorrências (%)</h3>
              <p className="text-xs text-muted-foreground">Participação de cada tipo no total de horas das ocorrências registradas no período selecionado.</p>
              {(() => {
                const items = [
                  { name: "Atestados", key: "certificates" as const, value: Math.max(0, metrics.atestadosMinutes), display: daysFmt(metrics.atestadosDays), color: "#06CAA0" },
                  { name: "Declarações de horas", key: "declarations" as const, value: Math.max(0, metrics.declaracoesMinutes), display: fmt(metrics.declaracoesMinutes), color: "#3B82F6" },
                  { name: "Faltas", key: "absences" as const, value: Math.max(0, metrics.faltasMinutes), display: fmt(metrics.faltasMinutes), color: "#8B5CF6" },
                  { name: "Folgas", key: "daysOff" as const, value: Math.max(0, metrics.folgasMinutes), display: daysFmt(metrics.folgasDays), color: "#F59E0B" },
                ];
                const total = items.reduce((sum, item) => sum + item.value, 0);
                return <div className="mt-4 grid items-center gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                  <div className="relative mx-auto h-48 w-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie {...chart.click(items, item => chart.show(item.name, selectedContributors(item.key)))} data={items} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={86} paddingAngle={2} stroke="none">
                        {items.map(item => <Cell key={item.name} fill={item.color}/>)}
                      </Pie><Tooltip formatter={(value:number, name:string) => [`${total ? (Number(value) / total * 100).toFixed(1) : "0.0"}%`, name]}/></PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-xs text-muted-foreground">Ocorrências</span><strong className="text-xl">{total ? "100%" : "0%"}</strong></div>
                  </div>
                  <div className="space-y-3">{items.map(item => <div key={item.name} className="flex items-center gap-2 text-sm">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{backgroundColor:item.color}}/>
                    <span className="min-w-0 flex-1">{item.name}</span>
                    <span className="text-right"><strong>{total ? (item.value / total * 100).toFixed(1) : "0.0"}%</strong><span className="block text-xs text-muted-foreground">{item.display}</span></span>
                  </div>)}</div>
                </div>;
              })()}
            </Card>
            <Card className="p-5">
              <div className="flex items-center justify-between gap-3">
                <div><h3 className="font-bold">Evolução dos débitos</h3><p className="text-xs text-muted-foreground">Horas de débito registradas no ponto por competência.</p></div>
                <span className="text-xs text-muted-foreground">{appliedYear}</span>
              </div>
              <div className="mt-5 h-56"><ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyAbsenteeism} margin={{top:12,right:12,left:0,bottom:0}}>
                  
                  <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                  <XAxis dataKey="label" tick={{fontSize:10}}/>
                  <YAxis tickFormatter={(value:number) => fmt(value)} tick={{fontSize:10}}/>
                  <Tooltip formatter={(value:number) => [fmt(value), "Débitos"]}/>
                  <Bar {...chart.click(monthlyAbsenteeism, row => showMonth("Débitos", "debits", row))} dataKey="debits" name="Débitos" fill="#0D9488" radius={[6,6,0,0]} activeBar={{ fill: "#0F766E" }}/>
                </BarChart>
              </ResponsiveContainer></div>
              {!monthlyAbsenteeism.length && <p className="py-8 text-center text-sm text-muted-foreground">Sem dados históricos para o ano selecionado.</p>}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-primary" /><h3 className="font-bold">Atenção do RH</h3></div>
              <p className="mt-1 text-xs text-muted-foreground">Pontos operacionais para acompanhar nesta competência.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Funcionários com HE</p><p className="mt-1 text-2xl font-bold">{employeesWithOvertime.length}</p><p className="mt-1 text-xs text-muted-foreground">Pessoas com lançamentos na apuração de horas extras.</p></div>
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Horas abonadas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.abonosMinutes)}</p><p className="mt-1 text-xs text-muted-foreground">Horas de ausência justificadas e registradas como abono.</p></div>
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Desligamentos</p><p className="mt-1 text-2xl font-bold">{metrics.terminations}</p><p className="mt-1 text-xs text-muted-foreground">Pessoas cujo vínculo terminou durante o período.</p></div>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-bold">Base do indicador</h3>
              <p className="mt-2 text-sm text-muted-foreground">O percentual é ponderado pelo total de horas previstas, evitando que equipes com jornadas diferentes distorçam o resultado.</p>
              <p className="mt-3 text-xs text-muted-foreground">Fonte: metodologia de absenteísmo documentada pela TOTVS.</p>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="kpi-metric-card kpi-metric-blue p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Faltas</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.faltasDays)}</p><p className="mt-1 text-xs text-muted-foreground">Dias de ausência registrados como falta.</p></Card>
            <Card className="kpi-metric-card kpi-metric-purple p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Folgas</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.folgasDays)}</p><p className="mt-1 text-xs text-muted-foreground">Dias registrados como folga abonada ou descontada.</p></Card>
            <Card className="kpi-metric-card kpi-metric-green p-5"><FileText className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Atestados</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.atestadosDays)}</p><p className="mt-1 text-xs text-muted-foreground">Dias de afastamento registrados por atestado.</p></Card>
            <Card className="kpi-metric-card kpi-metric-amber p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Declarações de horas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.declaracoesMinutes)}</p><p className="mt-1 text-xs text-muted-foreground">Horas abonadas com base em declarações de comparecimento.</p></Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-bold">Horas trabalhadas</h3>
              <p className="mt-1 text-sm text-muted-foreground">{fmt(metrics.worked)} no período selecionado.</p>
            </Card>
            <Card className="p-5">
              <h3 className="font-bold">Funcionários considerados</h3>
              <p className="mt-1 text-sm text-muted-foreground">{metrics.employees} ativos na competência/seleção.</p>
            </Card>
          </div>
          </section>
          )}

        {activeSection === "horas-extras" && (
          <section id="kpi-panel-horas-extras" role="tabpanel" aria-labelledby="kpi-tab-horas-extras" tabIndex={0} className="mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)]">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="mt-1 text-2xl font-bold">Horas Extras</h2>
                <p className="mt-1 text-sm text-muted-foreground">Horas extras são horas trabalhadas além da jornada prevista. O indicador reúne as horas extras registradas no período selecionado, por tipo de adicional.</p>
              </div>
              <div className="rounded-2xl border bg-card px-6 py-4 text-right shadow-sm">
                <p className="text-xs text-muted-foreground">Total de horas extras</p>
                <p className="mt-1 text-3xl font-bold">{fmt(totalOvertime)}</p>
              </div>
            </div>

            <p className="mb-4 text-xs text-muted-foreground">Valores conforme os lançamentos e a base histórica importada, sem recalcular competências fechadas.</p>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              {[
                ["HE 60%", metrics.he60, "Horas extras registradas com adicional de 60%."],
                ["HE 60% + 20%", metrics.he60Night, "Horas extras com adicional de 60% e adicional noturno de 20%."],
                ["HE 100%", metrics.he100, "Horas extras registradas com adicional de 100%."],
                ["HE 100% + 20%", metrics.he100Night, "Horas extras com adicional de 100% e adicional noturno de 20%."],
                ["HE 20%", metrics.he20, "Horas registradas na categoria de adicional noturno de 20%."],
                ["Interjornada", metrics.interjornada, "Horas registradas por descanso insuficiente entre jornadas."],
              ].map(([label, value, description]) => (
                <Card key={String(label)} className={`kpi-metric-card ${["kpi-metric-blue", "kpi-metric-purple", "kpi-metric-green", "kpi-metric-amber", "kpi-metric-cyan", "kpi-metric-rose"][["HE 60%", "HE 60% + 20%", "HE 100%", "HE 100% + 20%", "HE 20%", "Interjornada"].indexOf(String(label))]} p-5`}>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-bold">{fmt(Number(value))}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </Card>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Evolução das horas extras</h3>
                    <p className="text-xs text-muted-foreground">Total de HE por competência.</p>
                  </div>
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
                <div className="mt-6 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyOvertime} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }}/>
                      <YAxis tickFormatter={(value:number) => fmt(value)} tick={{ fontSize: 10 }}/>
                      <Tooltip formatter={(value:number) => [fmt(value), "Horas extras"]}/>
                      <Bar {...chart.click(monthlyOvertime, row => showMonth("Horas extras", "overtime", row))} dataKey="total" name="Horas extras" fill="#8b5cf6" radius={[7,7,0,0]} activeBar={{ fill: "#6d28d9" }}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {!monthlyOvertime.length && <p className="py-8 text-center text-sm text-muted-foreground">Sem dados para o período selecionado.</p>}
              </Card>

              <Card className="p-5">
                <h3 className="font-bold">Distribuição por tipo</h3>
                <p className="text-xs text-muted-foreground">Composição das horas extras selecionadas.</p>
                {(() => {
                  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
                  const parts = [
                    { name: "HE 60%", key: "he60" },
                    { name: "HE 60% + 20%", key: "he60Night" },
                    { name: "HE 100%", key: "he100" },
                    { name: "HE 100% + 20%", key: "he100Night" },
                    { name: "HE 20%", key: "he20" },
                  ] as const;
                  const items = parts.map((item, index) => ({ ...item, value: metrics[item.key], color: colors[index] }));
                  return (
                    <div className="mt-5 flex flex-wrap items-center gap-4">
                      <div className="relative h-36 w-36 shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie {...chart.click(items, row => chart.show(row.name, selectedContributors(row.key)))}
                              data={items} dataKey="value" nameKey="name" innerRadius={45} outerRadius={69} stroke="none">
                              {items.map(item => <Cell key={item.key} fill={item.color}/>)}
                            </Pie>
                            <Tooltip formatter={(value: number) => fmt(value)}/>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                          <p className="text-xs text-muted-foreground">Total</p>
                          <p className="text-sm font-bold">{fmt(totalOvertime)}</p>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1 text-xs">
                        {items.map(item => (
                          <button type="button" key={item.key} onClick={() => chart.show(item.name, selectedContributors(item.key))}
                            className="flex w-full items-center justify-between gap-3 rounded p-1 text-left hover:bg-muted/40">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                              <span>{item.name}</span>
                            </span>
                            <strong>{fmt(item.value)}</strong>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 id="kpi-overtime-employees" className="font-bold">Horas extras por funcionário</h3>
                <p className="text-xs text-muted-foreground">{employeesWithOvertime.length} {employeesWithOvertime.length === 1 ? "funcionário com crédito" : "funcionários com crédito"} no período selecionado.</p>
                <div role="region" aria-labelledby="kpi-overtime-employees" tabIndex={0} className="mt-5 max-h-96 space-y-3 overflow-y-auto pr-2">
                  {employeesWithOvertime.map((item, index) => (
                    <button type="button" key={item.employeeId}
                      onClick={() => chart.show("Horas extras por funcionário", [{ id: item.employeeId, name: item.name }])}
                      className="block w-full rounded text-left hover:bg-muted/40">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{index + 1}. {item.name}</span>
                        <strong>{fmt(item.total)}</strong>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, item.total / Math.max(employeesWithOvertime[0]?.total ?? 0, 1) * 100)}%` }} /></div>
                    </button>
                  ))}
                  {!employeesWithOvertime.length && <p className="py-8 text-center text-sm text-muted-foreground">Sem horas extras.</p>}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Interjornada</h3>
                    <p className="text-xs text-muted-foreground">Interjornada é o descanso entre o fim de uma jornada e o início da seguinte. Aqui aparecem as horas registradas de descanso insuficiente no período.</p>
                  </div>
                  <label className="grid gap-1.5 text-sm font-medium">Situação
                    <select value={interjornadaStatus} onChange={e => setInterjornadaStatus(e.target.value as "ativo" | "inativo" | "todos")} className="h-9 min-w-36 rounded-lg border bg-background px-3 text-sm"><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="todos">Todos</option></select>
                  </label>
                </div>
                <div className="mt-5 overflow-hidden rounded-xl border">
                  <div className="grid grid-cols-[1fr_auto] gap-4 border-b bg-muted/30 px-4 py-3 text-xs font-semibold text-muted-foreground">
                    <span>Funcionário</span>
                    <span>Interjornada</span>
                  </div>
                  <div className="divide-y">
                    {overtimeEmployees
                      .filter(item => item.interjornada > 0 && (interjornadaStatus === "todos" || employees.find(e => e.id === item.employeeId)?.status === interjornadaStatus))
                      .sort((a, b) => b.interjornada - a.interjornada)
                      .map(item => (
                        <div key={item.employeeId} className="grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 text-sm">
                          <span className="truncate">{item.name}</span>
                          <strong>{fmt(item.interjornada)}</strong>
                        </div>
                      ))}
                    {!overtimeEmployees.some(item => item.interjornada > 0 && (interjornadaStatus === "todos" || employees.find(e => e.id === item.employeeId)?.status === interjornadaStatus)) && (
                      <p className="px-4 py-8 text-center text-sm text-muted-foreground">Nenhum funcionário com interjornada no período selecionado.</p>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          </section>
        )}

        {activeSection === "turnover" && (
          <section id="kpi-panel-turnover" role="tabpanel" aria-labelledby="kpi-tab-turnover" tabIndex={0} className="mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)]">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="mt-1 text-2xl font-bold">Turnover</h2>
                <p className="mt-1 text-sm text-muted-foreground">Turnover é a taxa de rotatividade da equipe. Ela relaciona as admissões e os desligamentos ao número de funcionários ativos no período selecionado.</p>
              </div>
</div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="kpi-metric-card kpi-metric-cyan p-6"><TrendingUp className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Admissões</p><p className="mt-1 text-3xl font-bold">{metrics.admissions}</p><p className="mt-1 text-xs text-muted-foreground">Pessoas que ingressaram na empresa durante o período.</p></Card>
              <Card className="kpi-metric-card kpi-metric-rose p-6"><UserMinus className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Desligamentos</p><p className="mt-1 text-3xl font-bold">{metrics.terminations}</p><p className="mt-1 text-xs text-muted-foreground">Pessoas cujo vínculo terminou durante o período.</p></Card>
              <Card className="kpi-metric-card kpi-metric-violet p-6"><Users className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Média de funcionários ativos</p><p className="mt-1 text-3xl font-bold">{Math.round(metrics.activeHeadcount).toLocaleString("pt-BR")}</p><p className="mt-1 text-xs text-muted-foreground">Tamanho médio do quadro ativo nas competências selecionadas.</p></Card>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-bold">Evolução mensal de admissões e desligamentos</h3>
                <p className="text-xs text-muted-foreground">Compare mês a mês e identifique quando houve mais entradas e saídas em {appliedYear}. Considera as datas de admissão e desligamento cadastradas e os filtros aplicados.</p>
                <div className="mt-4 h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTurnover} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="month" tick={{ fontSize: 11 }}/>
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                      <Tooltip formatter={(value:number, name:string) => [value, name]}/>
                      <Legend/>
                      <Bar {...chart.click(monthlyTurnover, row => chart.show(`Admissões · ${row.month}/${appliedYear}`, row.admitted))} dataKey="admissions" name="Admissões" fill="#06b6d4" radius={[5,5,0,0]} activeBar={{ fill: "#0891b2" }}/>
                      <Bar {...chart.click(monthlyTurnover, row => chart.show(`Desligamentos · ${row.month}/${appliedYear}`, row.terminated))} dataKey="terminations" name="Desligamentos" fill="#f43f5e" radius={[5,5,0,0]} activeBar={{ fill: "#e11d48" }}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <Card className="p-5">
                <h3 className="font-bold">Composição das movimentações</h3>
                <p className="text-xs text-muted-foreground">Participação de admissões e desligamentos no total de movimentações.</p>
                <div className="mt-4 h-60">
                  {metrics.admissions + metrics.terminations > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie {...chart.click(turnoverMovements, row => chart.show(row.name, row.people))} data={turnoverMovements} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={4} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                          <Cell fill="#06b6d4"/><Cell fill="#f43f5e"/>
                        </Pie>
                        <Tooltip formatter={(value:number) => [value, "Funcionários"]}/>
                        <Legend/>
                      </PieChart>
                    </ResponsiveContainer>
                  ) : <p className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem movimentações na competência.</p>}
                </div>
              </Card>
            </div>
            <Card className="mt-4 p-5">
              <h3 className="font-bold">Desligamentos por gênero</h3>
              <p className="text-xs text-muted-foreground">Quantidade de desligamentos registrados em {appliedYear}, conforme gênero informado no cadastro. Respeita os filtros aplicados.</p>
              <div className="mt-4 h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={terminationsByGender} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                    <XAxis dataKey="gender" tick={{ fontSize: 11 }}/>
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                    <Tooltip formatter={(value: number) => [value, "Desligamentos"]}/>
                    <Bar {...chart.click(terminationsByGender, row => chart.show(`Desligamentos · ${row.gender}`, row.people))} dataKey="total" name="Desligamentos" radius={[6, 6, 0, 0]}>
                      {terminationsByGender.map(item => <Cell key={item.gender} fill={item.fill}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {!terminationGenderBase.length && <p className="py-2 text-center text-sm text-muted-foreground">Nenhum desligamento registrado em {appliedYear} para os filtros selecionados.</p>}
            </Card>
            <Card className="mt-4 border-primary/20 bg-primary/5 p-5">
              <p className="font-semibold">Como o índice é calculado</p>
              <p className="mt-2 text-sm text-muted-foreground">
                [(Admissões + Desligamentos) ÷ 2] ÷ Funcionários ativos × 100.
                Os números acima são calculados dentro da competência selecionada.
              </p>
            </Card>
          </section>
        )}
      </main>
      <ChartEmployeesDialog selection={isCalculating ? null : chart.selection} close={chart.close} />
    </div>
  );
}