import { ArrowLeft, Users, Clock3, CalendarX2, Percent, UserMinus, Info, WalletCards, FileText, TrendingUp, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { balancesByEmployee, periodRangeLabel, type Period } from "@/lib/dp-model";
import { countWorkingWeekdays } from "@/lib/feriados";

type Employee = {
  id: string;
  name: string;
  registration: string;
  department: string;
  hireDate: string | null;
  terminationDate: string | null;
  status: string;
  workScheduleId: string | null;
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
  atestadosMinutes: number;
  atestadosDays: number;
  declaracoesMinutes: number;
  abonosMinutes: number;
  worked: number;
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
  employees: 0, expected: 0, absenceMinutes: 0, faltasMinutes: 0, faltasDays: 0, atestadosMinutes: 0, atestadosDays: 0, declaracoesMinutes: 0, abonosMinutes: 0, worked: 0,
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
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState("todos");
  const [selectedDepartment, setSelectedDepartment] = useState("todos");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [employeeFilterOpen, setEmployeeFilterOpen] = useState(false);
  const [periodLabel, setPeriodLabel] = useState("");
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<"absenteismo" | "horas-extras" | "turnover">("absenteismo");
  const [overtimeEmployees, setOvertimeEmployees] = useState<OvertimeEmployee[]>([]);
  const [source, setSource] = useState("");
  const [bankBalance, setBankBalance] = useState(0);
  const [monthlyAbsenteeism, setMonthlyAbsenteeism] = useState<Array<{ periodId: string; label: string; rate: number; expected: number; lost: number }>>([]);
  const [showAbsenceCalculation, setShowAbsenceCalculation] = useState(false);

  useEffect(() => {
    void (async () => {
      const db = supabase as any;
      const [{ data: periodRows, error: periodError }, { data: employeeRows, error: employeeError }] = await Promise.all([
        db.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("start_date", { ascending: false }),
        db.from("employees").select("id,full_name,registration,department_id,hire_date,termination_date,status,work_schedule_id,departments(name)").order("full_name"),
      ]);

      if (periodError || employeeError) {
        setError(periodError?.message ?? employeeError?.message ?? "Não foi possível carregar os KPIs.");
        return;
      }

      const parsedEmployees: Employee[] = (employeeRows ?? []).map((e: any) => ({
        id: e.id,
        name: e.full_name,
        registration: String(e.registration ?? "").trim(),
        department: String(e.departments?.name ?? "").trim(),
        hireDate: e.hire_date ?? null,
        terminationDate: e.termination_date ?? null,
        status: e.status ?? "ativo",
        workScheduleId: e.work_schedule_id ?? null,
      }));

      const parsedPeriods = (periodRows ?? []) as Period[];
      setEmployees(parsedEmployees);
      setPeriods(parsedPeriods);

      const years = [...new Set(parsedPeriods.map(p => p.reference_year))].sort((a, b) => b - a);
      const firstYear = years[0];
      if (firstYear !== undefined) setSelectedYear(firstYear);
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
      (selectedDepartment === "todos" || e.department === selectedDepartment) &&
      employeeWasActiveInSelection(e)
    ),
    [employees, selectedDepartment, selectedPeriodsForEmployees],
  );

  useEffect(() => {
    setSelectedEmployees(current => current.filter(id => employeeOptions.some(e => e.id === id)));
  }, [employeeOptions]);

  useEffect(() => {
    if (!periods.length) return;

    void (async () => {
      setError("");
      const db = supabase as any;

      const targetPeriods = selectedMonth === "todos"
        ? periods.filter(p => p.reference_year === selectedYear)
        : periods.filter(p => p.id === selectedMonth);

      if (!targetPeriods.length) {
        setMetrics(emptyMetrics);
        setPeriodLabel(String(selectedYear));
        return;
      }

      const firstTarget = targetPeriods[0];
      if (!firstTarget) return;
      const periodIds = targetPeriods.map(p => p.id);
      const rangeStart = targetPeriods.reduce((min, p) => p.start_date < min ? p.start_date : min, firstTarget.start_date);
      const rangeEnd = targetPeriods.reduce((max, p) => p.end_date > max ? p.end_date : max, firstTarget.end_date);

      setPeriodLabel(selectedMonth === "todos" ? `Ano {selectedYear}` : periodRangeLabel(firstTarget));

      const selectedEmployeeSet = new Set(selectedEmployees);
      const allowedEmployees = employees.filter(e => employeeMatches(e, [], selectedDepartment) && (!selectedEmployees.length || selectedEmployeeSet.has(e.id)));
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
                .eq("reference_year", selectedYear);
              if (selectedMonth !== "todos") {
                const selectedPeriod = targetPeriods[0];
                if (selectedPeriod) return query.eq("reference_month", selectedPeriod.reference_month);
              }
              return query;
            })()
          : Promise.resolve({ data: [], error: null }),
        currentPeriodIds.length
          ? db.from("overtime_records")
              .select("employee_id,period_id,minutes,launch_type")
              .in("period_id", currentPeriodIds)
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
        db.from("work_schedules").select("id,weekly_minutes").eq("active", true),
        db.from("point_closing_overrides")
          .select("period_id,employee_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
          .in("period_id", periodIds),
      ]);

      if (historicalError || overtimeError || timeError || occurrenceError || debitError || certificateError || scheduleError) {
        setError(historicalError?.message ?? overtimeError?.message ?? timeError?.message ?? occurrenceError?.message ?? debitError?.message ?? certificateError?.message ?? scheduleError?.message ?? "Não foi possível carregar os indicadores.");
        return;
      }
      // Enquanto a migration não estiver aplicada, a ausência da tabela de ajustes
      // não impede o KPI de funcionar com as fontes originais.
      if (overrideError && !String(overrideError.message ?? "").toLowerCase().includes("point_closing_overrides")) {
        setError(overrideError.message);
        return;
      }

      const resolveEmployee = (row: any): Employee | undefined =>
        employees.find(e =>
          (row.employee_id && e.id === row.employee_id) ||
          (row.registration && e.registration && String(row.registration).trim() === e.registration) ||
          (row.employee_name && e.name.trim().toLowerCase() === String(row.employee_name).trim().toLowerCase())
        );

      const isAllowedRow = (row: any) => {
        // Quando "Todos os funcionários" e "Todos os setores" estão selecionados,
        // o histórico deve considerar todos os funcionários que existem na BASE
        // de cada competência, mesmo que hoje não estejam no cadastro ativo.
        // Isso é necessário para que o absenteísmo de janeiro em diante não
        // desapareça por alterações cadastrais posteriores.
        if (!selectedEmployees.length && selectedDepartment === "todos") return true;

        const employee = resolveEmployee(row);
        if (employee) return allowedIds.has(employee.id);
        if (selectedEmployees.length) return false;
        return selectedDepartment === "todos" || String(row.department_name ?? "").trim() === selectedDepartment;
      };

      const next = { ...emptyMetrics };
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

        // O fechamento de ponto usa 08:48 (528 min) por dia útil.
        // Essa regra também precisa funcionar para funcionários já inativos
        // que participaram da competência; portanto, não dependemos do status
        // atual nem de uma jornada ainda ativa no cadastro.
        const workingDays = countWorkingWeekdays(employeeStart, employeeEnd);
        return Math.round(workingDays * 528);
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
        const override = employee ? overrideByKey.get(String(row.period_id) + ":" + String(employee.id)) : undefined;
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
        next.abonosMinutes += abonos;
        // Absenteísmo: considerar somente faltas + abonos + débitos.
        // Atestados e declarações NÃO entram no cálculo do indicador.
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
        addOvertime(
          row,
          employees.find(e => e.id === row.employee_id),
          Math.abs(Number(row.minutes || 0)),
          String(row.launch_type ?? ""),
        );
      }

      // Regra de absenteísmo:
      // horas perdidas = horas de falta + horas de débito + horas de abono.
      // Uma falta de 1 dia corresponde a 08:48 (528 minutos).
      for (const row of currentOccurrences ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
        if (hasOverride(row.employee_id, row.period_id)) continue;
        const code = String(row.occurrence_types?.code ?? "").toLowerCase();
        const quantity = Number(row.quantity || 0);
        const unit = String(row.unit ?? "dias").toLowerCase();
        const employee = employees.find(e => e.id === row.employee_id);
        const dailyMinutes = employee ? dailyMinutesFromSchedule(employee) : 8.8 * 60;
        const isDayBased = unit.startsWith("dia");
        const minutes = isDayBased ? Math.round(quantity * dailyMinutes) : unit.startsWith("hor") ? Math.round(quantity * 60) : Math.round(quantity);
        const faltaCodes = new Set(["falta", "folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"]);
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
          next.declaracoesMinutes += minutes;
          // Declarações são exibidas separadamente, mas NÃO entram no absenteísmo.
        } else if (code === "abono") {
          next.abonosMinutes += minutes;
          next.absenceMinutes += minutes;
        }
      }

      for (const row of currentCertificates ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
        if (currentPeriodIds.some(id => hasOverride(row.employee_id, id))) {
          const overlappingOverride = currentPeriodIds.find(id => hasOverride(row.employee_id, id));
          if (overlappingOverride) continue;
        }
        const employee = employees.find(e => e.id === row.employee_id);
        if (!employee) continue;
        const selectedDays = Math.max(0, Math.min(
          Number(row.days || 0),
          Math.floor((new Date(row.end_date + "T00:00:00").getTime() - new Date(row.start_date + "T00:00:00").getTime()) / 86400000) + 1,
        ));
        const dailyMinutes = 528;
        const minutes = Math.round(selectedDays * dailyMinutes);
        next.atestadosDays += selectedDays;
        next.atestadosMinutes += minutes;
        // Atestados não entram no absenteísmo, mas reduzem as horas trabalhadas.
        for (const period of targetPeriods.filter(p =>
          p.end_date > HISTORICAL_CUTOFF &&
          row.start_date <= p.end_date &&
          row.end_date >= p.start_date
        )) {
          const overlapStart = row.start_date > period.start_date ? row.start_date : period.start_date;
          const overlapEnd = row.end_date < period.end_date ? row.end_date : period.end_date;
          const overlapDays = Math.max(0, Math.floor(
            (new Date(overlapEnd + "T00:00:00").getTime() - new Date(overlapStart + "T00:00:00").getTime()) / 86400000
          ) + 1);
          const periodMinutes = Math.min(selectedDays, overlapDays) * dailyMinutes;
          const key = String(row.employee_id) + ":" + String(period.id);
          currentLostByKey.set(key, (currentLostByKey.get(key) ?? 0) + Math.round(periodMinutes));
        }
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
        const faltas = Math.round(faltaDays * 528);
        const atestados = Number(override.certificate_minutes || 0);
        const declaracoes = Number(override.declaration_minutes || 0);
        const abonos = Number(override.allowance_minutes || 0);
        const debitos = Number(override.debit_minutes || 0);

        next.expected += expected;
        next.worked += worked;
        next.faltasDays += faltaDays;
        next.faltasMinutes += faltas;
        next.atestadosMinutes += atestados;
        next.atestadosDays += atestados / 528;
        next.declaracoesMinutes += declaracoes;
        next.abonosMinutes += abonos;
        next.absenceMinutes += faltas + abonos + debitos;
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
        return year === selectedYear && month >= 1 && month <= 7;
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
        if (selectedEmployees.length) {
          const employee = resolveEmployee(row);
          if (!employee || !selectedEmployeeSet.has(employee.id)) continue;
        }
        if (selectedDepartment !== "todos" &&
            String(row.department_name ?? "").trim() !== selectedDepartment) {
          continue;
        }

        const key = `${row.reference_year}-${row.reference_month}`;
        const set = historicalHeadcountSets.get(key) ?? new Set<string>();
        set.add(employeeKey);
        historicalHeadcountSets.set(key, set);
      }

      for (const [key, set] of historicalHeadcountSets) {
        historicalHeadcountByPeriod.set(key, set.size);
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

      const activeHeadcount = selectedMonth === "todos"
        ? averageActiveHeadcount
        : (activeHeadcountByPeriod[0] ?? 0);

      next.employees = activeHeadcount;
      next.admissions = admissionEmployees.length;
      next.terminations = terminationEmployees.length;
      next.activeHeadcount = activeHeadcount;
      next.turnover = activeHeadcount > 0
        ? (((admissionEmployees.length + terminationEmployees.length) / 2) / activeHeadcount) * 100
        : 0;

      for (const item of comparison.values()) {
        item.total = item.he60 + item.he100 + item.he100Night + item.he20 + item.interjornada;
      }

      const comparisonRows = [...comparison.values()].filter(item => item.total > 0).sort((a, b) => b.total - a.total);
      next.he60 = comparisonRows.reduce((sum, row) => sum + row.he60, 0);
      next.he60Night = comparisonRows.reduce((sum, row) => sum + row.he60Night, 0);
      next.he100 = comparisonRows.reduce((sum, row) => sum + row.he100, 0);
      next.he100Night = comparisonRows.reduce((sum, row) => sum + row.he100Night, 0);
      next.he20 = comparisonRows.reduce((sum, row) => sum + row.he20, 0);
      next.interjornada = comparisonRows.reduce((sum, row) => sum + row.interjornada, 0);
      setOvertimeEmployees(comparisonRows);

      try {
        const lastTarget = [...targetPeriods].sort((a, b) => a.end_date.localeCompare(b.end_date)).at(-1);
        if (lastTarget) {
          const balances = await Promise.all(
            allowedEmployees.map(async employee => {
              const rows = await balancesByEmployee(employee.id);
              return rows.find(row => row.period.id === lastTarget.id)?.accumulated ?? 0;
            }),
          );
          setBankBalance(balances.reduce((sum, value) => sum + value, 0));
        } else {
          setBankBalance(0);
        }
      } catch {
        setBankBalance(0);
      }

      setMetrics(next);
      setSource(
        historicalCount && operationalCount
          ? "Histórico da BASE + lançamentos atuais do DP-Success"
          : historicalCount
            ? "Histórico consolidado da aba BASE do Power BI"
            : "Lançamentos atuais do DP-Success"
      );
    })();
  }, [periods, employees, selectedYear, selectedMonth, selectedDepartment, selectedEmployees]);

  useEffect(() => {
    if (!periods.length || !employees.length) return;

    void (async () => {
      const db = supabase as any;
      const yearPeriods = periods
        .filter(p => p.reference_year === selectedYear)
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
        { data: overrideRows },
      ] = await Promise.all([
        historicalIds.length
          ? db.from("historical_kpi_data").select("period_id,reference_year,reference_month,expected_minutes,absence_quantity,allowance_minutes,debit_minutes").eq("reference_year", selectedYear)
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
          ? db.from("point_closing_overrides").select("period_id,employee_id,expected_minutes,absence_quantity,allowance_minutes,debit_minutes").in("period_id", currentIds)
          : Promise.resolve({ data: [] }),
      ]);

      const employeeIncludedForPeriod = (employee: Employee, period: Period) => {
        const active = (!employee.hireDate || employee.hireDate <= period.end_date)
          && (!employee.terminationDate || employee.terminationDate >= period.start_date);
        const departmentOk = selectedDepartment === "todos" || employee.department === selectedDepartment;
        const employeeOk = !selectedEmployees.length || selectedEmployees.includes(employee.id);
        return active && departmentOk && employeeOk;
      };

      const result = yearPeriods.map(period => {
        let expected = 0;
        let lost = 0;

        for (const row of (historicalRows ?? []).filter((x: any) => x.period_id === period.id)) {
          expected += Number(row.expected_minutes || 0);
          lost += Math.round(Number(row.absence_quantity || 0) * 528)
            + Number(row.allowance_minutes || 0)
            + Number(row.debit_minutes || 0);
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
            if (!employee || !employeeIncludedForPeriod(employee, period)) continue;
            expected += Number(row.expected_minutes || 0);
            recorded.add(String(row.employee_id));
          }

          for (const employee of employees) {
            if (!employeeIncludedForPeriod(employee, period) || overrides.has(employee.id) || recorded.has(employee.id)) continue;
            const start = employee.hireDate && employee.hireDate > period.start_date ? employee.hireDate : period.start_date;
            const end = employee.terminationDate && employee.terminationDate < period.end_date ? employee.terminationDate : period.end_date;
            if (end >= start) expected += countWorkingWeekdays(start, end) * 528;
          }

          for (const row of overrides.values() as Iterable<any>) {
            expected += Number(row.expected_minutes || 0);
            lost += Math.round(Number(row.absence_quantity || 0) * 528)
              + Number(row.allowance_minutes || 0)
              + Number(row.debit_minutes || 0);
          }

          for (const row of (occurrenceRows ?? []).filter((x: any) => x.period_id === period.id)) {
            if (!row.employee_id || overrides.has(String(row.employee_id))) continue;
            const employee = employees.find(e => e.id === row.employee_id);
            if (!employee || !employeeIncludedForPeriod(employee, period)) continue;
            const code = String(row.occurrence_types?.code ?? "").toLowerCase();
            const quantity = Number(row.quantity || 0);
            const unit = String(row.unit ?? "dias").toLowerCase();
            const minutes = unit.startsWith("dia") ? quantity * 528 : unit.startsWith("hor") ? quantity * 60 : quantity;
            if (["falta","folga_abonada","folga_descontada","falta_justificada","falta_injustificada","abono"].includes(code)) {
              lost += Math.round(minutes);
            }
          }

          for (const row of (debitRows ?? []).filter((x: any) => x.period_id === period.id)) {
            if (!row.employee_id || overrides.has(String(row.employee_id))) continue;
            const employee = employees.find(e => e.id === row.employee_id);
            if (employee && employeeIncludedForPeriod(employee, period)) lost += Math.abs(Number(row.minutes || 0));
          }
        }

        return {
          periodId: period.id,
          label: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(period.end_date + "T00:00:00")).replace(".", ""),
          rate: expected > 0 ? (lost / expected) * 100 : 0,
          expected,
          lost,
        };
      });

      setMonthlyAbsenteeism(result);
    })();
  }, [periods, employees, selectedYear, selectedDepartment, selectedEmployees]);

  const absenteeismRate = metrics.expected > 0 ? (metrics.absenceMinutes / metrics.expected) * 100 : 0;
  const totalOvertime = metrics.he60 + metrics.he60Night + metrics.he100 + metrics.he100Night + metrics.he20 + metrics.interjornada;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/95 px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="mr-1 inline h-4 w-4" />Voltar</a>
          <b>DP Success · KPIs</b>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div>
          <p className="text-sm font-medium text-primary">Gestão</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">KPIs de RH e DP</h1>
          <p className="mt-1 text-sm text-muted-foreground">{periodLabel || "Selecione os filtros para analisar os indicadores."}</p>
        </div>

        <Card className="mt-6 border shadow-sm">
          <div className="flex items-center gap-1 border-b px-3 pt-3">
            {[
              ["absenteismo", "Absenteísmo"],
              ["horas-extras", "Hr Extra"],
              ["turnover", "Turnover"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveSection(key as typeof activeSection)}
                className={`border-b-2 px-5 py-3 text-sm font-medium transition ${activeSection === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-3 lg:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-medium">Ano
              <select className="h-10 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/20" value={selectedYear} onChange={e => { setSelectedYear(Number(e.target.value)); setSelectedMonth("todos"); }}>
                {[...new Set(periods.map(p => p.reference_year))].sort((a,b) => b-a).map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">Mês
              <select className="h-10 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/20" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                <option value="todos">Todos</option>
                {periods.filter(p => p.reference_year === selectedYear).map(p => <option key={p.id} value={p.id}>{periodRangeLabel(p)}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">Setor
              <select className="h-10 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary/20" value={selectedDepartment} onChange={e => setSelectedDepartment(e.target.value)}>
                <option value="todos">Todos os setores</option>
                {departmentOptions.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <div className="relative grid gap-1.5 text-sm font-medium">
              Funcionários da competência
              <button type="button" className="flex h-10 items-center justify-between rounded-lg border bg-background px-3 text-left font-normal" onClick={() => setEmployeeFilterOpen(v => !v)}>
                <span className="truncate">{selectedEmployees.length === 0 ? "Todos os funcionários" : `${selectedEmployees.length} selecionado(s)`}</span>
                <span className="ml-2 text-muted-foreground">⌄</span>
              </button>
              {employeeFilterOpen && (
                <div className="absolute left-0 right-0 top-[4.5rem] z-30 max-h-72 overflow-y-auto rounded-lg border bg-popover p-2 text-sm shadow-xl">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted">
                    <input type="checkbox" checked={selectedEmployees.length === 0} onChange={() => setSelectedEmployees([])} />
                    <span>Todos os funcionários</span>
                  </label>
                  {employeeOptions.map(e => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-muted">
                      <input type="checkbox" checked={selectedEmployees.includes(e.id)} onChange={() => setSelectedEmployees(current => current.includes(e.id) ? current.filter(id => id !== e.id) : [...current, e.id])} />
                      <span className="truncate">{e.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>

        {error && <Card className="mt-4 border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</Card>}

        <section className="mt-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="p-5">
              <Users className="h-5 w-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Funcionários ativos</p>
              <p className="mt-1 text-3xl font-bold">{metrics.employees}</p>
              <p className="mt-1 text-xs text-muted-foreground">ativos na competência selecionada</p>
            </Card>
            <Card className="p-5">
              <TrendingUp className="h-5 w-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Absenteísmo</p>
              <p className="mt-1 text-3xl font-bold">{pct(absenteeismRate)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{fmt(metrics.absenceMinutes)} perdidas / {fmt(metrics.expected)} previstas</p>
            </Card>
            <Card className="p-5">
              <Percent className="h-5 w-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Turnover</p>
              <p className="mt-1 text-3xl font-bold">{pct(metrics.turnover)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{metrics.admissions} admissões · {metrics.terminations} desligamentos</p>
            </Card>
            <Card className="p-5">
              <WalletCards className="h-5 w-5 text-primary" />
              <p className="mt-4 text-sm text-muted-foreground">Banco de horas</p>
              <p className={`mt-1 text-3xl font-bold ${bankBalance < 0 ? "text-destructive" : "text-primary"}`}>{fmt(bankBalance)}</p>
              <p className="mt-1 text-xs text-muted-foreground">saldo acumulado até o fim da seleção</p>
            </Card>
          </div>

          {activeSection === "absenteismo" && (
          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Indicador 01</p>
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
                Atestados e declarações ficam demonstrados separadamente e não entram no indicador configurado para o DP-Success.
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
                <div><h3 className="font-bold">Evolução mensal</h3><p className="text-xs text-muted-foreground">Percentual de horas perdidas consideradas em cada competência.</p></div>
                <span className="text-xs text-muted-foreground">{selectedYear}</span>
              </div>
              <div className="mt-5 flex h-48 items-end gap-2 overflow-x-auto pb-7">
                {monthlyAbsenteeism.map(item => {
                  const max = Math.max(...monthlyAbsenteeism.map(x => x.rate), 1);
                  const height = Math.max(8, (item.rate / max) * 150);
                  return (
                    <div key={item.periodId} className="flex min-w-14 flex-1 flex-col items-center justify-end gap-2">
                      <span className="text-[10px] font-semibold">{pct(item.rate)}</span>
                      <div className="w-full max-w-12 rounded-t-md bg-primary/70" style={{ height }} title={`${item.label}: ${pct(item.rate)} · ${fmt(item.lost)} / ${fmt(item.expected)}`} />
                      <span className="text-[10px] text-muted-foreground">{item.label}</span>
                    </div>
                  );
                })}
              </div>
              {!monthlyAbsenteeism.length && <p className="py-8 text-center text-sm text-muted-foreground">Sem dados para o ano selecionado.</p>}
            </Card>

            <Card className="p-5">
              <h3 className="font-bold">Composição das horas perdidas</h3>
              <p className="text-xs text-muted-foreground">Mostra o que está gerando o indicador.</p>
              <div className="mt-5 space-y-3">
                {[
                  ["Débitos", Math.max(0, metrics.absenceMinutes - metrics.faltasMinutes - metrics.abonosMinutes)],
                  ["Faltas", metrics.faltasMinutes],
                  ["Abonos", metrics.abonosMinutes],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="flex justify-between text-sm"><span>{label}</span><strong>{fmt(Number(value))}</strong></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary/70" style={{ width: `${metrics.absenceMinutes ? Math.min(100, Number(value) / metrics.absenceMinutes * 100) : 0}%` }} /></div>
                  </div>
                ))}
              </div>
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
            <Card className="p-5"><FileText className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Atestados</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.atestadosDays)}</p><p className="mt-1 text-xs text-muted-foreground">fora do cálculo atual</p></Card>
            <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Declarações abonadas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.declaracoesMinutes)}</p><p className="mt-1 text-xs text-muted-foreground">fora do cálculo atual</p></Card>
            <Card className="p-5"><Clock3 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Horas previstas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.expected)}</p></Card>
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
          <section className="mt-6">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Indicador 02</p>
                <h2 className="mt-1 text-2xl font-bold">Horas Extras</h2>
                <p className="mt-1 text-sm text-muted-foreground">Visão consolidada das horas extras do período.</p>
              </div>
              <div className="rounded-2xl border bg-card px-6 py-4 text-right shadow-sm">
                <p className="text-xs text-muted-foreground">Total de horas extras</p>
                <p className="mt-1 text-3xl font-bold">{fmt(totalOvertime - metrics.interjornada)}</p>
              </div>
            </div>
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
          </section>
        )}

        {activeSection === "turnover" && (
          <section className="mt-6">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Indicador 03</p>
                <h2 className="mt-1 text-2xl font-bold">Turnover</h2>
                <p className="mt-1 text-sm text-muted-foreground">Calculado automaticamente pelas datas de desligamento cadastradas.</p>
              </div>
              <div className="rounded-2xl border bg-card px-6 py-4 text-right shadow-sm">
                <p className="text-xs text-muted-foreground">Turnover</p>
                <p className="mt-1 text-3xl font-bold">{pct(metrics.turnover)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{periodLabel}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="p-6"><TrendingUp className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Admissões</p><p className="mt-1 text-3xl font-bold">{metrics.admissions}</p></Card>
              <Card className="p-6"><UserMinus className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Desligamentos</p><p className="mt-1 text-3xl font-bold">{metrics.terminations}</p></Card>
              <Card className="p-6"><Users className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Funcionários ativos</p><p className="mt-1 text-3xl font-bold">{metrics.activeHeadcount.toLocaleString("pt-BR")}</p></Card>
              <Card className="p-6"><Percent className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Índice de Turnover</p><p className="mt-1 text-3xl font-bold">{pct(metrics.turnover)}</p></Card>
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