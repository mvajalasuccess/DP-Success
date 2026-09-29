import { ArrowLeft, Users, Clock3, CalendarX2, Percent, UserMinus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { periodRangeLabel, type Period } from "@/lib/dp-model";
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

  const employeeOptions = useMemo(
    () => employees.filter(e => selectedDepartment === "todos" || e.department === selectedDepartment),
    [employees, selectedDepartment],
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

      setPeriodLabel(selectedMonth === "todos" ? `Ano ${selectedYear}` : periodRangeLabel(firstTarget));

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
      ]);

      if (historicalError || overtimeError || timeError || occurrenceError || debitError || certificateError || scheduleError) {
        setError(historicalError?.message ?? overtimeError?.message ?? timeError?.message ?? occurrenceError?.message ?? debitError?.message ?? certificateError?.message ?? scheduleError?.message ?? "Não foi possível carregar os indicadores.");
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
        const key = employee?.id ?? `historical:${row.registration ?? row.employee_name}`;
        if (employee) historicalCount += 1;

        // Histórico da BASE: usar exatamente os valores importados.
        // Não recalcular horas previstas por jornada/admissão/desligamento aqui,
        // pois Jan-Jul já foi validado contra o Power BI e deve permanecer fechado.
        const expectedMinutes = Number(row.expected_minutes || 0);
        next.expected += expectedMinutes;
        next.worked += Number(row.worked_minutes || 0);
        const dailyMinutes = 528;
        const faltaDays = Number(row.absence_quantity || 0);
        const faltas = Math.round(faltaDays * dailyMinutes);
        const atestados = Number(row.certificate_minutes || 0);
        const atestadoDays = dailyMinutes > 0 ? atestados / dailyMinutes : 0;
        const declaracoes = Number(row.declaration_minutes || 0);
        const abonos = Number(row.allowance_minutes || 0);
        next.faltasDays += faltaDays;
        next.faltasMinutes += faltas;
        next.atestadosDays += atestadoDays;
        next.atestadosMinutes += atestados;
        next.declaracoesMinutes += declaracoes;
        next.abonosMinutes += abonos;
        // Absenteísmo: considerar somente faltas + abonos + débitos.
        // Atestados e declarações NÃO entram no cálculo do indicador.
        const debitos = Number(row.debit_minutes || 0);
        next.absenceMinutes += faltas + debitos + abonos;

        next.he60 += Number(row.he_60_minutes || 0);
        next.he60Night += Number(row.he_60_night_minutes || 0);
        next.he100 += Number(row.he_100_minutes || 0);
        next.he20 += Number(row.he_20_minutes || 0);
        next.interjornada += Number(row.interjornada_minutes || 0);

        if (employee) {
          addOvertime(row, employee, Number(row.he_60_minutes || 0), "HE_60");
          addOvertime(row, employee, Number(row.he_60_night_minutes || 0), "HE_60_NOTURNO");
          addOvertime(row, employee, Number(row.he_100_minutes || 0), "HE_100");
          addOvertime(row, employee, Number(row.he_20_minutes || 0), "ADICIONAL_NOTURNO");
          addOvertime(row, employee, Number(row.interjornada_minutes || 0), "INTERJORNADA_50");
        }
      }

      const recordedExpectedPeriods = new Set<string>();
      const currentExpectedByKey = new Map<string, number>();
      const currentWorkedByKey = new Map<string, number>();
      const currentLostByKey = new Map<string, number>();

      for (const row of timeRecords ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
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
          if (recordedExpectedPeriods.has(`${employee.id}:${period.id}`)) continue;
          const expected = expectedFromSchedule(employee, period);
          const key = String(employee.id) + ":" + String(period.id);
          next.expected += expected;
          currentExpectedByKey.set(key, (currentExpectedByKey.get(key) ?? 0) + expected);
        }
      }

      for (const row of overtime ?? []) {
        if (!row.employee_id || !allowedIds.has(row.employee_id)) continue;
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
        const minutes = Math.abs(Number(row.minutes || 0));
        next.absenceMinutes += minutes;
        const key = String(row.employee_id) + ":" + String(row.period_id);
        currentLostByKey.set(key, (currentLostByKey.get(key) ?? 0) + minutes);
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

      const activeHeadcount = selectedMonth === "todos"
        ? distinctEmployeesInSelection.size
        : isHistoricalOnly
          ? targetPeriods.reduce((sum, period) => {
              const key = period.reference_year + "-" + period.reference_month;
              return sum + (historicalHeadcountByPeriod.get(key) ?? 0);
            }, 0) / targetPeriods.length
          : distinctEmployeesInSelection.size;

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
              Funcionários
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

        {activeSection === "absenteismo" && (
          <section className="mt-6">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">Indicador 01</p>
                <h2 className="mt-1 text-2xl font-bold">Absenteísmo</h2>
              </div>
              <div className="rounded-2xl border bg-card px-6 py-4 text-right shadow-sm">
                <p className="text-xs text-muted-foreground">Absenteísmo</p>
                <p className="mt-1 text-3xl font-bold">{pct(absenteeismRate)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{periodLabel}</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Faltas</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.faltasDays)}</p></Card>
              <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Atestados</p><p className="mt-1 text-2xl font-bold">{daysFmt(metrics.atestadosDays)}</p></Card>
              <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Declarações abonadas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.declaracoesMinutes)}</p></Card>
              <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Horas perdidas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.absenceMinutes)}</p></Card>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Card className="p-5"><Clock3 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Horas previstas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.expected)}</p></Card>
              <Card className="p-5"><Clock3 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Horas trabalhadas</p><p className="mt-1 text-2xl font-bold">{fmt(metrics.worked)}</p></Card>
              <Card className="p-5"><Users className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Funcionários</p><p className="mt-1 text-2xl font-bold">{metrics.employees}</p></Card>
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
                <p className="text-xs text-muted-foreground">Total de HE + Interjornada</p>
                <p className="mt-1 text-3xl font-bold">{fmt(totalOvertime)}</p>
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
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="p-6"><UserMinus className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Funcionários desligados</p><p className="mt-1 text-3xl font-bold">{metrics.terminations}</p></Card>
              <Card className="p-6"><Users className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Média de funcionários</p><p className="mt-1 text-3xl font-bold">{metrics.activeHeadcount.toLocaleString("pt-BR")}</p></Card>
              <Card className="p-6"><Percent className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Índice de Turnover</p><p className="mt-1 text-3xl font-bold">{pct(metrics.turnover)}</p></Card>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}