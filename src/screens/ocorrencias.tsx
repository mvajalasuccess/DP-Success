import { ArrowLeft, ChevronDown, ChevronUp, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CompanyFilter } from "@/components/company-filter";

import { ScreenBrand } from "@/components/screen-brand";
type Employee = { id: string; full_name: string; registration?: string | null; status?: string; hire_date?: string | null; termination_date?: string | null; company_id?: string | null };
type OccType = { id: string; code: string; name: string; unit: string; requires_justification: boolean; affects_balance: boolean };
type HistoricalAbsence = {
  id: string;
  employee_id: string | null;
  employee_name: string;
  registration: string | null;
  period_id: string | null;
  period_start: string;
  period_end: string;
  reference_year: number;
  reference_month: number;
  absence_quantity: number;
  absence_display_date?: string | null;
  absence_display_end_date?: string | null;
  absence_display_type?: string | null;
  absence_display_quantity?: number | null;
  absence_display_justification?: string | null;
  absence_display_notes?: string | null;
};

type Occ = {
  id: string;
  employee_id: string;
  occurrence_type_id: string;
  period_id: string | null;
  occurrence_date: string;
  end_date: string | null;
  quantity: number | null;
  unit: string;
  justification: string | null;
  notes: string | null;
  employees?: { full_name: string } | null;
  occurrence_types?: { name: string; code: string } | null;
};

const ALLOWED_CODES = new Set([
  "folga_abonada",
  "folga_descontada",
  "falta_justificada",
  "falta_injustificada",
]);

const emptyForm = {
  employee_id: "",
  occurrence_type_id: "",
  occurrence_date: "",
  end_date: "",
  quantity: "",
  justification: "",
  notes: "",
};

export function Ocorrencias() {
  const [rows, setRows] = useState<Occ[]>([]);
  const [historicalAbsences, setHistoricalAbsences] = useState<HistoricalAbsence[]>([]);
  const [historicalEditing, setHistoricalEditing] = useState<HistoricalAbsence | null>(null);
  const [historicalForm, setHistoricalForm] = useState({ date: "", endDate: "", type: "", quantity: "", justification: "", notes: "" });
  const [historicalSaveError, setHistoricalSaveError] = useState("");
  const [historicalSaving, setHistoricalSaving] = useState(false);
  const [historicalAnnotationsReady, setHistoricalAnnotationsReady] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [types, setTypes] = useState<OccType[]>([]);
  const [periods, setPeriods] = useState<{ id: string; start_date: string; end_date: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Occ | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState("todos");
  const [companyFilter, setCompanyFilter] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("todos");
  const [showAbsences, setShowAbsences] = useState(true);
  const [showDaysOff, setShowDaysOff] = useState(true);

  const visibleTypes = useMemo(
    () => types.filter(t => ALLOWED_CODES.has(t.code)),
    [types],
  );

  const selectedType = visibleTypes.find(t => t.id === form.occurrence_type_id);
  const selectedCode = selectedType?.code ?? "";
  const isFalta = ["folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"].includes(selectedCode);

  const employeesForDate = useMemo(() => {
    const referenceDate = form.occurrence_date;
    return employees.filter(e =>
      (!companyFilter || e.company_id === companyFilter) &&
      (!referenceDate || ((!e.hire_date || e.hire_date <= referenceDate) &&
        (!e.termination_date || e.termination_date >= referenceDate)))
    );
  }, [employees, form.occurrence_date, companyFilter]);

  async function load() {
    setError("");
    const { data, error } = await supabase
      .from("occurrences")
      .select("id,employee_id,occurrence_type_id,period_id,occurrence_date,end_date,quantity,unit,justification,notes,employees(full_name),occurrence_types(name,code)")
      .order("occurrence_date", { ascending: false });

    if (error) setError(error.message);
    else setRows(((data ?? []) as Occ[]).filter(row => ALLOWED_CODES.has(String(row.occurrence_types?.code ?? ""))));

    const db = supabase as any;
    const { data: historicalData, error: historicalError } = await db
      .from("historical_kpi_data")
      .select("id,employee_id,employee_name,registration,period_id,period_start,period_end,reference_year,reference_month,absence_quantity")
      .gt("absence_quantity", 0)
      .order("period_start", { ascending: false });
    if (historicalError) {
      setHistoricalAbsences([]);
      setError(previous => previous || historicalError.message);
      return;
    }

    const baseRows = (historicalData ?? []) as HistoricalAbsence[];
    const { data: annotations, error: annotationsError } = await db
      .from("historical_kpi_annotations")
      .select("historical_kpi_data_id,absence_display_date,absence_display_end_date,absence_display_type,absence_display_quantity,absence_display_justification,absence_display_notes")
      .in("historical_kpi_data_id", baseRows.map(row => row.id));
    setHistoricalAnnotationsReady(!annotationsError);
    const annotationById = new Map<string, any>(
      (annotations ?? []).map((item: any) => [item.historical_kpi_data_id, item]),
    );
    setHistoricalAbsences(baseRows.map(row => ({
      ...row,
      ...(annotationById.get(row.id) ?? {}),
    })));
  }

  async function loadOptions() {
    const [e, t, p] = await Promise.all([
      (supabase as any).from("employees").select("id,full_name,registration,status,hire_date,termination_date,company_id").order("full_name"),
      supabase.from("occurrence_types").select("id,code,name,unit,requires_justification,affects_balance").eq("active", true).order("name"),
      supabase.from("time_periods").select("id,start_date,end_date").order("start_date", { ascending: false }),
    ]);

    setEmployees((e.data ?? []) as Employee[]);
    setTypes((t.data ?? []) as OccType[]);
    setPeriods((p.data ?? []) as { id: string; start_date: string; end_date: string }[]);
  }

  useEffect(() => {
    void load();
    void loadOptions();
  }, []);

  const selectedPeriod = periods.find(p => p.id === filterPeriod);
  const displayPeriodStart = (start: string, end: string) =>
    end === "2026-01-20" ? "2025-12-11" : start;
  const historicalDisplayStart = (row: HistoricalAbsence) =>
    row.absence_display_date || displayPeriodStart(row.period_start, row.period_end);
  const employeesForFilter = employees.filter(e => (!companyFilter || e.company_id === companyFilter) && (!selectedPeriod || ((!e.hire_date || e.hire_date <= selectedPeriod.end_date) && (!e.termination_date || e.termination_date >= selectedPeriod.start_date))));
  const companyEmployees = employees.filter(e => !companyFilter || e.company_id === companyFilter);
  const companyEmployeeIds = new Set(companyEmployees.map(e => e.id));
  const employeeIdByRegistration = new Map(employees.filter(e => e.registration).map(e => [String(e.registration).trim().toLowerCase(), e.id]));
  const employeeIdByName = new Map(employees.map(e => [e.full_name.trim().toLowerCase(), e.id]));
  const resolveHistoricalEmployeeId = (row: HistoricalAbsence) =>
    row.employee_id ||
    employeeIdByRegistration.get(String(row.registration ?? "").trim().toLowerCase()) ||
    employeeIdByName.get(String(row.employee_name ?? "").trim().toLowerCase()) ||
    null;
  const filteredRows = rows.filter(row =>
    companyEmployeeIds.has(row.employee_id) &&
    (filterEmployee === "todos" || row.employee_id === filterEmployee) &&
    (!selectedPeriod || (row.occurrence_date <= selectedPeriod.end_date && (row.end_date ?? row.occurrence_date) >= selectedPeriod.start_date))
  );
  const absenceRows = filteredRows.filter(row => ["falta_justificada", "falta_injustificada"].includes(String(row.occurrence_types?.code ?? "")));
  const daysOffRows = filteredRows.filter(row => ["folga_abonada", "folga_descontada"].includes(String(row.occurrence_types?.code ?? "")));
  const filteredHistoricalAbsences = historicalAbsences.filter(row => {
    const resolvedEmployeeId = resolveHistoricalEmployeeId(row);
    return (!companyFilter || (!!resolvedEmployeeId && companyEmployeeIds.has(resolvedEmployeeId))) &&
      (filterEmployee === "todos" || resolvedEmployeeId === filterEmployee) &&
      (!selectedPeriod || (row.period_start <= selectedPeriod.end_date && row.period_end >= selectedPeriod.start_date));
  });

  function startHistoricalEdit(row: HistoricalAbsence) {
    setHistoricalEditing(row);
    setHistoricalForm({
      date: row.absence_display_date ?? "",
      endDate: row.absence_display_end_date ?? "",
      type: visibleTypes.find(t => t.name === row.absence_display_type)?.id ?? visibleTypes.find(t => t.code === "falta_injustificada")?.id ?? visibleTypes[0]?.id ?? "",
      quantity: String(row.absence_display_quantity ?? row.absence_quantity ?? ""),
      justification: row.absence_display_justification ?? "",
      notes: row.absence_display_notes ?? "",
    });
    setHistoricalSaveError("");
  }

  async function saveHistoricalDisplay() {
    if (!historicalEditing) return;
    const quantity = Number(historicalForm.quantity);
    const selectedHistoricalType = visibleTypes.find(t => t.id === historicalForm.type);
    if (!selectedHistoricalType || !Number.isInteger(quantity) || quantity <= 0) {
      setHistoricalSaveError("Informe o tipo e uma quantidade válida igual ou maior que zero.");
      return;
    }
    if (historicalForm.endDate && historicalForm.date && historicalForm.endDate < historicalForm.date) {
      setHistoricalSaveError("A data final não pode ser anterior à data inicial.");
      return;
    }
    if (!historicalAnnotationsReady) {
      setHistoricalSaveError("Execute o SQL complementar das faltas históricas antes de salvar. Os registros originais continuam preservados.");
      return;
    }
    setHistoricalSaving(true);
    setHistoricalSaveError("");
    const db = supabase as any;
    const { error: saveError } = await db.from("historical_kpi_annotations").upsert({
      historical_kpi_data_id: historicalEditing.id,
      absence_display_date: historicalForm.date || null,
      absence_display_end_date: historicalForm.endDate || null,
      absence_display_type: selectedHistoricalType.name,
      absence_display_quantity: quantity,
      absence_display_justification: historicalForm.justification.trim() || null,
      absence_display_notes: historicalForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "historical_kpi_data_id" });
    setHistoricalSaving(false);
    if (saveError) {
      setHistoricalSaveError(saveError.message);
      return;
    }
    setHistoricalEditing(null);
    await load();
  }

  function displayHistoricalQuantity(row: HistoricalAbsence) {
    const value = row.absence_display_quantity ?? row.absence_quantity;
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  function periodLabel(period: { id: string; start_date: string; end_date: string }) {
    return `${formatDate(displayPeriodStart(period.start_date, period.end_date))} a ${formatDate(period.end_date)}`;
  }

  function startNew() {
    setEditing(null);
    setForm({
      ...emptyForm,
      occurrence_type_id: visibleTypes.find(t => t.code === "falta_injustificada")?.id ?? visibleTypes[0]?.id ?? "",
    });
    setError("");
    setOpen(true);
  }

  function startEdit(row: Occ) {
    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      occurrence_type_id: row.occurrence_type_id,
      occurrence_date: row.occurrence_date,
      end_date: row.end_date ?? "",
      quantity: row.quantity == null ? "" : String(row.quantity),
      justification: row.justification ?? "",
      notes: row.notes ?? "",
    });
    setError("");
    setOpen(true);
  }

  function changeType(id: string) {
    setForm({
      ...form,
      occurrence_type_id: id,
      quantity: "",
      end_date: "",
      justification: "",
    });
  }

  async function save() {
    setError("");

    if (!form.employee_id || !form.occurrence_type_id || !form.occurrence_date) {
      setError("Informe funcionário, tipo e data.");
      return;
    }

    if (isFalta && (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) <= 0)) {
      setError("Informe uma quantidade de dias inteira e maior que zero.");
      return;
    }
    if (form.end_date && form.end_date < form.occurrence_date) {
      setError("A data final não pode ser anterior à data inicial.");
      return;
    }

    if (selectedType?.requires_justification && !form.justification.trim()) {
      setError("Este tipo de ocorrência exige justificativa.");
      return;
    }

    setSaving(true);

    const period = periods.find(p => form.occurrence_date >= p.start_date && form.occurrence_date <= p.end_date);
    const quantity = Number(form.quantity);

    const notes = form.notes.trim() || null;

    const payload = {
      employee_id: form.employee_id,
      occurrence_type_id: form.occurrence_type_id,
      period_id: period?.id ?? null,
      occurrence_date: form.occurrence_date,
      end_date: form.end_date || null,
      quantity,
      unit: "dias",
      justification: form.justification.trim() || null,
      notes,

    };

    const result = editing
      ? await supabase.from("occurrences").update(payload).eq("id", editing.id)
      : await supabase.from("occurrences").insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  async function remove(row: Occ) {
    if (!window.confirm(`Excluir a ocorrência de ${row.employees?.full_name ?? "funcionário"}?`)) return;

    setError("");
    const { error } = await supabase.from("occurrences").delete().eq("id", row.id);

    if (error) setError(error.message);
    else await load();
  }


  function exportFilteredReport() {
    const reportRows: Record<string, unknown>[] = [
      ...absenceRows.map(row => ({
        "Funcionário": row.employees?.full_name ?? "",
        "Data inicial": row.occurrence_date,
        "Data final": row.end_date ?? "",
        "Tipo": row.occurrence_types?.name ?? "",
        "Quantidade": row.quantity ?? "",
        "Unidade": row.unit ?? "dias",
        "Justificativa": row.justification ?? "",
        "Observações": row.notes ?? "",
      })),
      ...daysOffRows.map(row => ({
        "Funcionário": row.employees?.full_name ?? "",
        "Data inicial": row.occurrence_date,
        "Data final": row.end_date ?? "",
        "Tipo": row.occurrence_types?.name ?? "",
        "Quantidade": row.quantity ?? "",
        "Unidade": row.unit ?? "dias",
        "Justificativa": row.justification ?? "",
        "Observações": row.notes ?? "",
      })),
      ...filteredHistoricalAbsences.map(row => ({
        "Funcionário": row.employee_name ?? "",
        "Data inicial": historicalDisplayStart(row),
        "Data final": row.absence_display_end_date || row.period_end || "",
        "Tipo": row.absence_display_type || "Falta",
        "Quantidade": row.absence_display_quantity ?? row.absence_quantity,
        "Unidade": "dias",
        "Justificativa": row.absence_display_justification ?? "",
        "Observações": row.absence_display_notes ?? "",
      })),
    ];
    if (!reportRows.length) {
      setError("Não há registros para exportar com os filtros selecionados.");
      return;
    }
    const escape = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    const csv = ["\ufeff" + Object.keys(reportRows[0]).map(escape).join(";"), ...reportRows.map(row => Object.values(row).map(escape).join(";"))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "faltas-e-folgas-filtradas.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function displayQuantity(row: Occ) {
    return row.quantity == null ? "—" : String(Math.round(Number(row.quantity)));
  }

  function formatDate(value: string) {
    if (!value) return "—";
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }

  return (
    <div className="dp-screen min-h-screen bg-background">
      <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </a>
          <ScreenBrand name="Faltas e Folgas" />
        </div>
      </header>

      <main className="dp-screen-content mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
        <div className="relative isolate mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 flex items-end justify-between gap-4 [&_p]:!text-white/75 [&_h1]:!text-white">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ponto</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[30px]">Faltas e Folgas</h1>
            <p className="text-sm text-muted-foreground">
              Registre faltas e folgas em dias. Folga descontada é apenas informativa; folga abonada entra em abonos.
            </p>
          </div>
          <button onClick={startNew} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
            <Plus className="mr-2 inline h-4 w-4" />
            Novo registro
          </button>
        </div>


        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <Card className="mt-6 p-4">
          <div className="mb-3 text-sm font-medium">Filtros</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-sm"><span className="text-muted-foreground">Empresa</span><CompanyFilter value={companyFilter} onChange={value => { setCompanyFilter(value); setFilterEmployee("todos"); }} /></label>
            <label className="grid gap-1 text-sm"><span className="text-muted-foreground">Competência</span><select value={filterPeriod} onChange={e => { setFilterPeriod(e.target.value); setFilterEmployee("todos"); }} className="rounded-lg border bg-background px-3 py-2"><option value="todos">Todas as competências</option>{periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}</select></label>
            <label className="grid gap-1 text-sm"><span className="text-muted-foreground">Funcionário</span><select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="rounded-lg border bg-background px-3 py-2"><option value="todos">Todos os funcionários</option>{employeesForFilter.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
          </div>
        </Card>

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={exportFilteredReport} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Download className="h-4 w-4" /> Exportar relatório filtrado
          </button>
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Faltas</h2><p className="text-xs text-muted-foreground">{absenceRows.length + filteredHistoricalAbsences.length} registro(s)</p></div><button type="button" onClick={() => setShowAbsences(v => !v)} className="rounded-md border p-2 hover:bg-muted" title={showAbsences ? "Ocultar faltas" : "Mostrar faltas"} aria-label={showAbsences ? "Ocultar faltas" : "Mostrar faltas"}>{showAbsences ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
          {showAbsences && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Quantidade</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">
            {absenceRows.length + filteredHistoricalAbsences.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">Nenhuma falta encontrada para os filtros selecionados.</td></tr>}
            {[...absenceRows.map(row => ({ kind: "official" as const, row, sortDate: row.occurrence_date })), ...filteredHistoricalAbsences.map(row => ({ kind: "historical" as const, row, sortDate: row.absence_display_date || historicalDisplayStart(row) }))].sort((a, b) => b.sortDate.localeCompare(a.sortDate)).map(item => item.kind === "official" ? (
              <tr key={"official-" + item.row.id} className="transition-colors hover:bg-muted/25">
                <td className="px-5 py-4 font-medium">{item.row.employees?.full_name ?? "—"}</td>
                <td className="px-5 py-4">{formatDate(item.row.occurrence_date)}{item.row.end_date ? " → " + formatDate(item.row.end_date) : ""}</td>
                <td className="px-5 py-4">{item.row.occurrence_types?.name ?? "—"}</td>
                <td className="px-5 py-4">{displayQuantity(item.row)}</td>
                <td className="px-5 py-4 text-right"><button onClick={() => startEdit(item.row)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove(item.row)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ) : (
              <tr key={"historical-" + item.row.id} className="transition-colors hover:bg-muted/25">
                <td className="px-5 py-4 font-medium">{item.row.employee_name}</td>
                <td className="px-5 py-4">{formatDate(item.row.absence_display_date || historicalDisplayStart(item.row))}{(item.row.absence_display_end_date || item.row.period_end) ? " → " + formatDate(item.row.absence_display_end_date || item.row.period_end) : ""}</td>
                <td className="px-5 py-4">{item.row.absence_display_type || "Falta importada da BASE"}</td>
                <td className="px-5 py-4">{displayHistoricalQuantity(item.row)}</td>
                <td className="px-5 py-4 text-right"><button onClick={() => startHistoricalEdit(item.row)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><span className="inline-block px-2 text-xs text-muted-foreground" title="Registro histórico: não excluir dados originais">BASE</span></td>
              </tr>
            ))}
          </tbody></table></div>}
        </Card>

        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Folgas</h2><p className="text-xs text-muted-foreground">{daysOffRows.length} registro(s)</p></div><button type="button" onClick={() => setShowDaysOff(v => !v)} className="rounded-md border p-2 hover:bg-muted" title={showDaysOff ? "Ocultar folgas" : "Mostrar folgas"} aria-label={showDaysOff ? "Ocultar folgas" : "Mostrar folgas"}>{showDaysOff ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
          {showDaysOff && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Quantidade</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">
            {daysOffRows.length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">Nenhuma folga encontrada para os filtros selecionados.</td></tr>}
            {daysOffRows.map(row => <tr key={row.id} className="transition-colors hover:bg-muted/25"><td className="px-5 py-4 font-medium">{row.employees?.full_name ?? "—"}</td><td className="px-5 py-4">{formatDate(row.occurrence_date)}{row.end_date ? " → " + formatDate(row.end_date) : ""}</td><td className="px-5 py-4">{row.occurrence_types?.name ?? "—"}</td><td className="px-5 py-4">{displayQuantity(row)}</td><td className="px-5 py-4 text-right"><button onClick={() => startEdit(row)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove(row)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td></tr>)}
          </tbody></table></div>}
        </Card>
      </main>

      {historicalEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-xl p-6">
            <h2 className="text-xl font-bold">Editar registro</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Registro importado da BASE. As alterações abaixo são somente para visualização e não modificam a BASE original, os cálculos, abonos ou banco de horas.
            </p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm md:col-span-2">
                <span className="text-muted-foreground">Funcionário: </span><strong>{historicalEditing.employee_name}</strong>
              </div>
              <select value={historicalForm.type} onChange={e => setHistoricalForm({ ...historicalForm, type: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2">
                <option value="">Tipo de ocorrência</option>
                {visibleTypes.filter(t => ["falta_justificada", "falta_injustificada"].includes(t.code)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <label className="grid gap-1 text-sm"><span>Data inicial</span><input type="date" value={historicalForm.date} onChange={e => setHistoricalForm({ ...historicalForm, date: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
              <label className="grid gap-1 text-sm"><span>Data final</span><input type="date" value={historicalForm.endDate} onChange={e => setHistoricalForm({ ...historicalForm, endDate: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
              <input type="number" min="0" step="1" placeholder="Quantidade de dias" value={historicalForm.quantity} onChange={e => setHistoricalForm({ ...historicalForm, quantity: e.target.value })} className="rounded-lg border px-3 py-2" />
              {visibleTypes.find(t => t.id === historicalForm.type)?.requires_justification && (
                <textarea placeholder="Justificativa" value={historicalForm.justification} onChange={e => setHistoricalForm({ ...historicalForm, justification: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
              )}
              <textarea placeholder="Observações" value={historicalForm.notes} onChange={e => setHistoricalForm({ ...historicalForm, notes: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
            </div>
            {historicalSaveError && <p className="mt-3 text-sm text-destructive">{historicalSaveError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setHistoricalEditing(null)} className="rounded-lg border px-4 py-2">Cancelar</button>
              <button disabled={historicalSaving} onClick={() => void saveHistoricalDisplay()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{historicalSaving ? "Salvando..." : "Salvar visualização"}</button>
            </div>
          </Card>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-xl p-6">
            <h2 className="text-xl font-bold">{editing ? "Editar registro" : "Novo registro"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Registre a falta ou folga e a quantidade de dias correspondente.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2">
                <option value="">Funcionário</option>
                {employeesForDate.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>

              <select value={form.occurrence_type_id} onChange={e => changeType(e.target.value)} className="rounded-lg border px-3 py-2 md:col-span-2">
                <option value="">Tipo de ocorrência</option>
                {visibleTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>

              <input type="date" value={form.occurrence_date} onChange={e => setForm({ ...form, occurrence_date: e.target.value })} className="rounded-lg border px-3 py-2" />

              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="rounded-lg border px-3 py-2" />


                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Quantidade de dias"
                  value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className="rounded-lg border px-3 py-2"
                />

              

              {selectedType?.requires_justification && (
                <textarea
                  placeholder="Justificativa"
                  value={form.justification}
                  onChange={e => setForm({ ...form, justification: e.target.value })}
                  className="rounded-lg border px-3 py-2 md:col-span-2"
                />
              )}

              <textarea
                placeholder="Observações"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="rounded-lg border px-3 py-2 md:col-span-2"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button>
              <button disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
