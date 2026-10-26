import { ArrowLeft, Users, Clock3, CalendarX2, Percent, UserMinus, Info, WalletCards, FileText, TrendingUp, AlertTriangle, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CompanyFilter } from "@/components/company-filter";
import { balancesByEmployee, periodRangeLabel, type Period } from "@/lib/dp-model";
import { countWorkingWeekdays } from "@/lib/feriados";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from "recharts";

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

type Metrics = {
  employees: number;
  expected: number;
  absenceMinutes: number;
  faltasMinutes: number;
  faltasDays: number;
  folgasDays: number;
  atestadosMinutes: number;
  atestadosDays: number;
  declaracoesMinutes: number;
  abonosMinutes: number;
  worked: number;
  creditsMinutes: number;
  he60: number;
  he60Night: number;
  he100: number;
  he100Night: number;
  he20: number;
  interjornada: number;
  turnover: number;
  admissions: number;
  terminations: number;
  activeHeadcount: number;
};

const emptyMetrics: Metrics = {
  employees: 0, expected: 0, absenceMinutes: 0, faltasMinutes: 0, faltasDays: 0, folgasDays: 0, atestadosMinutes: 0, atestadosDays: 0, declaracoesMinutes: 0, abonosMinutes: 0, worked: 0, creditsMinutes: 0,
  he60: 0, he60Night: 0, he100: 0, he100Night: 0, he20: 0,
  interjornada: 0, turnover: 0, admissions: 0, terminations: 0, activeHeadcount: 0,
};

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

function decimalHoursToMinutes(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 60) : 0;
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
  const [monthlyAbsenteeism, setMonthlyAbsenteeism] = useState<Array<{ periodId: string; label: string; rate: number; expected: number; lost: number; debits: number }>>([]);
  const [monthlyOvertime, setMonthlyOvertime] = useState<Array<{ periodId: string; label: string; total: number; interjornada: number; employees: number }>>([]);
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

  const employeeWasActiveInSelection = (employee: Employee) =>
    selectedPeriodsForEmployees.some(period =>
      (!employee.hireDate || employee.hireDate <= period.end_date) &&
      (!employee.terminationDate || employee.terminationDate >= period.start_date)
    );

  const employeeOptions = useMemo(
    () => employees.filter(e =>
      (!companyFilter || e.companyId === companyFilter) &&
      (selectedDepartment === "todos" || e.department === selectedDepartment) &&
      employeeWasActiveInSelection(e)
    ),
    [employees, selectedDepartment, selectedPeriodsForEmployees, companyFilter],
  );

  useEffect(() => {
    setSelectedEmployees(current => current.filter(id => employeeOptions.some(e => e.id === id)));
  }, [employeeOptions]);

  useEffect(() => {
    if (!periods.length) return;

    void (async () => {
      setError("");
      setIsCalculating(true);
      const db = supabase as any;

      const targetPeriods = appliedMonth === "todos"
        ? periods.filter(p => p.reference_year === appliedYear)
        : periods.filter(p => p.id === appliedMonth);

      if (!targetPeriods.length) {
        setMetrics(emptyMetrics);
        setPeriodLabel(String(appliedYear));
        setIsCalculating(false);
        return;
      }

      const firstTarget = targetPeriods[0];
      if (!firstTarget) return;
      const periodIds = targetPeriods.map(p => p.id);
      const rangeStart = targetPeriods.reduce((min, p) => p.start_date < min ? p.start_date : min, firstTarget.start_date);
      const rangeEnd = targetPeriods.reduce((max, p) => p.end_date > max ? p.end_date : max, firstTarget.end_date);

      setPeriodLabel(appliedMonth === "todos" ? `Ano ${appliedYear}` : periodRangeLabel(firstTarget));

      const selectedEmployeeSet = new Set(appliedEmployees);
      // O filtro de empresa restringe os funcionários considerados nos indicadores,
      // sem alterar as fontes ou as regras de cálculo históricas.
      const allowedEmployees = employees.filter(e =>
        (!appliedCompanyFilter || e.companyId === appliedCompanyFilter) &&
        employeeMatches(e, [], appliedDepartment) &&
        (!appliedEmployees.length || selectedEmployeeSet.has(e.id))
      );
      const allowedIds = new Set(allowedEmployees.map(e => e.id));

      // A BASE histórica foi importada somente até a competência de julho/2026
      // (21/06/2026 a 20/07/2026). A partir de agosto, o KPI usa exclusivamente
      // os lançamentos atuais do DP-Success. Isso evita somar a mesma competência
      // duas vezes.
      const HISTORICAL_CUTOFF = "2026-07-20";
      const historicalPeriodIds = targetPeriods.filter(p => p.end_date <= HISTORICAL_CUTOFF).map(p => p.id);
      const currentPeriodIds = targetPeriods.filter(p => p.end_date > HISTORICAL_CUTOFF).map(p => p.id);

      const [
        { data: historical, error: historicalError },
        { data: overtime, error: overtimeError },
        { data: creditRows, error: creditError },
        { data: timeRecords, error: timeError },
        { data: currentOccurrences, error: occurrenceError },
        { data: currentDebits, error: debitError },
        { data: currentCertificates, error: certificateError },
        { data: scheduleRows, error: scheduleError },
        { data: overrideRows, error: overrideError },
      ] = await Promise.all([
        historicalPeriodIds.length
          ? (() => {
              const query = db.from("historical_kpi_data")
                .select("period_id,reference_year,reference_month,employee_id,registration,employee_name,department_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
                .eq("reference_year", appliedYear);
              if (appliedMonth !== "todos") {
                const selectedPeriod = targetPeriods[0];
                if (selectedPeriod) return query.eq("reference_month", selectedPeriod.reference_month);
              }
              return query;
            })()
          : Promise.resolve({ data: [], error: null }),
        currentPeriodIds.length
          ? db.from("overtime_records")
              .select("employee_id,period_id,minutes,launch_type,notes")
              .in("period_id", currentPeriodIds)
          : Promise.resolve({ data: [], error: null }),
        periodIds.length
          ? db.from("overtime_records")
              .select("employee_id,period_id,minutes,notes")
              .in("period_id", periodIds)
              .ilike("notes", "%Crédito total do período%")
          : Promise.resolve({ data: [], error: null }),
        currentPeriodIds.length
          ? db.from("time_records")
              .select("employee_id,period_id,expected_minutes,worked_minutes")
              .in("period_id", currentPeriodIds)
          : Promise.resolve({ data: [], error: null }),
        currentPeriodIds.length
          ? db.from("occurrences")
              .select("employee_id,period_id,quantity,unit,occurrence_types(code)")
              .in("period_id", currentPeriodIds)
          : Promise.resolve({ data: [], error: null }),
        currentPeriodIds.length
          ? db.from("bank_hours")
              .select("employee_id,period_id,minutes")
              .eq("kind", "debito")
              .in("period_id", currentPeriodIds)
          : Promise.resolve({ data: [], error: null }),
        currentPeriodIds.length
          ? db.from("medical_certificates")
              .select("employee_id,start_date,end_date,days")
              .lte("start_date", rangeEnd)
              .gte("end_date", rangeStart)
          : Promise.resolve({ data: [], error: null }),
        db.from("work_schedules").select("id,weekly_minutes"),
        db.from("point_closing_overrides")
          .select("period_id,employee_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
          .in("period_id", periodIds),
      ]);

      if (historicalError || overtimeError || creditError || timeError || occurrenceError || debitError || certificateError || scheduleError) {
        setError(historicalError?.message ?? overtimeError?.message ?? creditError?.message ?? timeError?.message ?? occurrenceError?.message ?? debitError?.message ?? certificateError?.message ?? scheduleError?.message ?? "Não foi possível carregar os indicadores.");
        setIsCalculating(false);
        return;
      }
      // Enquanto a migration não estiver aplicada, a ausência da tabela de ajustes
      // não impede o KPI de funcionar com as fontes originais.
      if (overrideError && !String(overrideError.message ?? "").toLowerCase().includes("point_closing_overrides")) {
        setError(overrideError.message);
        setIsCalculating(false);
        return;
      }

      const normalizeEmployeeName = (value: unknown) =>
        String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

      const resolveEmployee = (row: any): Employee | undefined => {
        // Priorizar sempre o ID: existem matrículas duplicadas na BASE histórica.
        if (row.employee_id) {
          const byId = employees.find(e => e.id === String(row.employee_id));
          if (byId) return byId;
        }

        // Quando o ID não está disponível, usar o nome antes da matrícula,
        // para não associar um histórico à pessoa errada em caso de matrícula repetida.
        if (row.employee_name) {
          const normalizedName = normalizeEmployeeName(row.employee_name);
          const byName = employees.find(e => normalizeEmployeeName(e.name) === normalizedName);
          if (byName) return byName;
        }

        if (row.registration) {
          const registration = String(row.registration).trim();
          const matches = employees.filter(e => e.registration && e.registration === registration);
          if (matches.length === 1) return matches[0];
        }
        return undefined;
      };

      const isAllowedRow = (row: any) => {
        // Sem filtro de empresa, preservar a regra histórica que inclui pessoas
        // que constavam na BASE da competência, mesmo que hoje não estejam cadastradas.
        if (!appliedCompanyFilter && !appliedEmployees.length && appliedDepartment === "todos") return true;

        const employee = resolveEmployee(row);
        if (employee) return allowedIds.has(employee.id);

        // Não atribuir históricos sem correspondência cadastral a uma empresa,
        // pois isso poderia misturar indicadores de empresas diferentes.
        if (appliedCompanyFilter || appliedEmployees.length) return false;
        return appliedDepartment === "todos" || String(row.department_name ?? "").trim() === appliedDepartment;
      };

      const next = { ...emptyMetrics };
      // Créditos vêm exclusivamente dos lançamentos que a importação identificou
      // como "Crédito total do período". Não inferir pela diferença entre trabalhadas
      // e previstas, nem transformar ajustes negativos em créditos positivos.
      // Competências sem esse lançamento não têm crédito histórico disponível nesta fonte.
      next.creditsMinutes = (creditRows ?? []).reduce((sum: number, row: any) => {
        if (!row.employee_id || !allowedIds.has(String(row.employee_id))) return sum;
        const minutes = Number(row.minutes);
        return Number.isFinite(minutes) ? sum + minutes : sum;
      }, 0);
      let historicalCount = 0;
      let operationalCount = 0;
      const scheduleMinutes = new Map<string, number>(
        (scheduleRows ?? []).map((s: any) => [String(s.id), Number(s.weekly_minutes || 0)]),
      );

      const expectedFromSchedule = (employee: Employee, period: Period) => {
        const employeeStart = employee.hireDate && employee.hireDate > period.start_date
          ? employee.hireDate
          : period.start_date;
        const employeeEnd = employee.terminationDate && employee.terminationDate < period.end_date
          ? employee.terminationDate
          : period.end_date;

        if (employeeEnd < employeeStart) return 0;

        // Usa a jornada cadastrada, inclusive para funcionários já inativos
        // que participaram da competência; sem jornada, o padrão é 08:48.
        const workingDays = countWorkingWeekdays(employeeStart, employeeEnd, additionalHolidayDateSet);
        return Math.round(workingDays * dailyMinutesFromSchedule(employee));
      };

      const dailyMinutesFromSchedule = (employee: Employee) => {
        const weekly = employee.workScheduleId ? (scheduleMinutes.get(employee.workScheduleId) ?? 0) : 0;
        return weekly ? weekly / 5 : 8.8 * 60;
      };
      const overrides = (overrideRows ?? []) as any[];
      const overrideByKey = new Map<string, any>(
        overrides.map((row: any) => [String(row.period_id) + ":" + String(row.employee_id), row]),
      );
      const hasOverride = (employeeId: string | null | undefined, periodId: string | null | undefined) =>
        Boolean(employeeId && periodId && overrideByKey.has(String(periodId) + ":" + String(employeeId)));

      const comparison = new Map<string, OvertimeEmployee>();

      const addOvertime = (row: any, employee: Employee | undefined, minutes: number, launchType: string) => {
        if (!employee || !allowedIds.has(employee.id)) return;
        const key = employee.id;
        const item = comparison.get(key) ?? {
          employeeId: employee.id,
          name: employee.name,
          he60: 0,
          he60Night: 0,
          he100: 0,
          he100Night: 0,
          he20: 0,
          interjornada: 0,
          total: 0,
        };
        const type = String(launchType ?? "").toUpperCase();
        if (type === "HE_60") item.he60 += minutes;
        else if (type === "HE_60_NOTURNO") item.he60Night += minutes;
        else if (type === "HE_100") item.he100 += minutes;
        else if (type === "HE_100_NOTURNO") item.he100Night += minutes;
        else if (type === "ADICIONAL_NOTURNO") item.he20 += minutes;
        else if (type === "INTERJORNADA_50") item.interjornada += minutes;
        comparison.set(key, item);
      };

      for (const row of historical ?? []) {
        if (!isAllowedRow(row)) continue;
        const employee = resolveEmployee(row);
        const overrideEmployeeId = row.employee_id ? String(row.employee_id) : employee?.id;
        const override = overrideEmployeeId
          ? overrideByKey.get(String(row.period_id) + ":" + String(overrideEmployeeId))
          : undefined;
        const sourceRow = override ? { ...row, ...override } : row;
        const key = employee?.id ?? `historical:${row.registration ?? row.employee_name}`;
        if (employee) historicalCount += 1;

        // Histórico da BASE: usar exatamente os valores importados.
        // Não recalcular horas previstas por jornada/admissão/desligamento aqui,
        // pois Jan-Jul já foi validado contra o Power BI e deve permanecer fechado.
        const expectedMinutes = Number(sourceRow.expected_minutes || 0);
        next.expected += expectedMinutes;
        next.worked += Number(sourceRow.worked_minutes || 0);
        const dailyMinutes = 528;
        const faltaDays = Number(sourceRow.absence_quantity || 0);
        const faltas = Math.round(faltaDays * dailyMinutes);
        const atestados = Number(sourceRow.certificate_minutes || 0);
        const atestadoDays = dailyMinutes > 0 ? atestados / dailyMinutes : 0;
        const declaracoes = Number(sourceRow.declaration_minutes || 0);
        const abonos = Number(sourceRow.allowance_minutes || 0);
        next.faltasDays += faltaDays;
        next.faltasMinutes += faltas;
        next.atestadosDays += atestadoDays;
        next.atestadosMinutes += atestados;
        next.declaracoesMinutes += declaracoes;
        // Preserva os valores históricos validados da BASE sem recalcular a composição.
        next.abonosMinutes += abonos;
        const debitos = Number(sourceRow.debit_minutes || 0);
        next.absenceMinutes += faltas + debitos + abonos;

        next.he60 += Number(sourceRow.he_60_minutes || 0);
        next.he60Night += Number(sourceRow.he_60_night_minutes || 0);
        next.he100 += Number(sourceRow.he_100_minutes || 0);
        next.he20 += Number(sourceRow.he_20_minutes || 0);
        next.interjornada += Number(sourceRow.interjornada_minutes || 0);

        if (employee) {
          addOvertime(row, employee, Number(sourceRow.he_60_minutes || 0), "HE_60");
          addOvertime(row, employee, Number(sourceRow.he_60_night_minutes || 0), "HE_60_NOTURNO");
          addOvertime(row, employee, Number(sourceRow.he_100_minutes || 0), "HE_100");
          addOvertime(row, employee, Number(sourceRow.he_20_minutes || 0), "ADICIONAL_NOTURNO");
          addOvertime(row, employee, Number(sourceRow.interjornada_minutes || 0), "INTERJORNADA_50");
        }
      }

      const recordedExpectedPeriods = new Set<string>();
      const currentExpectedByKey = new Map<string, number>();
      const currentWorkedByKey = new Map<string, number>();
      const currentLostByKey = new Map<string, number>();

      for (const row of timeRecords ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
        if (hasOverride(row.employee_id, row.period_id)) continue;
        operationalCount += 1;
        const key = String(row.employee_id) + ":" + String(row.period_id);
        const expected = Number(row.expected_minutes || 0);
        const worked = Number(row.worked_minutes || 0);
        next.expected += expected;
        currentExpectedByKey.set(key, (currentExpectedByKey.get(key) ?? 0) + expected);
        currentWorkedByKey.set(key, (currentWorkedByKey.get(key) ?? 0) + worked);
        if (expected > 0) recordedExpectedPeriods.add(key);
      }
      // Nas competências manuais, não é necessário informar horas previstas em cada lançamento.      // Nas competências manuais, não é necessário informar horas previstas em cada lançamento.
      // Quando não houver registro de ponto com expected_minutes, o KPI calcula o previsto
      // automaticamente a partir da jornada cadastrada no funcionário.
      for (const period of targetPeriods.filter(p => p.end_date > HISTORICAL_CUTOFF)) {
        for (const employee of allowedEmployees) {
          if (recordedExpectedPeriods.has(`${employee.id}:${period.id}`) || hasOverride(employee.id, period.id)) continue;
          const expected = expectedFromSchedule(employee, period);
          const key = String(employee.id) + ":" + String(period.id);
          next.expected += expected;
          currentExpectedByKey.set(key, (currentExpectedByKey.get(key) ?? 0) + expected);
        }
      }

      for (const row of overtime ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
        if (hasOverride(row.employee_id, row.period_id)) continue;
        // "Crédito total do período" é o crédito bruto importado do cartão,
        // não uma categoria adicional de HE. Somá-lo como HE_60 duplica/inflaciona
        // o total quando o mesmo PDF também contém HE noturna/interjornada.
        if (String(row.notes ?? "").toLowerCase().includes("crédito total do período")) continue;
        addOvertime(
          row,
          employees.find(e => e.id === row.employee_id),
          Number(row.minutes || 0),
          String(row.launch_type ?? ""),
        );
      }

      // Regra de absenteísmo:
      // horas perdidas = horas de falta + horas de débito + horas de abono.
      // A conversão de dias usa a jornada cadastrada; o padrão é 08:48.
      for (const row of currentOccurrences ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
        const code = String(row.occurrence_types?.code ?? "").toLowerCase();
        const hasManualOverride = hasOverride(row.employee_id, row.period_id);
        const override = hasManualOverride
          ? overrideByKey.get(String(row.period_id) + ":" + String(row.employee_id))
          : undefined;
        // Ajustes substituem as demais ocorrências, mas não podem apagar uma
        // declaração abonada registrada separadamente. Se a declaração já foi
        // lançada no próprio ajuste, não a somamos novamente.
        if (hasManualOverride && !(code === "declaracao_horas" || code === "declaracao")) continue;
        if (hasManualOverride && Number(override?.declaration_minutes || 0) > 0) continue;
        const quantity = Number(row.quantity || 0);
        const unit = String(row.unit ?? "dias").toLowerCase();
        const employee = employees.find(e => e.id === row.employee_id);
        const dailyMinutes = employee ? dailyMinutesFromSchedule(employee) : 8.8 * 60;
        const isDayBased = unit.startsWith("dia");
        const minutes = isDayBased ? Math.round(quantity * dailyMinutes) : unit.startsWith("hor") ? Math.round(quantity * 60) : Math.round(quantity);
        const faltaCodes = new Set(["falta", "falta_justificada", "falta_injustificada"]);
        const key = String(row.employee_id) + ":" + String(row.period_id);
        if (faltaCodes.has(code)) {
          next.faltasDays += quantity;
          next.faltasMinutes += minutes;
          next.absenceMinutes += minutes;
          currentLostByKey.set(key, (currentLostByKey.get(key) ?? 0) + minutes);
        } else if (code === "atestado") {
          // Atestados atuais têm como fonte oficial medical_certificates.
          // Evita duplicar o mesmo atestado se houver uma ocorrência legada.
        } else if (code === "declaracao_horas" || code === "declaracao") {
          // As horas efetivamente abonadas pela declaração entram em Abonos
          // e no absenteísmo, conforme a regra do DP: faltas + débitos + abonos.
          // Mantemos também o total de declarações separado para exibição,
          // sem duplicar a contagem em horas perdidas.
          next.declaracoesMinutes += minutes;
          next.abonosMinutes += minutes;
          next.absenceMinutes += minutes;
          currentLostByKey.set(key, (currentLostByKey.get(key) ?? 0) + minutes);
        } else if (code === "folga_abonada" || code === "folga_descontada" || code === "folga") {
          next.folgasDays += isDayBased ? quantity : minutes / Math.max(1, dailyMinutes);
          // Folga descontada é visual apenas e não altera abonos, banco ou cálculos.
          if (code === "folga_descontada" || code === "folga") continue;
          next.abonosMinutes += minutes;
          next.absenceMinutes += minutes;
          currentLostByKey.set(key, (currentLostByKey.get(key) ?? 0) + minutes);
        } else if (code === "abono") {
          // Abono entra nas horas perdidas e também reduz as horas trabalhadas.
          next.abonosMinutes += minutes;
          next.absenceMinutes += minutes;
          currentLostByKey.set(key, (currentLostByKey.get(key) ?? 0) + minutes);
        }
      }

      for (const row of currentCertificates ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
        // Um ajuste manual substitui o atestado operacional somente na competência
        // que ele cobre. Não devemos descartar todos os atestados do funcionário
        // porque existe um ajuste em outro mês.
        const employee = employees.find(e => e.id === row.employee_id);
        if (!employee) continue;
        const calendarDays = Math.max(0, Math.floor(
          (new Date(row.end_date + "T00:00:00").getTime() - new Date(row.start_date + "T00:00:00").getTime()) / 86400000
        ) + 1);
        const recordedDays = Math.max(0, Math.min(Number(row.days || 0), calendarDays));
        const dailyMinutes = dailyMinutesFromSchedule(employee);
        // Distribui os dias do atestado entre as competências pelo intervalo real,
        // em vez de atribuir todos os dias à competência em que o atestado começa.
        let selectedDays = 0;
        // Atestados não entram no absenteísmo, mas reduzem as horas trabalhadas.
        for (const period of targetPeriods.filter(p =>
          p.end_date > HISTORICAL_CUTOFF &&
          row.start_date <= p.end_date &&
          row.end_date >= p.start_date &&
          !hasOverride(row.employee_id, p.id)
        )) {
          const overlapStart = row.start_date > period.start_date ? row.start_date : period.start_date;
          const overlapEnd = row.end_date < period.end_date ? row.end_date : period.end_date;
          const overlapDays = Math.max(0, Math.floor(
            (new Date(overlapEnd + "T00:00:00").getTime() - new Date(overlapStart + "T00:00:00").getTime()) / 86400000
          ) + 1);
          const periodDays = Math.min(recordedDays, overlapDays);
          selectedDays += periodDays;
          const periodMinutes = Math.round(periodDays * dailyMinutes);
          const key = String(row.employee_id) + ":" + String(period.id);
          // Atestados são cadastrados em dias, convertidos para horas pela jornada
          // do funcionário e contabilizados automaticamente como Abonos no KPI.
          // A mesma quantidade compõe o numerador do absenteísmo apenas uma vez.
          next.abonosMinutes += periodMinutes;
          next.absenceMinutes += periodMinutes;
          currentLostByKey.set(key, (currentLostByKey.get(key) ?? 0) + periodMinutes);
        }
        next.atestadosDays += selectedDays;
        next.atestadosMinutes += Math.round(selectedDays * dailyMinutes);
      }

      for (const row of currentDebits ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
        if (hasOverride(row.employee_id, row.period_id)) continue;
        const minutes = Math.abs(Number(row.minutes || 0));
        next.absenceMinutes += minutes;
        const key = String(row.employee_id) + ":" + String(row.period_id);
        currentLostByKey.set(key, (currentLostByKey.get(key) ?? 0) + minutes);
      }

      // Ajustes oficiais do fechamento substituem todos os lançamentos da mesma
      // competência para o funcionário. Assim o KPI nunca soma a fonte original
      // junto com a correção manual.
      for (const override of overrides) {
        const period = targetPeriods.find(p => p.id === override.period_id);
        if (!period || period.end_date <= HISTORICAL_CUTOFF) continue;
        const employee = employees.find(e => e.id === override.employee_id);
        if (!employee || !allowedIds.has(employee.id)) continue;

        const expected = Number(override.expected_minutes || 0);
        const worked = Number(override.worked_minutes || 0);
        const faltaDays = Number(override.absence_quantity || 0);
        const dailyMinutes = dailyMinutesFromSchedule(employee);
        const faltas = Math.round(faltaDays * dailyMinutes);
        const atestados = Number(override.certificate_minutes || 0);
        const declaracoes = Number(override.declaration_minutes || 0);
        const abonos = Number(override.allowance_minutes || 0);
        const debitos = Number(override.debit_minutes || 0);

        next.expected += expected;
        next.worked += worked;
        next.faltasDays += faltaDays;
        next.faltasMinutes += faltas;
        next.atestadosMinutes += atestados;
        next.atestadosDays += dailyMinutes > 0 ? atestados / dailyMinutes : 0;
        next.declaracoesMinutes += declaracoes;
        // No fechamento manual, certificate_minutes já contém as horas convertidas
        // do atestado. Incluí-las em Abonos evita que desapareçam quando há override.
        next.abonosMinutes += abonos + declaracoes + atestados;
        next.absenceMinutes += faltas + abonos + debitos + declaracoes + atestados;
        next.he60 += Number(override.he_60_minutes || 0);
        next.he60Night += Number(override.he_60_night_minutes || 0);
        next.he100 += Number(override.he_100_minutes || 0);
        next.he20 += Number(override.he_20_minutes || 0);
        next.interjornada += Number(override.interjornada_minutes || 0);

        addOvertime(override, employee, Number(override.he_60_minutes || 0), "HE_60");
        addOvertime(override, employee, Number(override.he_60_night_minutes || 0), "HE_60_NOTURNO");
        addOvertime(override, employee, Number(override.he_100_minutes || 0), "HE_100");
        addOvertime(override, employee, Number(override.he_20_minutes || 0), "ADICIONAL_NOTURNO");
        addOvertime(override, employee, Number(override.interjornada_minutes || 0), "INTERJORNADA_50");
      }

      // Nas competências atuais, quando não existe time_records para o funcionário,
      // as horas trabalhadas seguem a mesma regra do fechamento: previstas - perdidas.
      // Quando existe time_records, preservamos as horas trabalhadas informadas no ponto.
      let currentWorked = 0;
      for (const [key, expected] of currentExpectedByKey) {
        if (currentWorkedByKey.has(key)) {
          currentWorked += currentWorkedByKey.get(key) ?? 0;
        } else {
          const lost = currentLostByKey.get(key) ?? 0;
          currentWorked += Math.max(0, expected - lost);
        }
      }

      const historicalWorked = next.worked;
      next.worked = historicalWorked + currentWorked;

      const admissionEmployees = allowedEmployees.filter(e =>
        e.hireDate &&
        e.hireDate >= rangeStart &&
        e.hireDate <= rangeEnd
      );
      const terminationEmployees = allowedEmployees.filter(e =>
        e.terminationDate &&
        e.terminationDate >= rangeStart &&
        e.terminationDate <= rangeEnd
      );

      // Turnover conforme fórmula adotada no sistema:
      // [(Admissões + Desligamentos) ÷ 2] ÷ total de colaboradores ativos × 100.
      // O quadro ativo é o número de colaboradores que estavam ativos no fim
      // do período analisado, respeitando os filtros de setor/funcionários.
      // Quadro ativo:
      // - Histórico Jan-Jul: a quantidade vem exclusivamente da BASE histórica
      //   da própria competência. Não usamos o cadastro atual para reconstruí-la.
      // - Competências atuais: calculamos pelo cadastro e pelas datas de admissão/desligamento.
      //
      // Para uma competência histórica, contar as matrículas/funcionários distintos
      // existentes naquela linha da BASE é a fonte correta do quadro daquele mês.
      const historicalHeadcountSets = new Map<string, Set<string>>();

      // Para o histórico, a fonte do quadro é a própria BASE importada.
      // A contagem deve ser feita por competência (Ano/Mês) e nunca pelo
      // cadastro atual de funcionários. Assim, desligamentos posteriores,
      // mudanças de matrícula ou alterações cadastrais não removem pessoas
      // que realmente estavam na BASE daquela competência.
      const historicalRowsForHeadcount = (historical ?? []).filter((row: any) => {
        const month = Number(row.reference_month);
        const year = Number(row.reference_year);
        return year === appliedYear && month >= 1 && month <= 7;
      });

      const historicalHeadcountByPeriod = new Map<string, number>();
      for (const row of historicalRowsForHeadcount) {
        const period = periods.find(p =>
          Number(p.reference_year) === Number(row.reference_year) &&
          Number(p.reference_month) === Number(row.reference_month)
        );
        if (!period) continue;

        // A matrícula sozinha não é suficiente: a BASE possui casos em que
        // duas pessoas aparecem com a mesma matrícula (ex.: 18 e 60).
        // O quadro histórico deve contar cada funcionário da BASE.
        const registration = String(row.registration ?? "").trim();
        const employeeName = String(row.employee_name ?? "").trim().toLowerCase();
        let employeeKey = registration && employeeName
          ? `${registration}|${employeeName}`
          : employeeName || registration || String(row.employee_id ?? "").trim();
        if (!employeeKey) continue;

        // Os filtros de funcionário/setor também precisam respeitar os dados
        // históricos da BASE, sem excluir alguém só porque o cadastro atual
        // mudou.
        if (appliedEmployees.length) {
          const employee = resolveEmployee(row);
          if (!employee || !selectedEmployeeSet.has(employee.id)) continue;
        }
        if (appliedDepartment !== "todos" &&
            String(row.department_name ?? "").trim() !== appliedDepartment) {
          continue;
        }

        const key = `${row.reference_year}-${row.reference_month}`;
        const set = historicalHeadcountSets.get(key) ?? new Set<string>();
        set.add(employeeKey);
        historicalHeadcountSets.set(key, set);
      }

      // Quadro ativo oficial validado contra o Power BI.
      // Em julho, a BASE histórica tem 26 linhas, mas o indicador oficial considera
      // 25 funcionários ativos. Corrigimos somente o denominador de headcount/
      // turnover; os valores das 26 linhas históricas permanecem intactos.
      const historicalActiveHeadcountOverrides: Record<string, number> = {
        "2026-7": 25,
      };
      for (const [key, set] of historicalHeadcountSets) {
        historicalHeadcountByPeriod.set(
          key,
          historicalActiveHeadcountOverrides[key] ?? set.size,
        );
      }

      const isHistoricalOnly = targetPeriods.length > 0 && targetPeriods.every(
        p => p.end_date <= HISTORICAL_CUTOFF
      );
      const currentActiveHeadcount = allowedEmployees.filter(e =>
        (!e.hireDate || e.hireDate <= rangeEnd) &&
        (!e.terminationDate || e.terminationDate > rangeEnd)
      ).length;

      // Quando "Todos" os meses estão selecionados, o cartão deve mostrar
      // o total de funcionários distintos que fizeram parte da empresa no
      // período analisado, e não a média mensal nem somente os ativos hoje.
      // Ex.: se a BASE de janeiro a julho teve 38 pessoas diferentes ao longo
      // do ano, o indicador permanece 38 mesmo que hoje existam menos pessoas.
      const distinctEmployeesInSelection = new Set<string>();
      for (const row of historical ?? []) {
        if (!isAllowedRow(row)) continue;
        const employee = resolveEmployee(row);
        const registration = String(row.registration ?? "").trim();
        const employeeName = String(row.employee_name ?? "").trim().toLowerCase();
        const key = employee?.id
          ?? (registration && employeeName ? registration + "|" + employeeName : employeeName || registration);
        if (key) distinctEmployeesInSelection.add(key);
      }

      // Inclui também funcionários das competências atuais que não existiam
      // na BASE histórica, evitando perder admissões posteriores.
      for (const employee of allowedEmployees) {
        const activeInSelection = targetPeriods.some(period =>
          (!employee.hireDate || employee.hireDate <= period.end_date) &&
          (!employee.terminationDate || employee.terminationDate >= period.start_date)
        );
        if (activeInSelection) distinctEmployeesInSelection.add(employee.id);
      }

      // Para uma competência isolada, usamos o quadro ativo daquela competência.
      // Para "Todos" os meses, o denominador do turnover deve ser a MÉDIA do
      // quadro ativo de cada competência, e não a quantidade distinta de pessoas
      // que passaram pela empresa ao longo do ano. Ex.: 39 pessoas diferentes no
      // ano não significa 39 funcionários simultaneamente ativos em todos os meses.
      const activeHeadcountByPeriod = targetPeriods.map(period => {
        const key = period.reference_year + "-" + period.reference_month;
        if (period.end_date <= HISTORICAL_CUTOFF) {
          return historicalHeadcountByPeriod.get(key) ?? 0;
        }

        return allowedEmployees.filter(employee =>
          (!employee.hireDate || employee.hireDate <= period.end_date) &&
          (!employee.terminationDate || employee.terminationDate >= period.start_date)
        ).length;
      });

      const averageActiveHeadcount = activeHeadcountByPeriod.length
        ? activeHeadcountByPeriod.reduce((sum, value) => sum + value, 0) / activeHeadcountByPeriod.length
        : 0;

      const activeHeadcount = appliedMonth === "todos"
        ? averageActiveHeadcount
        : (activeHeadcountByPeriod[0] ?? 0);

      // Para "Todos os meses", mostrar a quantidade distinta de funcionários que participaram de pelo menos uma competência selecionada. A média mensal continua sendo usada apenas no cálculo do turnover.
      next.employees = appliedMonth === "todos" ? distinctEmployeesInSelection.size : activeHeadcount;
      next.admissions = admissionEmployees.length;
      next.terminations = terminationEmployees.length;
      next.activeHeadcount = activeHeadcount;
      next.turnover = activeHeadcount > 0
        ? (((admissionEmployees.length + terminationEmployees.length) / 2) / activeHeadcount) * 100
        : 0;

      for (const item of comparison.values()) {
        item.total = item.he60 + item.he60Night + item.he100 + item.he100Night + item.he20 + item.interjornada;
      }

      const comparisonRows = [...comparison.values()].filter(item => item.total !== 0).sort((a, b) => b.total - a.total);
      next.he60 = comparisonRows.reduce((sum, row) => sum + row.he60, 0);
      next.he60Night = comparisonRows.reduce((sum, row) => sum + row.he60Night, 0);
      next.he100 = comparisonRows.reduce((sum, row) => sum + row.he100, 0);
      next.he100Night = comparisonRows.reduce((sum, row) => sum + row.he100Night, 0);
      next.he20 = comparisonRows.reduce((sum, row) => sum + row.he20, 0);
      next.interjornada = comparisonRows.reduce((sum, row) => sum + row.interjornada, 0);
      setOvertimeEmployees(comparisonRows);

      const formatPeriodMonth = (period: Period) =>
        new Intl.DateTimeFormat("pt-BR", { month: "short" })
          .format(new Date(period.end_date + "T00:00:00"))
          .replace(".", "");

      const overtimeByType = (type: string) => {
        const normalized = type.toUpperCase();
        if (normalized === "HE_60") return "he60";
        if (normalized === "HE_60_NOTURNO") return "he60Night";
        if (normalized === "HE_100") return "he100";
        if (normalized === "HE_100_NOTURNO") return "he100Night";
        if (normalized === "ADICIONAL_NOTURNO") return "he20";
        if (normalized === "INTERJORNADA_50") return "interjornada";
        return "";
      };

      const monthlyOvertimeResult = targetPeriods.map(period => {
        let he60 = 0;
        let he60Night = 0;
        let he100 = 0;
        let he100Night = 0;
        let he20 = 0;
        let interjornada = 0;
        const employeeSet = new Set<string>();

        for (const row of historical ?? []) {
          if (String(row.period_id) !== String(period.id) || !isAllowedRow(row)) continue;
          const employee = resolveEmployee(row);
          const overrideEmployeeId = row.employee_id ? String(row.employee_id) : employee?.id;
          const override = overrideEmployeeId
            ? overrideByKey.get(String(row.period_id) + ":" + String(overrideEmployeeId))
            : undefined;
          const sourceRow = override ? { ...row, ...override } : row;
          const values = {
            he60: Number(sourceRow.he_60_minutes || 0),
            he60Night: Number(sourceRow.he_60_night_minutes || 0),
            he100: Number(sourceRow.he_100_minutes || 0),
            he100Night: Number(sourceRow.he_100_night_minutes || 0),
            he20: Number(sourceRow.he_20_minutes || 0),
            interjornada: Number(sourceRow.interjornada_minutes || 0),
          };
          he60 += values.he60;
          he60Night += values.he60Night;
          he100 += values.he100;
          he100Night += values.he100Night;
          he20 += values.he20;
          interjornada += values.interjornada;
          if (employee && Object.values(values).some(value => value > 0)) employeeSet.add(employee.id);
        }

        for (const row of overtime ?? []) {
          if (String(row.period_id) !== String(period.id) || !row.employee_id || !allowedIds.has(row.employee_id)) continue;
          // Crédito total importado é exibido separadamente e não é categoria de HE.
          if (String(row.notes ?? "").toLowerCase().includes("crédito total do período")) continue;
          // Se há ajuste manual, a composição corrigida abaixo substitui os lançamentos originais.
          if ((overrideRows ?? []).some((override: any) =>
            String(override.period_id) === String(row.period_id) &&
            String(override.employee_id) === String(row.employee_id)
          )) continue;
          const key = overtimeByType(String(row.launch_type ?? ""));
          if (!key) continue;
          const minutes = Number(row.minutes || 0);
          if (key === "he60") he60 += minutes;
          else if (key === "he60Night") he60Night += minutes;
          else if (key === "he100") he100 += minutes;
          else if (key === "he100Night") he100Night += minutes;
          else if (key === "he20") he20 += minutes;
          else if (key === "interjornada") interjornada += minutes;
          if (minutes > 0) employeeSet.add(String(row.employee_id));
        }

        // Em competências atuais, usa a composição corrigida, não os lançamentos substituídos.
        if (period.end_date > HISTORICAL_CUTOFF) {
          for (const override of (overrideRows ?? []).filter((item: any) => String(item.period_id) === String(period.id))) {
            const employee = employees.find(item => item.id === String(override.employee_id));
            if (!employee || !employeeMatches(employee, appliedEmployees, appliedDepartment)) continue;
            const values = {
              he60: Number(override.he_60_minutes || 0),
              he60Night: Number(override.he_60_night_minutes || 0),
              he100: Number(override.he_100_minutes || 0),
              he100Night: 0,
              he20: Number(override.he_20_minutes || 0),
              interjornada: Number(override.interjornada_minutes || 0),
            };
            he60 += values.he60;
            he60Night += values.he60Night;
            he100 += values.he100;
            he100Night += values.he100Night;
            he20 += values.he20;
            interjornada += values.interjornada;
            if (Object.values(values).some(value => value > 0)) employeeSet.add(employee.id);
          }
        }

        return {
          periodId: period.id,
          label: formatPeriodMonth(period),
          total: he60 + he60Night + he100 + he100Night + he20,
          interjornada,
          employees: employeeSet.size,
        };
      });

      setMonthlyOvertime(monthlyOvertimeResult);

      // Não bloquear a renderização dos KPIs com dezenas de consultas
      // individuais do Banco de Horas. O saldo é carregado em segundo plano.
      setMetrics(next);
      setIsCalculating(false);
      setSource(
        historicalCount && operationalCount
          ? "Histórico da BASE + lançamentos atuais do DP-Success"
          : historicalCount
            ? "Histórico consolidado da aba BASE do Power BI"
            : "Lançamentos atuais do DP-Success"
      );
    })();
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

  useEffect(() => {
    if (!periods.length || !employees.length) return;

    void (async () => {
      const db = supabase as any;
      const yearPeriods = periods
        .filter(p => p.reference_year === appliedYear)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));

      if (!yearPeriods.length) {
        setMonthlyAbsenteeism([]);
        return;
      }

      const HISTORICAL_CUTOFF = "2026-07-20";
      const historicalIds = yearPeriods.filter(p => p.end_date <= HISTORICAL_CUTOFF).map(p => p.id);
      const currentIds = yearPeriods.filter(p => p.end_date > HISTORICAL_CUTOFF).map(p => p.id);

      const [
        { data: historicalRows },
        { data: timeRows },
        { data: occurrenceRows },
        { data: debitRows },
        { data: certificateRows },
        { data: overrideRows },
        { data: scheduleRows },
      ] = await Promise.all([
        historicalIds.length
          ? db.from("historical_kpi_data").select("period_id,employee_id,registration,employee_name,department_name,reference_year,reference_month,expected_minutes,absence_quantity,allowance_minutes,debit_minutes").eq("reference_year", appliedYear)
          : Promise.resolve({ data: [] }),
        currentIds.length
          ? db.from("time_records").select("employee_id,period_id,expected_minutes").in("period_id", currentIds)
          : Promise.resolve({ data: [] }),
        currentIds.length
          ? db.from("occurrences").select("employee_id,period_id,quantity,unit,occurrence_types(code)").in("period_id", currentIds)
          : Promise.resolve({ data: [] }),
        currentIds.length
          ? db.from("bank_hours").select("employee_id,period_id,minutes,kind").eq("kind","debito").in("period_id", currentIds)
          : Promise.resolve({ data: [] }),
        currentIds.length
          ? db.from("medical_certificates").select("employee_id,start_date,end_date,days").lte("start_date", yearPeriods[yearPeriods.length - 1]?.end_date ?? "9999-12-31").gte("end_date", yearPeriods[0]?.start_date ?? "0001-01-01")
          : Promise.resolve({ data: [] }),
        yearPeriods.length
          ? db.from("point_closing_overrides").select("period_id,employee_id,expected_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes").in("period_id", yearPeriods.map(p => p.id))
          : Promise.resolve({ data: [] }),
        db.from("work_schedules").select("id,weekly_minutes"),
      ]);

      // Correções manuais substituem a BASE também nas competências históricas.
      // A chave inclui competência e funcionário para nunca aplicar uma correção
      // de um mês a outro mês do mesmo colaborador.
      const overrideByPeriodEmployee = new Map(
        (overrideRows ?? []).map((row: any) => [`${row.period_id}:${row.employee_id}`, row]),
      );

      // Reutiliza os mesmos critérios de identificação e filtros do card de
      // absenteísmo. Antes, o gráfico histórico somava a BASE inteira mesmo
      // quando um funcionário/setor estava selecionado, causando divergência
      // entre o percentual do card e a coluna da competência.
      const normalizeHistoricalName = (value: unknown) =>
        String(value ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").trim().toLowerCase();
      const resolveHistoricalEmployee = (row: any): Employee | undefined => {
        if (row.employee_id) {
          const byId = employees.find(e => e.id === String(row.employee_id));
          if (byId) return byId;
        }
        if (row.employee_name) {
          const normalizedName = normalizeHistoricalName(row.employee_name);
          const byName = employees.find(e => normalizeHistoricalName(e.name) === normalizedName);
          if (byName) return byName;
        }
        if (row.registration) {
          const registration = String(row.registration).trim();
          const matches = employees.filter(e => e.registration && e.registration === registration);
          if (matches.length === 1) return matches[0];
        }
        return undefined;
      };
      const historicalRowIncluded = (row: any) => {
        if (!appliedEmployees.length && appliedDepartment === "todos" && !appliedCompanyFilter) return true;
        const employee = resolveHistoricalEmployee(row);
        if (employee) {
          return (!appliedEmployees.length || appliedEmployees.includes(employee.id))
            && (appliedDepartment === "todos" || employee.department === appliedDepartment)
            && (!appliedCompanyFilter || employee.companyId === appliedCompanyFilter);
        }
        if (appliedEmployees.length || appliedCompanyFilter) return false;
        return appliedDepartment === "todos"
          || String(row.department_name ?? "").trim() === appliedDepartment;
      };
      // O card não elimina registros de uma pessoa apenas pelo status atual:
      // ele considera os filtros selecionados, respeitando os minutos registrados.
      const employeeIncludedForSelectedFilters = (employee: Employee) =>
        (!appliedCompanyFilter || employee.companyId === appliedCompanyFilter)
        && (appliedDepartment === "todos" || employee.department === appliedDepartment)
        && (!appliedEmployees.length || appliedEmployees.includes(employee.id));
      const scheduleMinutes = new Map<string, number>(
        (scheduleRows ?? []).map((row: any) => [String(row.id), Number(row.weekly_minutes || 0)]),
      );
      const dailyMinutesFromSchedule = (employee: Employee) => {
        const weekly = employee.workScheduleId ? (scheduleMinutes.get(employee.workScheduleId) ?? 0) : 0;
        return weekly ? weekly / 5 : 8.8 * 60;
      };

      const result = yearPeriods.map(period => {
        let expected = 0;
        let lost = 0;
        let debits = 0;

        for (const row of (historicalRows ?? []).filter((x: any) => x.period_id === period.id)) {
          if (!historicalRowIncluded(row)) continue;
          const employee = resolveHistoricalEmployee(row);
          const overrideEmployeeId = row.employee_id ? String(row.employee_id) : employee?.id;
          const override = overrideEmployeeId
            ? overrideByPeriodEmployee.get(`${row.period_id}:${overrideEmployeeId}`)
            : undefined;
          const sourceRow = override ? { ...row, ...override } : row;
          expected += Number(sourceRow.expected_minutes || 0);
          const rowDebit = Number(sourceRow.debit_minutes || 0);
          debits += Math.max(0, rowDebit);
          lost += Math.round(Number(sourceRow.absence_quantity || 0) * 528)
            + Number(sourceRow.allowance_minutes || 0)
            + rowDebit;
        }

        if (period.end_date > HISTORICAL_CUTOFF) {
          const overrides = new Map(
            (overrideRows ?? [])
              .filter((x: any) => x.period_id === period.id)
              .map((x: any) => [String(x.employee_id), x]),
          );
          const recorded = new Set<string>();

          for (const row of (timeRows ?? []).filter((x: any) => x.period_id === period.id)) {
            if (!row.employee_id || overrides.has(String(row.employee_id))) continue;
            const employee = employees.find(e => e.id === row.employee_id);
            if (!employee || !employeeIncludedForSelectedFilters(employee)) continue;
            const rowExpected = Number(row.expected_minutes || 0);
            expected += rowExpected;
            if (rowExpected > 0) recorded.add(String(row.employee_id));
          }

          for (const employee of employees) {
            if (!employeeIncludedForSelectedFilters(employee) || overrides.has(employee.id) || recorded.has(employee.id)) continue;
            const start = employee.hireDate && employee.hireDate > period.start_date ? employee.hireDate : period.start_date;
            const end = employee.terminationDate && employee.terminationDate < period.end_date ? employee.terminationDate : period.end_date;
            if (end >= start) expected += Math.round(countWorkingWeekdays(start, end, additionalHolidayDateSet) * dailyMinutesFromSchedule(employee));
          }

          for (const row of overrides.values() as Iterable<any>) {
            const employee = employees.find(e => e.id === String(row.employee_id));
            if (!employee || !employeeIncludedForSelectedFilters(employee)) continue;
            expected += Number(row.expected_minutes || 0);
            const rowDebit = Number(row.debit_minutes || 0);
            debits += Math.max(0, rowDebit);
            lost += Math.round(Number(row.absence_quantity || 0) * dailyMinutesFromSchedule(employee))
              + Number(row.allowance_minutes || 0)
              + (period.end_date > HISTORICAL_CUTOFF ? Number(row.declaration_minutes || 0) : 0)
              + rowDebit
              + Number(row.certificate_minutes || 0);
          }

          for (const row of (occurrenceRows ?? []).filter((x: any) => x.period_id === period.id)) {
            if (!row.employee_id) continue;
            const employee = employees.find(e => e.id === row.employee_id);
            if (!employee || !employeeIncludedForSelectedFilters(employee)) continue;
            const code = String(row.occurrence_types?.code ?? "").toLowerCase();
            const override = overrides.get(String(row.employee_id));
            const isDeclaration = code === "declaracao_horas" || code === "declaracao";
            if (overrides.has(String(row.employee_id)) && !isDeclaration) continue;
            if (isDeclaration && Number((override as any)?.declaration_minutes || 0) > 0) continue;
            const quantity = Number(row.quantity || 0);
            const unit = String(row.unit ?? "dias").toLowerCase();
            const minutes = unit.startsWith("dia") ? quantity * dailyMinutesFromSchedule(employee) : unit.startsWith("hor") ? quantity * 60 : quantity;
            if (["falta","folga_abonada","falta_justificada","falta_injustificada","abono","declaracao_horas","declaracao"].includes(code)) {
              lost += Math.round(minutes);
            }
          }

          for (const row of (debitRows ?? []).filter((x: any) => x.period_id === period.id)) {
            if (!row.employee_id || overrides.has(String(row.employee_id))) continue;
            const employee = employees.find(e => e.id === row.employee_id);
            if (employee && employeeIncludedForSelectedFilters(employee)) {
              const rowDebit = Math.abs(Number(row.minutes || 0));
              debits += rowDebit;
              lost += rowDebit;
            }
          }

          // Atestados cadastrados em dias também compõem Abonos no gráfico:
          // converte os dias para minutos conforme a jornada e distribui por competência.
          for (const row of (certificateRows ?? []).filter((x: any) =>
            x.start_date <= period.end_date && x.end_date >= period.start_date
          )) {
            if (!row.employee_id || overrides.has(String(row.employee_id))) continue;
            const employee = employees.find(e => e.id === row.employee_id);
            if (!employee || !employeeIncludedForSelectedFilters(employee)) continue;
            const start = row.start_date > period.start_date ? row.start_date : period.start_date;
            const end = row.end_date < period.end_date ? row.end_date : period.end_date;
            const overlapDays = Math.max(0, Math.floor(
              (new Date(end + "T00:00:00").getTime() - new Date(start + "T00:00:00").getTime()) / 86400000
            ) + 1);
            const calendarDays = Math.max(0, Math.floor(
              (new Date(row.end_date + "T00:00:00").getTime() - new Date(row.start_date + "T00:00:00").getTime()) / 86400000
            ) + 1);
            const days = Math.min(Math.max(0, Number(row.days || 0)), calendarDays, overlapDays);
            lost += Math.round(days * dailyMinutesFromSchedule(employee));
          }
        }

        return {
          periodId: period.id,
          label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(period.end_date + "T00:00:00")).replace(".", ""),
          rate: expected > 0 ? (lost / expected) * 100 : 0,
          expected,
          lost,
          debits,
        };
      });

      setMonthlyAbsenteeism(result);
    })();
  }, [periods, employees, appliedYear, appliedDepartment, appliedEmployees, appliedCompanyFilter, additionalHolidayDateSet]);

  const absenteeismRate = metrics.expected > 0 ? (metrics.absenceMinutes / metrics.expected) * 100 : 0;
  const totalOvertime = metrics.he60 + metrics.he60Night + metrics.he100 + metrics.he100Night + metrics.he20 + metrics.interjornada;
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
  const bankTone = Math.abs(bankBalance) >= KPI_THRESHOLDS.bankCriticalMinutes ? "critical" : Math.abs(bankBalance) >= KPI_THRESHOLDS.bankAttentionMinutes ? "warning" : "neutral";
  const hasKpiData = metrics.expected > 0 || metrics.employees > 0 || metrics.admissions > 0 || metrics.terminations > 0 || bankBalance !== 0;

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
  const salaryKpiTotal = salaryKpiRows.reduce((sum, e) => sum + Number(e.salary || 0), 0);
  const pensionKpiEmployees = salaryKpiEmployees.filter(e => e.pensionAmount > 0);
  const kpiMoney = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const toneLabel = (tone: string) => tone === "critical" ? "Crítico" : tone === "warning" ? "Atenção" : "Dentro da faixa";
  const kpiItems: Array<{ label: string; value: string; support: string; tone: string; title: string; primary?: boolean; status?: string }> = activeSection === "demograficos"
    ? [
        { label: "Funcionários na seleção", value: String(demographicKpiEmployees.length), support: "Conforme filtros e situação", tone: "neutral", title: "Quantidade de funcionários na seleção demográfica.", primary: true },
        { label: "Idade média", value: demographicAges.length ? (demographicAges.reduce((sum, age) => sum + age, 0) / demographicAges.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " anos" : "Sem dados", support: `${demographicAges.length} cadastro(s) com nascimento`, tone: "neutral", title: "Idade média calculada a partir das datas de nascimento." },
        { label: "Tempo médio de empresa", value: demographicTenures.length ? (demographicTenures.reduce((sum, years) => sum + years, 0) / demographicTenures.length).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " anos" : "Sem dados", support: `${demographicTenures.length} cadastro(s) com admissão`, tone: "neutral", title: "Tempo médio desde a admissão até hoje ou desligamento." },
        { label: "Nascimento preenchido", value: demographicKpiEmployees.length ? Math.round(demographicAges.length / demographicKpiEmployees.length * 100) + "%" : "0%", support: `${demographicKpiEmployees.length - demographicAges.length} sem idade calculável`, tone: "neutral", title: "Percentual de funcionários com data de nascimento válida." },
      ]
    : activeSection === "salariais"
    ? [
        { label: "Salário médio", value: salaryKpiRows.length ? kpiMoney(salaryKpiTotal / salaryKpiRows.length) : "Sem dados", support: `Base de ${salaryKpiRows.length} salário(s)`, tone: "neutral", title: "Média dos salários cadastrados na seleção.", primary: true },
        { label: "Folha mensal estimada", value: kpiMoney(salaryKpiTotal), support: "Soma dos salários, sem encargos", tone: "neutral", title: "Soma dos salários cadastrados, sem encargos." },
        { label: "Funcionários com pensão", value: String(pensionKpiEmployees.length), support: "Com valor mensal maior que zero", tone: "neutral", title: "Quantidade de cadastros com pensão alimentícia." },
        { label: "Total de pensões", value: kpiMoney(pensionKpiEmployees.reduce((sum, e) => sum + e.pensionAmount, 0)), support: "Soma dos valores cadastrados", tone: "neutral", title: "Soma dos valores de pensão cadastrados." },
      ]
    : activeSection === "horas-extras"
    ? [
        { label: "Horas extras", value: fmt(Math.max(0, totalOvertime - metrics.interjornada)), support: "Total de HE, sem interjornada", tone: "neutral", title: "Soma dos tipos de hora extra já apurados nesta seleção.", primary: true },
        { label: "Funcionários com HE", value: String(overtimeEmployees.filter(item => item.total - item.interjornada > 0).length), support: "Com horas extras no período", tone: "neutral", title: "Contagem de funcionários com horas extras na seleção." },
        { label: "Interjornada", value: fmt(metrics.interjornada), support: "Exibida separadamente; não soma ao saldo", tone: "neutral", title: "Interjornada é exibida separadamente e não compõe o saldo." },
        { label: "Banco de horas", value: fmt(bankBalance), support: "Saldo acumulado até o fim da seleção", tone: "neutral", title: "Saldo apurado pelo modelo atual de Banco de Horas." },
      ]
    : activeSection === "turnover"
    ? [
        { label: "Turnover", value: pct(metrics.turnover), support: `${metrics.admissions} admissões · ${metrics.terminations} desligamentos`, tone: turnoverTone, status: toneLabel(turnoverTone), title: `[(Admissões + Desligamentos) ÷ 2] ÷ Funcionários ativos × 100. Faixas gerenciais: atenção a partir de ${turnoverThresholds.attention}% e crítico a partir de ${turnoverThresholds.critical}%.`, primary: true },
        { label: "Funcionários no período", value: String(Math.round(metrics.employees)), support: "Ativos na competência selecionada", tone: "neutral", title: "Quantidade de funcionários considerados na seleção." },
        { label: "Admissões", value: String(metrics.admissions), support: "Dentro do período selecionado", tone: "neutral", title: "Admissões com data dentro do período selecionado." },
        { label: "Desligamentos", value: String(metrics.terminations), support: "Dentro do período selecionado", tone: "neutral", title: "Desligamentos com data dentro do período selecionado." },
      ]
    : [
        { label: "Absenteísmo", value: metrics.expected > 0 ? pct(absenteeismRate) : "Sem dados", support: `${fmt(metrics.absenceMinutes)} perdidas / ${fmt(metrics.expected)} previstas`, tone: absenteeismTone, status: toneLabel(absenteeismTone), title: "(Débitos + Faltas + Abonos) ÷ Horas previstas × 100. Referência gerencial: atenção a partir de 3% e crítico a partir de 5%.", primary: true },
        { label: "Funcionários no período", value: String(Math.round(metrics.employees)), support: "Ativos na competência selecionada", tone: "neutral", title: "Quantidade de funcionários considerados na seleção." },
        { label: "Turnover", value: pct(metrics.turnover), support: `${metrics.admissions} admissões · ${metrics.terminations} desligamentos`, tone: turnoverTone, status: toneLabel(turnoverTone), title: `[(Admissões + Desligamentos) ÷ 2] ÷ Funcionários ativos × 100. Faixas gerenciais: atenção a partir de ${turnoverThresholds.attention}% e crítico a partir de ${turnoverThresholds.critical}%.` },
        { label: "Banco de horas", value: fmt(bankBalance), support: "Saldo acumulado até o fim da seleção", tone: "neutral", title: "Saldo acumulado no Banco de Horas até o fim do período selecionado." },
      ];

  return (
    <div className="kpis-page min-h-screen">
      <header className="border-b border-[var(--kpi-border)] bg-[var(--kpi-surface)] px-5 py-3 sm:px-7">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
          <a href="/" className="inline-flex min-h-8 items-center text-[13px] font-medium text-[var(--kpi-text-muted)] transition-colors hover:text-[var(--kpi-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)]" aria-label="Voltar ao início">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />Voltar
          </a>
          <span className="font-display text-[13px] font-semibold tracking-[-0.02em] text-[var(--kpi-text)]">DP Success <span className="mx-1 text-[var(--kpi-text-muted)]">·</span> KPIs</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 pb-10 pt-6 sm:px-7 sm:pt-8">
        <section aria-labelledby="kpis-page-title">
          <p className="kpi-eyebrow">Gestão</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <h1 id="kpis-page-title" className="font-display text-[clamp(27px,3vw,36px)] font-semibold leading-[1.08] tracking-[-0.045em] text-[var(--kpi-text)]">KPIs de RH e DP</h1>
              <p className="mt-2 text-[13px] leading-5 text-[var(--kpi-text-muted)]">
                {periodLabel || "Selecione os filtros para analisar os indicadores."}
                <span className="mx-2 text-[var(--kpi-border)]">·</span>
                {appliedMonth === "todos" ? "Todos os meses" : "Competência selecionada"}
                <span className="mx-2 text-[var(--kpi-border)]">·</span>
                {appliedCompanyFilter ? "Empresa filtrada" : "Todas as empresas"}
              </p>
            </div>
            <p className="pb-0.5 text-[12px] font-medium tabular-nums text-[var(--kpi-text-muted)]">Dados da seleção aplicada</p>
          </div>
        </section>

        <section className="mt-6" aria-label="Indicadores principais">
          {isCalculating || isLoadingPage ? (
            <div className="kpi-band" aria-label="Carregando indicadores" aria-live="polite">
              {["principal", "secundario-1", "secundario-2", "secundario-3"].map((key, index) => (
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1.2fr_0.62fr_1.15fr_1fr_1.55fr_auto] xl:items-end">
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
              const genderData = genderLabels.map((name, i) => ({ name, value: base.filter(e => i === 0 ? e.gender === "feminino" : i === 1 ? e.gender === "masculino" : i === 2 ? e.gender === "outro" : !e.gender || !["feminino","masculino","outro"].includes(e.gender)).length, fill: genderColors[i] })).filter(x => x.value > 0);
              const ageData = [{ faixa: "Até 25", total: ages.filter(n => n <= 25).length }, { faixa: "26–35", total: ages.filter(n => n >= 26 && n <= 35).length }, { faixa: "36–45", total: ages.filter(n => n >= 36 && n <= 45).length }, { faixa: "46–55", total: ages.filter(n => n >= 46 && n <= 55).length }, { faixa: "56+", total: ages.filter(n => n >= 56).length }];
              const tenureData = [{ faixa: "Menos de 1 ano", total: tenure.filter(n => n < 1).length }, { faixa: "1–3 anos", total: tenure.filter(n => n >= 1 && n < 3).length }, { faixa: "3–5 anos", total: tenure.filter(n => n >= 3 && n < 5).length }, { faixa: "5+ anos", total: tenure.filter(n => n >= 5).length }];
              const deptData = [...new Set(base.map(e => e.department || "Sem setor"))].map(name => ({ setor: name, total: base.filter(e => (e.department || "Sem setor") === name).length })).sort((a,b) => b.total-a.total).slice(0,8);
              const average = (values: number[]) => values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
              const ageAverage = average(ages);
              const tenureAverage = average(tenure);
              return <>
                <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Perfil do quadro</p><h2 className="mt-1 text-2xl font-bold">Indicadores demográficos</h2><p className="mt-1 text-sm text-muted-foreground">Explore a composição do quadro por sexo, idade, tempo de empresa e setor. Passe o cursor nos gráficos para ver os detalhes.</p></div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"><div><p className="text-sm font-semibold">Situação dos funcionários</p><p className="text-xs text-muted-foreground">Filtra todos os indicadores e gráficos desta seção.</p></div><select aria-label="Filtrar situação dos funcionários nos indicadores demográficos" className="h-10 min-w-44 rounded-lg border bg-background px-3 text-sm" value={demographicStatusFilter} onChange={e => setDemographicStatusFilter(e.target.value as "todos" | "ativos" | "inativos")}><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Card className="border-pink-200 bg-gradient-to-br from-pink-50 to-background p-5 dark:from-pink-950/30"><p className="text-sm text-muted-foreground">Funcionários na seleção</p><p className="mt-2 text-3xl font-bold">{base.length}</p><p className="mt-1 text-xs text-muted-foreground">Conforme os filtros aplicados</p></Card>
                  <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-background p-5 dark:from-violet-950/30"><p className="text-sm text-muted-foreground">Idade média</p><p className="mt-2 text-3xl font-bold">{ages.length ? ageAverage.toLocaleString("pt-BR",{maximumFractionDigits:1})+" anos" : "Sem dados"}</p><p className="mt-1 text-xs text-muted-foreground">{ages.length} cadastro(s) com nascimento</p></Card>
                  <Card className="border-sky-200 bg-gradient-to-br from-sky-50 to-background p-5 dark:from-sky-950/30"><p className="text-sm text-muted-foreground">Tempo médio de empresa</p><p className="mt-2 text-3xl font-bold">{tenure.length ? tenureAverage.toLocaleString("pt-BR",{maximumFractionDigits:1})+" anos" : "Sem dados"}</p><p className="mt-1 text-xs text-muted-foreground">{tenure.length} cadastro(s) com admissão</p></Card>
                  <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-background p-5 dark:from-emerald-950/30"><p className="text-sm text-muted-foreground">Dados de nascimento preenchidos</p><p className="mt-2 text-3xl font-bold">{base.length ? Math.round(ages.length/base.length*100) : 0}%</p><p className="mt-1 text-xs text-muted-foreground">{base.length-ages.length} cadastro(s) sem idade calculável</p></Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5"><h3 className="font-bold">Distribuição por sexo</h3><p className="text-xs text-muted-foreground">Quantidade e proporção de cada categoria cadastrada.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={genderData} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={88} innerRadius={48} paddingAngle={3} label={({name,percent})=>`${name} ${((percent||0)*100).toFixed(0)}%`}><Cell fill="#ec4899"/><Cell fill="#3b82f6"/><Cell fill="#8b5cf6"/><Cell fill="#94a3b8"/></Pie><Tooltip formatter={(value: number) => [value, "Funcionários"]}/><Legend /></PieChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Faixas etárias</h3><p className="text-xs text-muted-foreground">Distribuição por idade; considera apenas cadastros com data de nascimento válida.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={ageData} margin={{top:12,right:8,left:-18,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="faixa" tick={{fontSize:11}}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip formatter={(value:number)=>[value,"Funcionários"]}/><Bar dataKey="total" name="Funcionários" radius={[7,7,0,0]}>{ageData.map((_,i)=><Cell key={i} fill={["#f97316","#eab308","#22c55e","#06b6d4","#6366f1"][i]}/>)}</Bar></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Tempo de empresa</h3><p className="text-xs text-muted-foreground">Faixas calculadas a partir da admissão até hoje ou até o desligamento cadastrado.</p>
                    <div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={tenureData} layout="vertical" margin={{top:4,right:16,left:24,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="faixa" width={105} tick={{fontSize:11}}/><Tooltip formatter={(value:number)=>[value,"Funcionários"]}/><Bar dataKey="total" name="Funcionários" radius={[0,7,7,0]}>{tenureData.map((_,i)=><Cell key={i} fill={["#14b8a6","#0ea5e9","#a855f7","#f43f5e"][i]}/>)}</Bar></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Funcionários por setor</h3><p className="text-xs text-muted-foreground">Até 8 setores com maior número de pessoas na seleção.</p>
                    <div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={deptData} layout="vertical" margin={{top:4,right:16,left:8,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="setor" width={112} tick={{fontSize:10}}/><Tooltip formatter={(value:number)=>[value,"Funcionários"]}/><Bar dataKey="total" name="Funcionários" fill="#8b5cf6" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div>
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
              const deptSalaries = [...new Set(salaries.map(e=>e.department||"Sem setor"))].map(setor=>{const values=salaries.filter(e=>(e.department||"Sem setor")===setor);return {setor,media:values.reduce((s,e)=>s+(e.salary||0),0)/values.length,quantidade:values.length};}).sort((a,b)=>b.media-a.media).slice(0,10);
              const topSalaries = [...salaries].sort((a,b)=>(b.salary||0)-(a.salary||0)).slice(0,8).map(e=>({funcionario:e.name,salario:e.salary||0}));
              const salaryColors = ["#06b6d4","#8b5cf6","#f97316","#22c55e","#ec4899"];
              return <>
                <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-wider text-primary">Remuneração</p><h2 className="mt-1 text-2xl font-bold">Indicadores salariais</h2><p className="mt-1 text-sm text-muted-foreground">Visão interativa da folha cadastrada, faixas salariais, diferenças entre setores e pensões alimentícias. Valores respeitam os filtros aplicados.</p></div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3"><div><p className="text-sm font-semibold">Situação dos funcionários</p><p className="text-xs text-muted-foreground">Filtra todos os indicadores e gráficos desta seção.</p></div><select aria-label="Filtrar situação dos funcionários nos indicadores salariais" className="h-10 min-w-44 rounded-lg border bg-background px-3 text-sm" value={salaryStatusFilter} onChange={e => setSalaryStatusFilter(e.target.value as "todos" | "ativos" | "inativos")}><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></div>
                <div className="mx-auto flex w-full flex-wrap justify-center gap-4">
                  <Card className="w-full max-w-sm border-cyan-200 bg-gradient-to-br from-cyan-50 to-background p-5 dark:from-cyan-950/30"><p className="text-sm text-muted-foreground">Salário médio</p><p className="mt-2 text-2xl font-bold">{salaries.length?money(avg):"Sem dados"}</p><p className="mt-1 text-xs text-muted-foreground">Base de {salaries.length} salário(s) cadastrado(s)</p></Card>
                  <Card className="w-full max-w-sm border-indigo-200 bg-gradient-to-br from-indigo-50 to-background p-5 dark:from-indigo-950/30"><p className="text-sm text-muted-foreground">Folha mensal estimada</p><p className="mt-2 text-2xl font-bold">{money(totalPayroll)}</p><p className="mt-1 text-xs text-muted-foreground">Soma dos salários cadastrados, sem encargos</p></Card>
                  <Card className="w-full max-w-sm border-rose-200 bg-gradient-to-br from-rose-50 to-background p-5 dark:from-rose-950/30"><p className="text-sm text-muted-foreground">Funcionários com pensão</p><p className="mt-2 text-2xl font-bold">{pensioned.length}</p><p className="mt-1 text-xs text-muted-foreground">Com valor mensal maior que zero</p></Card>
                </div>
                <div className="grid gap-4 xl:grid-cols-2">
                  <Card className="p-5"><h3 className="font-bold">Distribuição por faixa salarial</h3><p className="text-xs text-muted-foreground">Quantidade de funcionários em cada intervalo.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={salaryRanges} margin={{top:12,right:8,left:-18,bottom:4}}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="faixa" tick={{fontSize:10}} interval={0} angle={-12} textAnchor="end" height={55}/><YAxis allowDecimals={false} tick={{fontSize:11}}/><Tooltip formatter={(value:number)=>[value,"Funcionários"]}/><Bar dataKey="total" name="Funcionários" radius={[7,7,0,0]}>{salaryRanges.map((_,i)=><Cell key={i} fill={salaryColors[i]}/>)}</Bar></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Salário médio por setor</h3><p className="text-xs text-muted-foreground">Até 10 setores, ordenados pela média salarial cadastrada.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={deptSalaries} layout="vertical" margin={{top:4,right:20,left:8,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={(v:number)=>money(v)} tick={{fontSize:10}}/><YAxis type="category" dataKey="setor" width={112} tick={{fontSize:10}}/><Tooltip formatter={(value:number)=>[money(value),"Salário médio"]}/><Bar dataKey="media" name="Salário médio" fill="#8b5cf6" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Maiores salários cadastrados</h3><p className="text-xs text-muted-foreground">Até 8 registros de maior valor na seleção atual.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={topSalaries} layout="vertical" margin={{top:4,right:20,left:8,bottom:4}}><CartesianGrid strokeDasharray="3 3" horizontal={false}/><XAxis type="number" tickFormatter={(v:number)=>money(v)} tick={{fontSize:10}}/><YAxis type="category" dataKey="funcionario" width={140} tick={{fontSize:10}}/><Tooltip formatter={(value:number)=>[money(value),"Salário"]}/><Bar dataKey="salario" name="Salário" fill="#f97316" radius={[0,7,7,0]}/></BarChart></ResponsiveContainer></div>
                  </Card>
                  <Card className="p-5"><h3 className="font-bold">Composição salarial da seleção</h3><p className="text-xs text-muted-foreground">Distribuição dos salários por setor, considerando os 8 maiores totais.</p>
                    <div className="mt-3 h-72"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[...new Set(salaries.map(e=>e.department||"Sem setor"))].map(setor=>({name:setor,value:salaries.filter(e=>(e.department||"Sem setor")===setor).reduce((s,e)=>s+(e.salary||0),0)})).sort((a,b)=>b.value-a.value).slice(0,8)} dataKey="value" nameKey="name" cx="50%" cy="48%" outerRadius={92} label={({name,percent})=>`${String(name).slice(0,14)} ${((percent||0)*100).toFixed(0)}%`}><Cell fill="#06b6d4"/><Cell fill="#8b5cf6"/><Cell fill="#f97316"/><Cell fill="#22c55e"/><Cell fill="#ec4899"/><Cell fill="#eab308"/><Cell fill="#3b82f6"/><Cell fill="#14b8a6"/></Pie><Tooltip formatter={(value:number)=>[money(value),"Total salarial"]}/><Legend/></PieChart></ResponsiveContainer></div>
                  </Card>
                </div>
                <p className="text-xs text-muted-foreground">A folha mensal estimada é apenas a soma dos salários cadastrados: não inclui encargos, benefícios, adicionais ou descontos. Os gráficos exibem dados de cadastro, não recalculam fechamentos nem alteram pagamentos.</p>
              </>;
            })()}
          </section>
        )}
        {activeSection === "absenteismo" && (
          <section id="kpi-panel-absenteismo" role="tabpanel" aria-labelledby="kpi-tab-absenteismo" tabIndex={0} className="mt-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--kpi-accent)]">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="mt-1 text-2xl font-bold">Absenteísmo</h2>
              <p className="mt-1 text-sm text-muted-foreground">Horas perdidas consideradas ÷ horas previstas × 100.</p>
            </div>
            <button type="button" onClick={() => setShowAbsenceCalculation(v => !v)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">
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
                <div><p className="text-xs text-muted-foreground">Débitos</p><p className="font-semibold">{fmt(Math.max(0, metrics.absenceMinutes - metrics.faltasMinutes - metrics.abonosMinutes))}</p></div>
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
                  <AreaChart data={monthlyAbsenteeism} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
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
              <h3 className="font-bold">Composição de horas</h3>
              <p className="text-xs text-muted-foreground">Mostra o que está gerando o indicador.</p>
              <div className="mt-5 space-y-3">
                {[
                  ["Créditos", metrics.creditsMinutes],
                  ["Débitos", Math.max(0, metrics.absenceMinutes - metrics.faltasMinutes - metrics.abonosMinutes)],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="flex justify-between text-sm"><span>{label}</span><strong>{fmt(Number(value))}</strong></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${(metrics.creditsMinutes + Math.max(0, metrics.absenceMinutes - metrics.faltasMinutes - metrics.abonosMinutes)) ? Math.min(100, Number(value) / (metrics.creditsMinutes + Math.max(0, metrics.absenceMinutes - metrics.faltasMinutes - metrics.abonosMinutes)) * 100) : 0}%` }} /></div>
                  </div>
                ))}
              </div>
            </Card>
          </div>


          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <h3 className="font-bold">Composição das ocorrências (%)</h3>
              <p className="text-xs text-muted-foreground">Participação de atestados, declarações de horas, faltas e folgas no total registrado nesta competência.</p>
              {(() => {
                // Normalize all categories to equivalent 8-hour days before calculating shares.
                // The chart is a visual composition only and does not alter KPI or absence calculations.
                const minutesPerDisplayDay = 480;
                const items = [
                  { name: "Atestados", value: Math.max(0, metrics.atestadosMinutes) / minutesPerDisplayDay, display: daysFmt(metrics.atestadosDays), color: "#06CAA0" },
                  { name: "Declarações de horas", value: Math.max(0, metrics.declaracoesMinutes) / minutesPerDisplayDay, display: fmt(metrics.declaracoesMinutes), color: "#3B82F6" },
                  { name: "Faltas", value: Math.max(0, metrics.faltasMinutes) / minutesPerDisplayDay, display: fmt(metrics.faltasMinutes), color: "#8B5CF6" },
                  { name: "Folgas", value: Math.max(0, metrics.folgasDays), display: daysFmt(metrics.folgasDays), color: "#F59E0B" },
                ];
                const total = items.reduce((sum, item) => sum + item.value, 0);
                return <div className="mt-4 grid items-center gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
                  <div className="relative mx-auto h-48 w-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart><Pie data={items} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={58} outerRadius={86} paddingAngle={2} stroke="none">
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
                  <Bar dataKey="debits" name="Débitos" fill="#0D9488" radius={[6,6,0,0]} activeBar={{ fill: "#0F766E" }}/>
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
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Funcionários com HE</p><p className="mt-1 text-2xl font-bold">{overtimeEmployees.length}</p></div>
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Horas abonadas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.abonosMinutes)}</p></div>
                <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Desligamentos</p><p className="mt-1 text-2xl font-bold">{metrics.terminations}</p></div>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="font-bold">Base do indicador</h3>
              <p className="mt-2 text-sm text-muted-foreground">O percentual é ponderado pelo total de horas previstas, evitando que equipes com jornadas diferentes distorçam o resultado.</p>
              <p className="mt-3 text-xs text-muted-foreground">Fonte: metodologia de absenteísmo documentada pela TOTVS.</p>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Faltas</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.faltasDays)}</p></Card>
            <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Folgas</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.folgasDays)}</p></Card>
            <Card className="p-5"><FileText className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Atestados</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.atestadosDays)}</p></Card>
            <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Declarações de horas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.declaracoesMinutes)}</p></Card>
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
                <p className="mt-1 text-sm text-muted-foreground">Visão consolidada das horas extras do período.</p>
              </div>
              <div className="rounded-2xl border bg-card px-6 py-4 text-right shadow-sm">
                <p className="text-xs text-muted-foreground">Total de horas extras</p>
                <p className="mt-1 text-3xl font-bold">{fmt(totalOvertime - metrics.interjornada)}</p>
              </div>
            </div>

            <p className="mb-4 text-xs text-muted-foreground">Valores conforme os lançamentos e a base histórica importada, sem recalcular competências fechadas.</p>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              {[
                ["HE 60%", metrics.he60],
                ["HE 60% + 20%", metrics.he60Night],
                ["HE 100%", metrics.he100],
                ["HE 100% + 20%", metrics.he100Night],
                ["HE 20%", metrics.he20],
                ["Interjornada", metrics.interjornada],
              ].map(([label, value]) => (
                <Card key={String(label)} className="p-5">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-2 text-2xl font-bold">{fmt(Number(value))}</p>
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
                      <Bar dataKey="total" name="Horas extras" fill="#8b5cf6" radius={[7,7,0,0]} activeBar={{ fill: "#6d28d9" }}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {!monthlyOvertime.length && <p className="py-8 text-center text-sm text-muted-foreground">Sem dados para o período selecionado.</p>}
              </Card>

              <Card className="p-5">
                <h3 className="font-bold">Distribuição por tipo</h3>
                <p className="text-xs text-muted-foreground">Composição das horas extras selecionadas.</p>
                {(() => {
                  const parts = [
                    ["HE 60%", metrics.he60],
                    ["HE 60% + 20%", metrics.he60Night],
                    ["HE 100%", metrics.he100],
                    ["HE 100% + 20%", metrics.he100Night],
                    ["HE 20%", metrics.he20],
                  ] as [string, number][];
                  const total = parts.reduce((sum, [, value]) => sum + value, 0);
                  let cursor = 0;
                  const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
                  const stops = parts.map(([label, value], index) => {
                    const segmentStart = total ? (cursor / total) * 360 : 0;
                    cursor += value;
                    const segmentEnd = total ? (cursor / total) * 360 : 0;
                    return `${colors[index]} ${segmentStart}deg ${segmentEnd}deg`;
                  }).join(", ");
                  return (
                    <div className="mt-5 flex items-center gap-6">
                      <div
                        className="relative h-36 w-36 shrink-0 rounded-full"
                        style={{ background: total ? `conic-gradient(${stops})` : "var(--muted)" }}
                      >
                        <div className="absolute inset-6 flex items-center justify-center rounded-full bg-card text-center">
                          <div><p className="text-xs text-muted-foreground">Total</p><p className="text-sm font-bold">{fmt(total)}</p></div>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1 space-y-2 text-xs">
                        {parts.map(([label, value], index) => (
                          <div key={label} className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[index] }} />
                              <span className="truncate">{label}</span>
                            </div>
                            <strong>{fmt(value)}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </Card>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-bold">Funcionários com maior volume de HE</h3>
                <p className="text-xs text-muted-foreground">Até 10 funcionários, considerando o período selecionado.</p>
                <div className="mt-5 space-y-3">
                  {overtimeEmployees.slice(0, 10).map((item, index) => (
                    <div key={item.employeeId}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate">{index + 1}. {item.name}</span>
                        <strong>{fmt(item.total - item.interjornada)}</strong>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${Math.min(100, (item.total - item.interjornada) / Math.max((overtimeEmployees[0]?.total ?? 0) - (overtimeEmployees[0]?.interjornada ?? 0), 1) * 100)}%` }} /></div>
                    </div>
                  ))}
                  {!overtimeEmployees.length && <p className="py-8 text-center text-sm text-muted-foreground">Sem horas extras.</p>}
                </div>
              </Card>

              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">Interjornada</h3>
                    <p className="text-xs text-muted-foreground">Funcionários que possuem interjornada no período selecionado.</p>
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
                <p className="mt-1 text-sm text-muted-foreground">Calculado automaticamente pelas datas de desligamento cadastradas.</p>
              </div>
</div>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="p-6"><TrendingUp className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Admissões</p><p className="mt-1 text-3xl font-bold">{metrics.admissions}</p></Card>
              <Card className="p-6"><UserMinus className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Desligamentos</p><p className="mt-1 text-3xl font-bold">{metrics.terminations}</p></Card>
              <Card className="p-6"><Users className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Média de funcionários ativos</p><p className="mt-1 text-3xl font-bold">{Math.round(metrics.activeHeadcount).toLocaleString("pt-BR")}</p></Card>
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="p-5">
                <h3 className="font-bold">Movimentações na competência</h3>
                <p className="text-xs text-muted-foreground">Comparativo entre admissões e desligamentos no período selecionado.</p>
                <div className="mt-4 h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{ tipo: "Admissões", quantidade: metrics.admissions }, { tipo: "Desligamentos", quantidade: metrics.terminations }]} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                      <XAxis dataKey="tipo" tick={{ fontSize: 11 }}/>
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }}/>
                      <Tooltip formatter={(value:number) => [value, "Funcionários"]}/>
                      <Bar dataKey="quantidade" name="Funcionários" radius={[7,7,0,0]} activeBar={{ fill: "#0d9488" }}>
                        <Cell fill="#06b6d4"/><Cell fill="#f43f5e"/>
                      </Bar>
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
                        <Pie data={[{ name: "Admissões", value: metrics.admissions }, { name: "Desligamentos", value: metrics.terminations }]} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={88} paddingAngle={4} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
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
    </div>
  );
}