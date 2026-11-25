import { ArrowLeft, Search, BarChart3, Users, CalendarRange, Clock3, FileSpreadsheet, TrendingUp, Check, ListChecks, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useId, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CompanyFilter } from "@/components/company-filter";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ScreenBrand } from "@/components/screen-brand";
type Employee = { id: string; full_name: string; company_id?: string | null; status?: string | null };
type Period = { id: string; reference_year: number; reference_month: number; start_date: string; end_date: string };
type Totals = { he60: number; he60_20: number; he100: number; he20: number; interjornada: number; debitos: number; faltas: number; atestados: number };
const EMPTY: Totals = { he60: 0, he60_20: 0, he100: 0, he20: 0, interjornada: 0, debitos: 0, faltas: 0, atestados: 0 };
const ABSENCE_CODES = ["falta", "falta_justificada", "falta_injustificada"];

function fmt(minutes: number) {
  const n = Math.abs(Math.round(minutes || 0));
  return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
}

const EMPLOYEE_STATUSES = [
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" },
  { value: "todos", label: "Todos" },
] as const;

type EmployeeStatus = typeof EMPLOYEE_STATUSES[number]["value"];
type ComparisonOption = { id: string; label: string; detail?: string };

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function ComparisonPicker({
  title, icon: Icon, searchLabel, placeholder, options, selected, loading, onToggle, onSelectionChange,
}: {
  title: string;
  icon: typeof Users;
  searchLabel: string;
  placeholder: string;
  options: ComparisonOption[];
  selected: string[];
  loading: boolean;
  onToggle: (id: string) => void;
  onSelectionChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const query = normalizeSearch(search);
  const selectedIds = new Set(selected);
  const matches = options.filter(option => normalizeSearch(option.label).includes(query));
  const visible = selectedOnly ? matches.filter(option => selectedIds.has(option.id)) : matches;
  const allMatchesSelected = matches.every(option => selectedIds.has(option.id));

  function selectMatches() {
    onSelectionChange([...new Set([...selected, ...matches.map(option => option.id)])]);
  }

  function clearSelection() {
    onSelectionChange([]);
    setSelectedOnly(false);
  }

  return (
    <section aria-label={title} className="@container min-w-0 rounded-2xl border border-border/70 bg-card p-3 sm:p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-strong">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {loading ? "Carregando opções…" : `${selected.length} de ${options.length} na seleção`}
          </p>
        </div>
      </div>

      <div className="relative mt-4">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label={searchLabel}
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm"
        />
      </div>

      <div className="my-2 flex flex-wrap items-center gap-x-1 gap-y-0.5">
        <button
          type="button"
          onClick={selectMatches}
          disabled={allMatchesSelected}
          className="inline-flex min-h-9 items-center gap-1.5 px-2 text-xs font-semibold text-primary-strong hover:bg-primary/10 disabled:opacity-40"
        >
          <ListChecks aria-hidden="true" className="h-4 w-4" />
          {query ? "Selecionar resultados" : "Selecionar todos"}
        </button>
        <button
          type="button"
          aria-pressed={selectedOnly}
          onClick={() => setSelectedOnly(value => !value)}
          className="min-h-9 px-2 text-xs font-medium text-muted-foreground hover:bg-muted aria-pressed:bg-primary/15 aria-pressed:text-primary-strong"
        >
          Só selecionados
        </button>
        <button
          type="button"
          onClick={clearSelection}
          disabled={!selected.length}
          className="ml-auto min-h-9 px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          Limpar
        </button>
      </div>

      <div className="grid max-h-64 min-h-24 auto-rows-min grid-cols-1 gap-2 overflow-y-auto overscroll-contain rounded-xl bg-muted/35 p-2 @md:grid-cols-2">
        {visible.map(option => (
          <label
            key={option.id}
            className="group relative flex min-h-12 min-w-0 items-center gap-2.5 rounded-lg border border-border/75 bg-background px-2.5 py-2 transition-colors hover:border-primary/60 has-[:checked]:border-primary/70 has-[:checked]:bg-primary/10 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={selectedIds.has(option.id)}
              onChange={() => onToggle(option.id)}
            />
            <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-border bg-background group-has-[:checked]:border-primary-strong group-has-[:checked]:bg-primary-strong group-has-[:checked]:text-white">
              <Check className="h-3.5 w-3.5 opacity-0 group-has-[:checked]:opacity-100" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-snug [overflow-wrap:anywhere]">{option.label}</span>
              {option.detail && <span className="mt-1 block text-xs leading-tight text-muted-foreground">{option.detail}</span>}
            </span>
          </label>
        ))}
        {!loading && !visible.length && (
          <p role="status" className="col-span-full px-3 py-5 text-center text-sm text-muted-foreground">
            {selectedOnly && !query ? "Nenhum item selecionado." : "Nenhum resultado para este filtro."}
          </p>
        )}
      </div>
    </section>
  );
}

export function Comparativos() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<EmployeeStatus>("ativo");
  const statusGroupName = useId();
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [totals, setTotals] = useState<Record<string, Totals>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const db = supabase as any;
        const [{ data: employeeData, error: employeeError }, { data: periodData, error: periodError }] = await Promise.all([
          db.from("employees").select("id,full_name,company_id,status").order("full_name"),
          db.from("time_periods").select("id,reference_year,reference_month,start_date,end_date").order("start_date", { ascending: false }),
        ]);
        if (employeeError) throw employeeError;
        if (periodError) throw periodError;
        const employeeList = (employeeData ?? []) as Employee[];
        const periodList = (periodData ?? []) as Period[];
        setEmployees(employeeList);
        setPeriods(periodList);
      } catch (e: any) {
        setError(e.message ?? "Não foi possível carregar os filtros.");
      } finally { setLoading(false); }
    })();
  }, []);

  async function loadComparison(employeeIds: string[], periodIds: string[], isCurrent: () => boolean) {
    try {
      const db = supabase as any;
      const periodsSelected = periods.filter(p => periodIds.includes(p.id));
      const historicalCutoff = "2026-07-20";
      const currentPeriods = periodsSelected
        .filter(period => period.end_date > historicalCutoff)
        .sort((a, b) => a.start_date.localeCompare(b.start_date));
      const selectedRanges = periodsSelected.map(p => ({ start: p.start_date, end: p.end_date }));
      const currentRanges = currentPeriods.map(p => ({ start: p.start_date, end: p.end_date }));
      const fetchAll = async (build: (from: number, to: number) => any) => {
        const rows: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await build(from, from + 999);
          if (error) throw error;
          const batch = data ?? [];
          rows.push(...batch);
          if (batch.length < 1000) break;
        }
        return rows;
      };
      const historicalQuery = (from: number, to: number) => db.from("historical_kpi_data")
        .select("id,employee_id,period_id,absence_quantity,certificate_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
        .in("employee_id", employeeIds).in("period_id", periodIds).order("id").range(from, to);
      const overtimeQuery = (from: number, to: number) => db.from("overtime_records")
        .select("id,employee_id,minutes,launch_type,period_id,reference_date")
        .in("employee_id", employeeIds).in("period_id", periodIds).order("id").range(from, to);
      const debitQuery = (from: number, to: number) => db.from("bank_hours")
        .select("id,employee_id,minutes,kind,period_id,entry_date")
        .in("employee_id", employeeIds).in("period_id", periodIds).eq("kind", "debito").order("id").range(from, to);
      const absenceQuery = (from: number, to: number) => db.from("occurrences")
        .select("id,employee_id,period_id,quantity,occurrence_date,end_date,occurrence_types!inner(code)")
        .in("employee_id", employeeIds).in("occurrence_types.code", ABSENCE_CODES).order("id").range(from, to);
      const certificateQuery = (from: number, to: number) => db.from("medical_certificates")
        .select("id,employee_id,days,start_date,end_date")
        .in("employee_id", employeeIds).order("id").range(from, to);
      const overrideQuery = (from: number, to: number) => db.from("point_closing_overrides")
        .select("id,employee_id,period_id,absence_quantity,certificate_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
        .in("employee_id", employeeIds).in("period_id", periodIds).order("id").range(from, to);

      const [historical, overtime, debits, absences, certificates, overrides] = await Promise.all([
        fetchAll(historicalQuery), fetchAll(overtimeQuery), fetchAll(debitQuery),
        fetchAll(absenceQuery), fetchAll(certificateQuery), fetchAll(overrideQuery),
      ]);

      const keyFor = (employeeId: string, periodId: string) => `${periodId}:${employeeId}`;
      const historicalKeys = new Set(
        historical.map((row: any) => keyFor(String(row.employee_id), String(row.period_id))),
      );
      const overridesByKey = new Map(
        overrides.map((row: any) => [keyFor(String(row.employee_id), String(row.period_id)), row]),
      );
      const overlapDays = (
        startDate: string,
        endDate?: string | null,
        ranges: Array<{ start: string; end: string }> = selectedRanges,
      ) => {
        const start = new Date(startDate + "T00:00:00");
        const end = new Date((endDate ?? startDate) + "T00:00:00");
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
        let total = 0;
        for (const range of ranges) {
          const rangeStart = new Date(range.start + "T00:00:00");
          const rangeEnd = new Date(range.end + "T00:00:00");
          const from = start > rangeStart ? start : rangeStart;
          const to = end < rangeEnd ? end : rangeEnd;
          if (to >= from) total += Math.floor((to.getTime() - from.getTime()) / 86400000) + 1;
        }
        return total;
      };

      const next: Record<string, Totals> = {};
      employeeIds.forEach(id => { next[id] = { ...EMPTY }; });

      // BASE is the source of truth for imported historical periods; a saved
      // closing override replaces that row, never adds to it.
      for (const row of historical) {
        const t = next[row.employee_id];
        if (!t) continue;
        const key = keyFor(String(row.employee_id), String(row.period_id));
        const source = overridesByKey.get(key) ?? row;
        t.he60 += Number(source.he_60_minutes || 0);
        t.he60_20 += Number(source.he_60_night_minutes || 0);
        t.he100 += Number(source.he_100_minutes || 0);
        t.he20 += Number(source.he_20_minutes || 0);
        t.interjornada += Number(source.interjornada_minutes || 0);
        t.debitos += Math.abs(Number(source.debit_minutes || 0));
        t.faltas += Number(source.absence_quantity || 0);
        t.atestados += Math.max(0, Number(source.certificate_minutes || 0)) / 528;
      }

      // Operational launches fill only periods without a historical BASE row or
      // a manual closing override, so a launch cannot be counted twice.
      for (const row of overtime) {
        const t = next[row.employee_id];
        if (!t) continue;
        const key = keyFor(String(row.employee_id), String(row.period_id));
        if (historicalKeys.has(key) || overridesByKey.has(key)) continue;
        const type = String(row.launch_type || "").toUpperCase();
        const minutes = Math.abs(Number(row.minutes) || 0);
        if (type.includes("INTERJORNADA")) t.interjornada += minutes;
        else if (type === "HE_60_NOTURNO" || type.includes("60_20") || type.includes("60%20") || type.includes("60+20")) t.he60_20 += minutes;
        else if (type.includes("100")) t.he100 += minutes;
        else if (type === "ADICIONAL_NOTURNO" || type.includes("20")) t.he20 += minutes;
        else t.he60 += minutes;
      }

      for (const row of debits) {
        const total = next[row.employee_id];
        if (!total) continue;
        const key = keyFor(String(row.employee_id), String(row.period_id));
        if (historicalKeys.has(key) || overridesByKey.has(key)) continue;
        total.debitos += Math.abs(Number(row.minutes) || 0);
      }

      for (const row of absences) {
        const t = next[row.employee_id];
        if (!t) continue;
        const overlap = overlapDays(row.occurrence_date, row.end_date);
        if (!overlap) continue;
        const key = row.period_id ? keyFor(String(row.employee_id), String(row.period_id)) : "";
        if (key && (historicalKeys.has(key) || overridesByKey.has(key))) continue;
        const fullDays = Math.max(1, Math.round(Number(row.quantity || 0)));
        const selectedDays = row.end_date
          ? Math.min(fullDays, overlap)
          : Number(row.quantity || 0);
        if (selectedDays > 0) t.faltas += selectedDays;
      }

      // Live certificates apply to current-period date ranges only. Historical
      // certificates come from the imported BASE values above.
      for (const row of certificates) {
        const t = next[row.employee_id];
        if (!t) continue;
        let remainingDays = Math.max(0, Number(row.days || 0));
        for (const period of currentPeriods) {
          const key = keyFor(String(row.employee_id), String(period.id));
          if (historicalKeys.has(key) || overridesByKey.has(key)) continue;
          const overlap = overlapDays(row.start_date, row.end_date, [{ start: period.start_date, end: period.end_date }]);
          if (!overlap) continue;
          const days = remainingDays > 0 ? Math.min(remainingDays, overlap) : overlap;
          t.atestados += days;
          if (remainingDays > 0) remainingDays -= days;
        }
      }

      // A current manual closing is the authoritative summary for that employee
      // and period, replacing all matching operational rows.
      for (const row of overrides) {
        const key = keyFor(String(row.employee_id), String(row.period_id));
        if (historicalKeys.has(key)) continue; // already applied over the BASE row
        const t = next[row.employee_id];
        if (!t) continue;
        t.he60 += Number(row.he_60_minutes || 0);
        t.he60_20 += Number(row.he_60_night_minutes || 0);
        t.he100 += Number(row.he_100_minutes || 0);
        t.he20 += Number(row.he_20_minutes || 0);
        t.interjornada += Number(row.interjornada_minutes || 0);
        t.debitos += Math.abs(Number(row.debit_minutes || 0));
        t.faltas += Number(row.absence_quantity || 0);
        t.atestados += Math.max(0, Number(row.certificate_minutes || 0)) / 528;
      }

      if (isCurrent()) setTotals(next);
    } catch (e: any) {
      if (isCurrent()) setError(e.message ?? "Não foi possível carregar os comparativos.");
    }
  }

  useEffect(() => {
    if (loading) return;
    setTotals({});
    if (!selectedEmployees.length || !selectedPeriods.length) return;

    setError("");
    let current = true;
    void loadComparison(selectedEmployees, selectedPeriods, () => current);
    return () => { current = false; };
  }, [selectedEmployees, selectedPeriods, loading, periods]);

  const eligibleEmployees = useMemo(() => employees.filter(e =>
    (!companyFilter || e.company_id === companyFilter) &&
    (employeeStatusFilter === "todos" || e.status?.trim().toLowerCase() === employeeStatusFilter)
  ), [employees, companyFilter, employeeStatusFilter]);

  const employeeOptions = eligibleEmployees.map(employee => ({ id: employee.id, label: employee.full_name }));
  const periodOptions = periods.map(period => ({
    id: period.id,
    label: `${String(period.reference_month).padStart(2, "0")}/${period.reference_year}`,
    detail: `${period.start_date.split("-").reverse().join("/")} a ${period.end_date.split("-").reverse().join("/")}`,
  }));

  useEffect(() => {
    const eligibleIds = new Set(eligibleEmployees.map(e => e.id));
    setSelectedEmployees(prev => prev.every(id => eligibleIds.has(id))
      ? prev
      : prev.filter(id => eligibleIds.has(id)));
  }, [eligibleEmployees]);

  function toggleEmployee(id: string) { setSelectedEmployees(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  function togglePeriod(id: string) { setSelectedPeriods(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  const columns: [keyof Totals, string][] = [
    ["he60", "HE 60%"], ["he60_20", "HE 60%20"], ["he100", "HE 100%"], ["he20", "HE 20%"],
    ["interjornada", "Interjornada"], ["debitos", "Débitos"]
  ];


  const selectedEmployeeRows = useMemo(() => selectedEmployees
    .map(id => ({ id, employee: employees.find(e => e.id === id), totals: totals[id] ?? EMPTY }))
    .filter(row => !!row.employee), [selectedEmployees, employees, totals]);
  const chartCategories = useMemo(() => [
    { name: "HE 60%", key: "he60" as const },
    { name: "HE 60% + noturno", key: "he60_20" as const },
    { name: "HE 100%", key: "he100" as const },
    { name: "HE 20%", key: "he20" as const },
  ].map(item => ({
    name: item.name,
    horas: selectedEmployeeRows.reduce((sum, row) => sum + row.totals[item.key], 0) / 60,
  })), [selectedEmployeeRows]);
  const chartEmployees = useMemo(() => selectedEmployeeRows
    .map(row => ({
      name: row.employee!.full_name,
      he60: row.totals.he60 / 60,
      he60_20: row.totals.he60_20 / 60,
      he100: row.totals.he100 / 60,
      he20: row.totals.he20 / 60,
      total: (row.totals.he60 + row.totals.he60_20 + row.totals.he100 + row.totals.he20) / 60,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8), [selectedEmployeeRows]);
  const fmtNumber = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const sumHours = (key: "he60" | "he60_20" | "he100" | "he20" | "debitos") =>
    selectedEmployeeRows.reduce((sum, row) => sum + row.totals[key], 0);
  const sumDays = (key: "faltas" | "atestados") =>
    selectedEmployeeRows.reduce((sum, row) => sum + row.totals[key], 0);
  const occurrenceChart = [
    { name: "Débitos", quantidade: sumHours("debitos") / 60 },
    { name: "Faltas", quantidade: sumDays("faltas") },
    { name: "Atestados", quantidade: sumDays("atestados") },
  ];
  const hasChartData = selectedEmployeeRows.length > 0 && selectedPeriods.length > 0;

  return <div className="dp-screen min-h-screen bg-background">
    <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a>
        <ScreenBrand name="Comparativos" />
      </div>
    </header>
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
      <section className="relative isolate mb-7 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-56 w-56 rounded-full bg-[#06CAA0]/20 blur-3xl" />
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7cebd0]">ANÁLISE • DP SUCCESS</p>
            <h1 style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} className="!text-white text-3xl font-semibold tracking-tight sm:text-4xl">Comparativos</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-200">Analise horas extras e ocorrências por colaborador nas competências selecionadas.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-200">
            <span className="rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2">{selectedEmployeeRows.length} funcionário(s)</span>
            <span className="rounded-lg border border-white/15 bg-white/[0.08] px-3 py-2">{selectedPeriods.length} competência(s)</span>
          </div>
        </div>
      </section>

      {error && <div className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}

      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card p-0 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/70 bg-muted/30 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <SlidersHorizontal aria-hidden="true" className="h-5 w-5 shrink-0 text-primary-strong" />
            <h2 className="font-semibold tracking-tight">Filtros da análise</h2>
          </div>
          <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-[minmax(0,15rem)_auto] sm:items-end">
            <div className="min-w-0">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Empresa</span>
              <CompanyFilter
                value={companyFilter}
                onChange={setCompanyFilter}
                className="block h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
              />
            </div>
            <fieldset className="min-w-0">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">Status</legend>
              <div className="grid grid-cols-3 gap-0.5 rounded-xl border border-border/70 bg-background p-0.5">
                {EMPLOYEE_STATUSES.map(status => (
                  <label key={status.value} className="relative grid min-h-9 place-items-center rounded-lg px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted has-[:checked]:bg-primary/15 has-[:checked]:text-primary-strong has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary">
                    <input
                      type="radio"
                      name={statusGroupName}
                      value={status.value}
                      checked={employeeStatusFilter === status.value}
                      onChange={() => setEmployeeStatusFilter(status.value)}
                      className="sr-only"
                    />
                    {status.label}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </div>
        <div className="grid gap-3 bg-muted/15 p-3 md:grid-cols-2 sm:p-4">
          <ComparisonPicker
            title="Colaboradores"
            icon={Users}
            searchLabel="Buscar colaborador"
            placeholder="Buscar por nome"
            options={employeeOptions}
            selected={selectedEmployees}
            loading={loading}
            onToggle={toggleEmployee}
            onSelectionChange={setSelectedEmployees}
          />
          <ComparisonPicker
            title="Competências"
            icon={CalendarRange}
            searchLabel="Buscar competência"
            placeholder="Buscar por mês/ano"
            options={periodOptions}
            selected={selectedPeriods}
            loading={loading}
            onToggle={togglePeriod}
            onSelectionChange={setSelectedPeriods}
          />
        </div>
      </Card>

      <div className="mt-7 mb-4 flex items-end justify-between gap-3">
        <div><h2 className="text-xl font-semibold tracking-tight">Resumo da seleção</h2><p className="mt-1 text-sm text-muted-foreground">Totais agregados do recorte selecionado, sem incluir dados inventados.</p></div>
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex"><Clock3 className="h-3.5 w-3.5" />Horas em HH:MM na tabela</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          {label:"HE 60%",value:fmt(sumHours("he60")),icon:<Clock3 className="h-4 w-4" />},
          {label:"HE 60% + noturno",value:fmt(sumHours("he60_20")),icon:<Clock3 className="h-4 w-4" />},
          {label:"HE 100%",value:fmt(sumHours("he100")),icon:<TrendingUp className="h-4 w-4" />},
          {label:"HE 20%",value:fmt(sumHours("he20")),icon:<Clock3 className="h-4 w-4" />},
          {label:"Débitos",value:fmt(sumHours("debitos")),icon:<Clock3 className="h-4 w-4" />},
          {label:"Faltas",value:sumDays("faltas").toLocaleString("pt-BR", {maximumFractionDigits:2}) + " dias",icon:<Users className="h-4 w-4" />},
          {label:"Atestados",value:sumDays("atestados").toLocaleString("pt-BR", {maximumFractionDigits:2}) + " dias",icon:<CalendarRange className="h-4 w-4" />},
        ].map(item => <Card key={item.label} className="rounded-2xl border-border/70 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3"><span className="text-sm text-muted-foreground">{item.label}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#06CAA0]/10 text-emerald-700 dark:text-emerald-300">{item.icon}</span></div>
          <div className="mt-3 text-2xl font-semibold tabular-nums">{item.value}</div>
          <p className="mt-1 text-xs text-muted-foreground">Total acumulado · HH:MM</p>
        </Card>)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border-border/70 p-4 shadow-sm sm:p-5">
          <div className="mb-4"><h3 className="font-semibold">Horas por tipo</h3><p className="mt-1 text-xs text-muted-foreground">Distribuição das categorias selecionadas · em horas decimais no gráfico</p></div>
          {hasChartData && chartCategories.some(item => item.horas > 0) ? <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={chartCategories} margin={{top:8,right:12,left:0,bottom:8}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{fontSize:11}} interval={0} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip formatter={(value) => [fmtNumber(Number(value)) + " h", "Horas"]} />
              <Bar dataKey="horas" name="Horas" fill="#06CAA0" radius={[6,6,0,0]} maxBarSize={48} />
            </BarChart></ResponsiveContainer>
          </div> : <div className="flex h-[280px] flex-col items-center justify-center rounded-xl bg-muted/20 text-center"><BarChart3 className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm font-medium">Sem valores para exibir</p><p className="mt-1 text-xs text-muted-foreground">Selecione colaboradores e competências com dados.</p></div>}
        </Card>
        <Card className="rounded-2xl border-border/70 p-4 shadow-sm sm:p-5">
          <div className="mb-4"><h3 className="font-semibold">Comparação entre colaboradores</h3><p className="mt-1 text-xs text-muted-foreground">Até 8 colaboradores com maior volume nas categorias de HE selecionadas</p></div>
          {hasChartData && chartEmployees.some(item => item.total > 0) ? <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={chartEmployees} margin={{top:8,right:12,left:0,bottom:48}}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{fontSize:10}} angle={-28} textAnchor="end" interval={0} height={65} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip formatter={(value) => [fmtNumber(Number(value)) + " h", "Horas"]} />
              <Legend wrapperStyle={{fontSize:11}} />
              <Bar dataKey="he60" name="HE 60%" stackId="he" fill="#06CAA0" />
              <Bar dataKey="he60_20" name="HE 60% + noturno" stackId="he" fill="#0D9488" />
              <Bar dataKey="he100" name="HE 100%" stackId="he" fill="#64748B" />
              <Bar dataKey="he20" name="HE 20%" stackId="he" fill="#A7B7C7" radius={[4,4,0,0]} />
            </BarChart></ResponsiveContainer>
          </div> : <div className="flex h-[280px] flex-col items-center justify-center rounded-xl bg-muted/20 text-center"><Users className="mb-3 h-8 w-8 text-muted-foreground/50" /><p className="text-sm font-medium">Sem valores para comparar</p><p className="mt-1 text-xs text-muted-foreground">Os gráficos aparecem quando houver valores no recorte.</p></div>}
        </Card>
      </div>

      <Card className="mt-4 rounded-2xl border-border/70 p-4 shadow-sm sm:p-5">
        <div className="mb-4"><h3 className="font-semibold">Débitos, faltas e atestados</h3><p className="mt-1 text-xs text-muted-foreground">Horas e dias são apresentados em unidades próprias para evitar comparações enganosas.</p></div>
        {hasChartData && occurrenceChart.some(item => item.quantidade > 0) ? <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={occurrenceChart} margin={{top:8,right:12,left:0,bottom:8}}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{fontSize:12}} /><YAxis tick={{fontSize:11}} />
            <Tooltip formatter={(value) => [fmtNumber(Number(value)), "Quantidade"]} />
            <Bar dataKey="quantidade" name="Quantidade" fill="#0D9488" radius={[6,6,0,0]} maxBarSize={56} />
          </BarChart></ResponsiveContainer>
        </div> : <div className="flex h-[220px] items-center justify-center rounded-xl bg-muted/20 text-center text-sm text-muted-foreground">Sem ocorrências no recorte selecionado.</div>}
      </Card>

      <Card className="mt-5 overflow-hidden rounded-2xl border-border/70 shadow-sm">
        <div className="flex flex-col gap-3 border-b bg-muted/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-semibold">Comparação lado a lado por colaborador</h2><p className="mt-1 text-xs text-muted-foreground">Funcionários nas linhas e indicadores nas colunas para comparar os valores diretamente.</p></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileSpreadsheet className="h-4 w-4" />Tabela comparativa</div>
        </div>
        <div className="overflow-x-auto bg-inherit">
          <table className="w-full min-w-[1250px] bg-inherit text-center text-sm">
            <thead className="sticky top-0 bg-muted/70 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="sticky left-0 z-20 min-w-[230px] px-4 py-3 font-semibold">Colaborador</th>
                {columns.map(([, label]) => <th key={label} className="whitespace-nowrap px-4 py-3 font-semibold">{label}</th>)}
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Faltas (dias)</th>
                <th className="whitespace-nowrap px-4 py-3 font-semibold">Atestados (dias)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70 bg-inherit [&>tr+tr>th]:border-t [&>tr+tr>th]:border-t-[color-mix(in_oklab,var(--color-border)_78%,white)]">
              {selectedEmployeeRows.map(({id, employee, totals: t}) => <tr key={id} className="group bg-inherit transition-colors hover:bg-muted/30">
                <th scope="row" className="sticky left-0 z-[1] max-w-[300px] bg-inherit px-4 py-[0.7rem] font-medium text-[color:color-mix(in_oklab,var(--dp-premium-ink)_94%,white)] group-hover:bg-[oklch(0.97_0.018_165)]">{employee!.full_name}</th>
                {columns.map(([key]) => <td key={key} className="whitespace-nowrap px-4 py-3.5 tabular-nums">{fmt(t[key])}</td>)}
                <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">{t.faltas.toLocaleString("pt-BR", {maximumFractionDigits: 2})}</td>
                <td className="whitespace-nowrap px-4 py-3.5 tabular-nums">{t.atestados.toLocaleString("pt-BR", {maximumFractionDigits: 2})}</td>
              </tr>)}
              {!selectedEmployeeRows.length && <tr><td colSpan={9} className="px-5 py-12 text-center"><Users className="mx-auto mb-2 h-7 w-7 text-muted-foreground/40" /><p className="text-sm font-medium">Nenhum colaborador selecionado</p><p className="mt-1 text-xs text-muted-foreground">Escolha pelo menos um colaborador nos filtros acima.</p></td></tr>}
              {!!selectedEmployeeRows.length && !selectedPeriods.length && <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">Selecione pelo menos uma competência para carregar os dados.</td></tr>}
              {loading && <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">Carregando comparativos...</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">Os gráficos usam os mesmos valores carregados para a tabela. Interjornada permanece em coluna própria e não é incorporada às categorias de horas extras.</p>
    </main>
  </div>
}
