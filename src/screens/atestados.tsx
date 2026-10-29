import { ArrowLeft, ChevronDown, ChevronUp, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CompanyFilter } from "@/components/company-filter";

import { ScreenBrand } from "@/components/screen-brand";
type Employee = { id: string; full_name: string; status?: string; hire_date?: string | null; termination_date?: string | null; company_id?: string | null };
type Certificate = {
  id: string; employee_id: string; start_date: string; end_date: string; days: number;
  certificate_type: string; cid: string | null; notes: string | null; employees?: { full_name: string } | null;
};

const emptyForm = { employee_id: "", start_date: "", end_date: "", days: "", certificate_type: "medico", cid: "", notes: "" };

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function countDays(start: string, end: string) {
  if (!start || !end) return 0;
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000) + 1);
}

type Declaration = { id: string; employee_id: string; occurrence_date: string; quantity: number; notes: string | null; employees?: { full_name: string } | null };
type Period = { id: string; start_date: string; end_date: string };
type HistoricalBaseRow = { id: string; employee_id: string | null; employee_name: string; registration: string | null; period_id: string; reference_year: number; reference_month: number; certificate_minutes: number; declaration_minutes: number; period_start?: string; period_end?: string; certificate_type?: string | null; certificate_cid?: string | null; declaration_observation?: string | null };
type HistoricalAnnotationForm = { row: HistoricalBaseRow; certificate_type: string; certificate_cid: string; declaration_observation: string };

const declarationReasons = ["Acompanhante", "Consulta", "Exame", "Outros"];

export function Atestados() {
  const [rows, setRows] = useState<Certificate[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [historicalBaseRows, setHistoricalBaseRows] = useState<HistoricalBaseRow[]>([]);
  const [historicalEdit, setHistoricalEdit] = useState<HistoricalAnnotationForm | null>(null);
  const [savingHistoricalAnnotation, setSavingHistoricalAnnotation] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [filterEmployee, setFilterEmployee] = useState("todos");
  const [companyFilter, setCompanyFilter] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("todos");
  const [showCertificates, setShowCertificates] = useState(true);
  const [showDeclarations, setShowDeclarations] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"atestado" | "declaracao">("atestado");
  const [declarationForm, setDeclarationForm] = useState({ employee_id: "", occurrence_date: "", quantity: "", reason: "Acompanhante", notes: "" });
  const [editingDeclaration, setEditingDeclaration] = useState<Declaration | null>(null);

  const referenceDate = mode === "declaracao" ? declarationForm.occurrence_date : form.start_date;
  const employeesForDate = employees.filter(e =>
    (!companyFilter || e.company_id === companyFilter) &&
    (!referenceDate || ((!e.hire_date || e.hire_date <= referenceDate) && (!e.termination_date || e.termination_date >= referenceDate)))
  );

  async function load() {
    setError("");
    const { data, error } = await supabase
      .from("medical_certificates")
      .select("id,employee_id,start_date,end_date,days,certificate_type,cid,notes,employees(full_name)")
      .order("start_date", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as Certificate[]);
    const decl = await supabase.from("occurrences").select("id,employee_id,occurrence_date,quantity,notes,employees(full_name),occurrence_types!inner(code)").eq("occurrence_types.code", "declaracao_horas").order("occurrence_date", { ascending: false });
    if (!decl.error) setDeclarations((decl.data ?? []) as unknown as Declaration[]);
    const { data: periodData } = await supabase.from("time_periods").select("id,start_date,end_date").order("start_date", { ascending: false });
    const loadedPeriods = (periodData ?? []) as Period[];
    setPeriods(loadedPeriods);

    // A BASE histórica contém totais por funcionário/competência, não lançamentos
    // individuais com data, CID ou motivo. Exibimos esses totais separadamente,
    // sem transformá-los em atestados/declarações operacionais nem afetar cálculos.
    const historicalResult = await (supabase as any).from("historical_kpi_data")
      .select("id,employee_id,employee_name,registration,period_id,reference_year,reference_month,certificate_minutes,declaration_minutes")
      .or("certificate_minutes.gt.0,declaration_minutes.gt.0")
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false });
    if (historicalResult.error) {
      setError(previous => previous || "Não foi possível carregar os totais históricos da BASE: " + historicalResult.error.message);
      setHistoricalBaseRows([]);
    } else {
      const { data: annotationData, error: annotationError } = await (supabase as any)
        .from("historical_kpi_annotations")
        .select("historical_kpi_data_id,certificate_type,certificate_cid,declaration_observation");
      if (annotationError) {
        setError(previous => previous || "Os campos complementares do histórico ainda precisam ser habilitados no banco de dados: " + annotationError.message);
      }
      const annotationsByHistoricalId = new Map((annotationData ?? []).map((item: any) => [item.historical_kpi_data_id, item]));
      const periodById = new Map(loadedPeriods.map(p => [p.id, p]));
      const historical = ((historicalResult.data ?? []) as HistoricalBaseRow[])
        .map(row => {
          const annotation = annotationsByHistoricalId.get(row.id) as any;

          const period = periodById.get(row.period_id);
          // A competência histórica excepcional de jan/2026 foi fechada de 11/12/2025 a 20/01/2026.
          // Essa regra afeta apenas a identificação exibida nesta lista histórica, sem alterar períodos ou cálculos.
          const isExceptionalJan2026 = Number(row.reference_year) === 2026 && Number(row.reference_month) === 1;
          const fallbackStart = new Date(row.reference_year, row.reference_month - 2, 21);
          const fallbackEnd = new Date(row.reference_year, row.reference_month - 1, 20);
          const toISO = (date: Date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
          return {
            ...row,
            certificate_type: annotation?.certificate_type ?? null,
            certificate_cid: annotation?.certificate_cid ?? null,
            declaration_observation: annotation?.declaration_observation ?? null,
            period_start: isExceptionalJan2026 ? "2025-12-11" : (period?.start_date ?? toISO(fallbackStart)),
            period_end: isExceptionalJan2026 ? "2026-01-20" : (period?.end_date ?? toISO(fallbackEnd)),
          };
        })
        .filter(row => (row.period_end ?? "") >= "2025-12-11");
      setHistoricalBaseRows(historical);

    }
  }

  async function loadEmployees() {
    const { data } = await (supabase as any).from("employees").select("id,full_name,status,hire_date,termination_date,company_id").order("full_name");
    setEmployees((data ?? []) as Employee[]);
  }

  useEffect(() => { void load(); void loadEmployees(); }, []);

  const selectedPeriod = periods.find(p => p.id === filterPeriod);
  const employeesForFilter = employees.filter(e => (!companyFilter || e.company_id === companyFilter) && (!selectedPeriod || ((!e.hire_date || e.hire_date <= selectedPeriod.end_date) && (!e.termination_date || e.termination_date >= selectedPeriod.start_date))));
  const companyEmployeeIds = new Set(employees.filter(e => !companyFilter || e.company_id === companyFilter).map(e => e.id));
  const filteredRows = rows.filter(row =>
    companyEmployeeIds.has(row.employee_id) &&
    (filterEmployee === "todos" || row.employee_id === filterEmployee) &&
    (!selectedPeriod || (row.start_date <= selectedPeriod.end_date && row.end_date >= selectedPeriod.start_date))
  );
  const filteredDeclarations = declarations.filter(row =>
    companyEmployeeIds.has(row.employee_id) &&
    (filterEmployee === "todos" || row.employee_id === filterEmployee) &&
    (!selectedPeriod || (row.occurrence_date >= selectedPeriod.start_date && row.occurrence_date <= selectedPeriod.end_date))
  );
  function periodLabel(period: Period) {
    const displayStart = period.end_date === "2026-01-20"
      ? "2025-12-11"
      : period.start_date;
    return `${formatDate(displayStart)} a ${formatDate(period.end_date)}`;
  }

  function formatHistoricalHours(minutesValue: number | null | undefined) {
    const minutes = Math.max(0, Math.round(Number(minutesValue ?? 0)));
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  const filteredHistoricalBaseRows = historicalBaseRows.filter(row => {
    const matchedEmployee = row.employee_id ? employees.find(employee => employee.id === row.employee_id) : null;
    // Registros sem vínculo precisam continuar visíveis para corrigir o funcionário.
    const companyMatches = !companyFilter || !matchedEmployee || matchedEmployee.company_id === companyFilter;
    const employeeMatches = filterEmployee === "todos" || !row.employee_id || row.employee_id === filterEmployee;
    const periodMatches = !selectedPeriod ||
      (row.period_start <= selectedPeriod.end_date && row.period_end >= selectedPeriod.start_date);
    return companyMatches && employeeMatches && periodMatches;
  });

  const historicalCertificates = filteredHistoricalBaseRows.filter(row => Number(row.certificate_minutes ?? 0) > 0);
  const historicalDeclarations = filteredHistoricalBaseRows.filter(row => Number(row.declaration_minutes ?? 0) > 0);

  function historicalEmployeeName(row: HistoricalBaseRow) {
    return (row.employee_id ? employees.find(employee => employee.id === row.employee_id)?.full_name : null) || row.employee_name || "Funcionário não identificado";
  }



  function startEditHistorical(row: HistoricalBaseRow, kind: "atestado" | "declaracao") {
    setHistoricalEdit({
      row,
      certificate_type: row.certificate_type || "medico",
      certificate_cid: row.certificate_cid || "",
      declaration_observation: row.declaration_observation || "",
    });
    setMode(kind);
    setError("");
  }

  async function saveHistoricalAnnotation() {
    if (!historicalEdit) return;
    setSavingHistoricalAnnotation(true);
    setError("");
    const row = historicalEdit.row;
    const payload = {
      historical_kpi_data_id: row.id,
      certificate_type: Number(row.certificate_minutes ?? 0) > 0 ? historicalEdit.certificate_type : null,
      certificate_cid: Number(row.certificate_minutes ?? 0) > 0 ? (historicalEdit.certificate_cid.trim() || null) : null,
      declaration_observation: Number(row.declaration_minutes ?? 0) > 0 ? (historicalEdit.declaration_observation.trim() || null) : null,
      updated_at: new Date().toISOString(),
    };
    const { error: saveError } = await (supabase as any)
      .from("historical_kpi_annotations")
      .upsert(payload, { onConflict: "historical_kpi_data_id" });
    setSavingHistoricalAnnotation(false);
    if (saveError) {
      setError("Não foi possível salvar os campos complementares do histórico. Verifique se a migração historical_kpi_annotations foi aplicada. " + saveError.message);
      return;
    }
    setHistoricalEdit(null);
    await load();
  }


  function exportFilteredReport() {
    const reportRows: Record<string, unknown>[] = [
      ...filteredRows.map(row => ({
        "Tipo de registro": "Atestado",
        "Funcionário": row.employees?.full_name ?? "",
        "Data inicial": row.start_date,
        "Data final": row.end_date,
        "Dias": displayedDays(row),
        "Horas abonadas": "",
        "Tipo / motivo": row.certificate_type ?? "",
        "CID": row.cid ?? "",
        "Observações": row.notes ?? "",
      })),
      ...historicalCertificates.map(row => ({
        "Tipo de registro": "Atestado",
        "Funcionário": historicalEmployeeName(row),
        "Data inicial": row.period_start ?? "",
        "Data final": row.period_end ?? "",
        "Dias": "",
        "Horas abonadas": formatHistoricalHours(row.certificate_minutes),
        "Tipo / motivo": row.certificate_type ? (({ medico: "Médico", odontologico: "Odontológico", acompanhamento: "Acompanhamento", outro: "Outro" } as Record<string, string>)[row.certificate_type] || row.certificate_type) : "Tipo não informado",
        "CID": row.certificate_cid ?? "",
        "Observações": "",
      })),
      ...filteredDeclarations.map(row => ({
        "Tipo de registro": "Declaração de horas",
        "Funcionário": row.employees?.full_name ?? "",
        "Data inicial": row.occurrence_date,
        "Data final": row.occurrence_date,
        "Dias": "",
        "Horas abonadas": formatHistoricalHours(Math.round(Number(row.quantity ?? 0) * 60)),
        "Tipo / motivo": "",
        "CID": "",
        "Observações": row.notes ?? "",
      })),
      ...historicalDeclarations.map(row => ({
        "Tipo de registro": "Declaração de horas",
        "Funcionário": historicalEmployeeName(row),
        "Data inicial": row.period_start ?? "",
        "Data final": row.period_end ?? "",
        "Dias": "",
        "Horas abonadas": formatHistoricalHours(row.declaration_minutes),
        "Tipo / motivo": "",
        "CID": "",
        "Observações": row.declaration_observation ?? "",
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
    const csv = ["\\ufeff" + Object.keys(reportRows[0]).map(escape).join(";"), ...reportRows.map(row => Object.values(row).map(escape).join(";"))].join("\\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "declaracoes-e-atestados-filtrados.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function displayedDays(row: Certificate) {
    if (!selectedPeriod) return row.days;
    const overlapStart = row.start_date > selectedPeriod.start_date ? row.start_date : selectedPeriod.start_date;
    const overlapEnd = row.end_date < selectedPeriod.end_date ? row.end_date : selectedPeriod.end_date;
    return overlapEnd < overlapStart ? 0 : countDays(overlapStart, overlapEnd);
  }

  function startNew() {
    setMode("atestado");
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  async function startEdit(row: Certificate) {
    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      start_date: row.start_date,
      end_date: row.end_date,
      days: String(row.days ?? ""),
      certificate_type: row.certificate_type || "medico",
      cid: row.cid || "",
      notes: row.notes || "",
    });
    setError("");
    setOpen(true);
  }

  function startEditDeclaration(row: Declaration) {
    const parts = String(row.notes ?? "").split(" — ");
    const firstPart = parts[0] ?? "";
    const reason = declarationReasons.includes(firstPart) ? firstPart : "Outros";
    const totalMinutes = Math.round(Number(row.quantity || 0) * 60);
    setEditingDeclaration(row);
    setMode("declaracao");
    setDeclarationForm({ employee_id: row.employee_id, occurrence_date: row.occurrence_date, quantity: String(Math.floor(totalMinutes / 60)).padStart(2, "0") + ":" + String(totalMinutes % 60).padStart(2, "0"), reason, notes: parts.slice(1).join(" — ") });
    setError("");
    setOpen(true);
  }

  async function removeDeclaration(row: Declaration) {
    if (!window.confirm("Excluir a declaração de " + (row.employees?.full_name ?? "funcionário") + "?")) return;
    setError("");
    const { error } = await supabase.from("occurrences").delete().eq("id", row.id);
    if (error) setError(error.message); else await load();
  }
  async function save() {
    setError("");
    if (mode === "declaracao") {
      const [h, m] = declarationForm.quantity.split(":").map(Number);
      const minutes = (h || 0) * 60 + (m || 0);
      if (!declarationForm.employee_id || !declarationForm.occurrence_date || minutes <= 0) { setError("Informe funcionário, data e horas abonadas."); return; }
      const { data: type } = await supabase.from("occurrence_types").select("id").eq("code", "declaracao_horas").single();
      if (!type?.id) { setError("Tipo de declaração não encontrado."); return; }
      const { data: periods } = await supabase.from("time_periods").select("id,start_date,end_date");
      const period = (periods ?? []).find((p: any) => declarationForm.occurrence_date >= p.start_date && declarationForm.occurrence_date <= p.end_date);
      const notes = declarationForm.reason + (declarationForm.notes.trim() ? " — " + declarationForm.notes.trim() : "");
      setSaving(true);
      const result = editingDeclaration
        ? await supabase.from("occurrences").update({ employee_id: declarationForm.employee_id, occurrence_date: declarationForm.occurrence_date, quantity: minutes / 60, unit: "horas", period_id: period?.id ?? null, notes }).eq("id", editingDeclaration.id)
        : await supabase.from("occurrences").insert({ employee_id: declarationForm.employee_id, occurrence_type_id: type.id, occurrence_date: declarationForm.occurrence_date, period_id: period?.id ?? null, quantity: minutes / 60, unit: "horas", notes });
      setSaving(false);
      if (result.error) { setError(result.error.message); return; }
      setEditingDeclaration(null);
      setDeclarationForm({ employee_id: "", occurrence_date: "", quantity: "", reason: "Acompanhante", notes: "" });
      setOpen(false);
      await load(); return;
    }
    if (!form.employee_id || !form.start_date || !form.end_date) {
      setError("Informe funcionário, início e fim do atestado.");
      return;
    }
    if (form.end_date < form.start_date) {
      setError("A data final não pode ser anterior à data inicial.");
      return;
    }
    if (form.days.trim() && (!Number.isInteger(Number(form.days)) || Number(form.days) <= 0)) {
      setError("A quantidade de dias deve ser um número inteiro positivo.");
      return;
    }
    setSaving(true);
    const payload = {
      employee_id: form.employee_id,
      start_date: form.start_date,
      end_date: form.end_date,
      days: form.days.trim() ? Number(form.days) : countDays(form.start_date, form.end_date),
      certificate_type: form.certificate_type,
      notes: form.notes.trim() || null,
      cid: form.cid.trim() || null,
    };
    const result = editing
      ? await supabase.from("medical_certificates").update(payload).eq("id", editing.id)
      : await supabase.from("medical_certificates").insert(payload);
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

  async function remove(row: Certificate) {
    if (!window.confirm(`Excluir o atestado de ${row.employees?.full_name ?? "funcionário"}?`)) return;
    setError("");
    const { error } = await supabase.from("medical_certificates").delete().eq("id", row.id);
    if (error) setError(error.message);
    else await load();
  }

  return <div className="dp-screen min-h-screen bg-background">
    <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[1500px] items-center justify-between">
      <a href="/" className="flex gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a>
      <ScreenBrand name="Declarações e Atestados" />
    </div></header>
    <main className="dp-screen-content mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="relative isolate mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 flex items-end justify-between gap-4 [&_p]:!text-white/75 [&_h1]:!text-white"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ponto</p><h1 className="text-2xl font-semibold tracking-tight sm:text-[30px]">Declarações e Atestados</h1><p className="text-sm text-muted-foreground">Registre atestados e declarações com as horas efetivamente abonadas.</p></div>
        <div className="flex gap-2"><button onClick={() => { startNew(); setMode("atestado"); }} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="mr-2 inline h-4 w-4" />Novo atestado</button><button onClick={() => { setMode("declaracao"); setEditing(null); setEditingDeclaration(null); setError(""); setDeclarationForm({ employee_id: "", occurrence_date: "", quantity: "", reason: "Acompanhante", notes: "" }); setOpen(true); }} className="rounded-lg border px-4 py-2.5 text-sm"><Plus className="mr-2 inline h-4 w-4" />Nova declaração</button></div>
      </div>
      <Card className="mt-6 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium"><span>Filtros</span><span className="text-xs font-normal text-muted-foreground">Aplicados às duas listas</span></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Atestados</h2><p className="text-xs text-muted-foreground">{filteredRows.length + historicalCertificates.length} registro(s), incluindo histórico consolidado</p></div><button type="button" onClick={() => setShowCertificates(v => !v)} className="rounded-md border p-2 hover:bg-muted" title={showCertificates ? "Ocultar atestados" : "Mostrar atestados"} aria-label={showCertificates ? "Ocultar atestados" : "Mostrar atestados"}>{showCertificates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
        {showCertificates && <div className="max-h-[calc(100vh-300px)] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr>
          <th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Início</th><th className="px-5 py-3">Fim</th><th className="px-5 py-3">Dias</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">CID</th><th className="px-5 py-3 text-right">Ações</th>
        </tr></thead><tbody className="divide-y">
          {filteredRows.length === 0 && historicalCertificates.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nenhum atestado encontrado para os filtros selecionados.</td></tr>}
          {filteredRows.map(r => <tr key={r.id} className="transition-colors hover:bg-muted/25"><td className="px-5 py-4 font-medium">{r.employees?.full_name ?? "—"}</td><td className="px-5 py-4">{formatDate(r.start_date)}</td><td className="px-5 py-4">{formatDate(r.end_date)}</td><td className="px-5 py-4">{displayedDays(r)}</td><td className="px-5 py-4">{r.certificate_type}</td><td className="px-5 py-4">{r.cid ?? "—"}</td><td className="px-5 py-4 text-right"><button onClick={() => void startEdit(r)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove(r)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td></tr>)}
          {historicalCertificates.map(r => <tr key={"base-cert-" + r.id} className="bg-muted/20"><td className="px-5 py-4 font-medium">{historicalEmployeeName(r)}</td><td className="whitespace-nowrap px-5 py-4">{formatDate(r.period_start || "")}</td><td className="whitespace-nowrap px-5 py-4">{formatDate(r.period_end || "")}</td><td className="px-5 py-4">—</td><td className="px-5 py-4">{(r.certificate_type ? ({ medico: "Médico", odontologico: "Odontológico", acompanhamento: "Acompanhamento", outro: "Outro" } as Record<string, string>)[r.certificate_type] || r.certificate_type : "Tipo não informado") + " · " + formatHistoricalHours(r.certificate_minutes) + " h"}</td><td className="px-5 py-4">{r.certificate_cid || "—"}</td><td className="px-5 py-4 text-right"><button onClick={() => startEditHistorical(r, "atestado")} className="rounded-md border p-2" title="Editar tipo e CID do histórico"><Pencil className="h-4 w-4" /></button></td></tr>)}
        </tbody></table></div>}
      </Card>
      <Card className="mt-6 overflow-hidden"><div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Declarações</h2><p className="text-xs text-muted-foreground">{filteredDeclarations.length + historicalDeclarations.length} registro(s), incluindo histórico consolidado</p></div><button type="button" onClick={() => setShowDeclarations(v => !v)} className="rounded-md border p-2 hover:bg-muted" title={showDeclarations ? "Ocultar declarações" : "Mostrar declarações"} aria-label={showDeclarations ? "Ocultar declarações" : "Mostrar declarações"}>{showDeclarations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>{showDeclarations && <div className="max-h-[calc(100vh-300px)] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Horas abonadas</th><th className="px-5 py-3">Observação</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">{filteredDeclarations.length === 0 && historicalDeclarations.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Nenhuma declaração encontrada para os filtros selecionados.</td></tr>}{filteredDeclarations.map(d => <tr key={d.id} className="transition-colors hover:bg-muted/25"><td className="px-5 py-4 font-medium">{d.employees?.full_name ?? "—"}</td><td className="px-5 py-4">{formatDate(d.occurrence_date)}</td><td className="px-5 py-4">{String(Math.floor(Number(d.quantity) || 0)).padStart(2,"0")}:{String(Math.round(((Number(d.quantity)||0)%1)*60)).padStart(2,"0")}</td><td className="px-5 py-4">{d.notes ?? "—"}</td><td className="px-5 py-4 text-right"><button onClick={() => startEditDeclaration(d)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button onClick={() => void removeDeclaration(d)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td></tr>)}{historicalDeclarations.map(r => <tr key={"base-decl-" + r.id} className="bg-muted/20"><td className="px-5 py-4 font-medium">{historicalEmployeeName(r)}</td><td className="whitespace-nowrap px-5 py-4">{formatDate(r.period_start || "")} a {formatDate(r.period_end || "")}</td><td className="px-5 py-4">{formatHistoricalHours(r.declaration_minutes)}</td><td className="px-5 py-4">{r.declaration_observation || "—"}</td><td className="px-5 py-4 text-right"><button onClick={() => startEditHistorical(r, "declaracao")} className="rounded-md border p-2" title="Editar observação do histórico"><Pencil className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>}</Card>
    </main>
    {historicalEdit && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-xl p-6">
      <h2 className="text-xl font-bold">{Number(historicalEdit.row.certificate_minutes ?? 0) > 0 && Number(historicalEdit.row.declaration_minutes ?? 0) > 0 ? "Editar dados complementares do histórico" : Number(historicalEdit.row.certificate_minutes ?? 0) > 0 ? "Editar atestado importado da BASE" : "Editar declaração de horas importada da BASE"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Esses campos são apenas complementares. Não alteram as horas históricas, não criam lançamentos oficiais e não interferem nos cálculos.</p>
      <div className="mt-4 grid gap-3">
        {Number(historicalEdit.row.certificate_minutes ?? 0) > 0 && <>
          <label className="grid gap-1 text-sm">Tipo do atestado<select value={historicalEdit.certificate_type} onChange={e => setHistoricalEdit(current => current ? { ...current, certificate_type: e.target.value } : current)} className="rounded-lg border bg-background px-3 py-2"><option value="medico">Médico</option><option value="odontologico">Odontológico</option><option value="acompanhamento">Acompanhamento</option><option value="outro">Outro</option></select></label>
          <label className="grid gap-1 text-sm">CID<input value={historicalEdit.certificate_cid} onChange={e => setHistoricalEdit(current => current ? { ...current, certificate_cid: e.target.value } : current)} placeholder="Informe o CID" className="rounded-lg border bg-background px-3 py-2" /></label>
        </>}
        {Number(historicalEdit.row.declaration_minutes ?? 0) > 0 && <label className="grid gap-1 text-sm">Observação da declaração de horas<textarea value={historicalEdit.declaration_observation} onChange={e => setHistoricalEdit(current => current ? { ...current, declaration_observation: e.target.value } : current)} placeholder="Digite a observação" className="rounded-lg border bg-background px-3 py-2" /></label>}
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button onClick={() => setHistoricalEdit(null)} className="rounded-lg border px-4 py-2">Cancelar</button><button disabled={savingHistoricalAnnotation} onClick={() => void saveHistoricalAnnotation()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{savingHistoricalAnnotation ? "Salvando..." : "Salvar alterações"}</button></div>
    </Card></div>}
    {open && mode === "atestado" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-xl p-6">
      <h2 className="text-xl font-bold">{editing ? "Editar atestado" : "Novo atestado"}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2"><option value="">Funcionário</option>{employeesForDate.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select>
        <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="rounded-lg border px-3 py-2" />
        <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="rounded-lg border px-3 py-2" />
        <input type="number" min="1" step="1" placeholder={`Quantidade de dias (automático: ${countDays(form.start_date, form.end_date) || "—"})`} value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} className="rounded-lg border px-3 py-2" />
        <select value={form.certificate_type} onChange={e => setForm({ ...form, certificate_type: e.target.value })} className="rounded-lg border px-3 py-2"><option value="medico">Médico</option><option value="odontologico">Odontológico</option><option value="acompanhamento">Acompanhamento</option><option value="outro">Outro</option></select>
        <input placeholder="CID" value={form.cid} onChange={e => setForm({ ...form, cid: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
        <textarea placeholder="Observações" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{saving ? "Salvando..." : "Salvar"}</button></div>
    </Card></div>}
    {open && mode === "declaracao" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-xl p-6">
      <h2 className="text-xl font-bold">{editingDeclaration ? "Editar declaração de horas" : "Nova declaração de horas"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Informe somente as horas que serão efetivamente abonadas.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <select value={declarationForm.employee_id} onChange={e => setDeclarationForm({ ...declarationForm, employee_id: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2"><option value="">Funcionário</option>{employeesForDate.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select>
        <input type="date" value={declarationForm.occurrence_date} onChange={e => setDeclarationForm({ ...declarationForm, occurrence_date: e.target.value })} className="rounded-lg border px-3 py-2" />
        <input type="time" value={declarationForm.quantity} onChange={e => setDeclarationForm({ ...declarationForm, quantity: e.target.value })} className="rounded-lg border px-3 py-2" />
        <select value={declarationForm.reason} onChange={e => setDeclarationForm({ ...declarationForm, reason: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2">{declarationReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select>
        <textarea placeholder="Observações" value={declarationForm.notes} onChange={e => setDeclarationForm({ ...declarationForm, notes: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{saving ? "Salvando..." : editingDeclaration ? "Salvar alterações" : "Salvar declaração"}</button></div>
    </Card></div>}
  </div>;
}
