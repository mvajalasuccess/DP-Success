import { ArrowLeft, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
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
type HistoricalBaseRow = { id: string; employee_id: string | null; employee_name: string; registration: string | null; period_id: string; reference_year: number; reference_month: number; certificate_minutes: number; declaration_minutes: number; period_start?: string; period_end?: string };

const declarationReasons = ["Acompanhante", "Consulta", "Exame", "Outros"];

export function Atestados() {
  const [rows, setRows] = useState<Certificate[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [historicalBaseRows, setHistoricalBaseRows] = useState<HistoricalBaseRow[]>([]);
  const [historicalEmployeeChoices, setHistoricalEmployeeChoices] = useState<Record<string, string>>({});
  const [savingHistoricalId, setSavingHistoricalId] = useState<string | null>(null);
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
      const periodById = new Map(loadedPeriods.map(p => [p.id, p]));
      const historical = ((historicalResult.data ?? []) as HistoricalBaseRow[])
        .map(row => { const period = periodById.get(row.period_id); return { ...row, period_start: period?.start_date, period_end: period?.end_date }; })
        .filter(row => (row.period_end ?? (String(row.reference_year) + "-" + String(row.reference_month).padStart(2, "0") + "-28")) >= "2025-12-11");
      setHistoricalBaseRows(historical);
      setHistoricalEmployeeChoices(Object.fromEntries(historical.map(row => [row.id, row.employee_id ?? ""])));
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
    return `${formatDate(period.start_date)} a ${formatDate(period.end_date)}`;
  }

  function formatHistoricalHours(minutesValue: number | null | undefined) {
    const minutes = Math.max(0, Math.round(Number(minutesValue ?? 0)));
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  const filteredHistoricalBaseRows = historicalBaseRows.filter(row => {
    const matchedEmployee = row.employee_id ? employees.find(employee => employee.id === row.employee_id) : null;
    const rowCompanyId = matchedEmployee?.company_id ?? null;
    return (!companyFilter || rowCompanyId === companyFilter) && (filterEmployee === "todos" || row.employee_id === filterEmployee) && (!selectedPeriod || row.period_id === selectedPeriod.id);
  });

  async function saveHistoricalEmployee(row: HistoricalBaseRow) {
    const employeeId = historicalEmployeeChoices[row.id];
    const employee = employees.find(item => item.id === employeeId);
    if (!employeeId || !employee) { setError("Selecione o funcionário correto para vincular este registro histórico."); return; }
    setSavingHistoricalId(row.id); setError("");
    const { error: updateError } = await (supabase as any).from("historical_kpi_data").update({ employee_id: employee.id, employee_name: employee.full_name }).eq("id", row.id);
    setSavingHistoricalId(null);
    if (updateError) { setError("Não foi possível corrigir o vínculo histórico: " + updateError.message); return; }
    await load();
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
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <Card className="mt-6 overflow-hidden">
        <div className="border-b p-4"><h2 className="font-semibold">Histórico importado da BASE</h2>
          <p className="mt-1 text-xs text-muted-foreground">Totais históricos por funcionário e competência. A BASE não guarda, nesses registros, cada data individual de atestado ou declaração; por isso, eles são exibidos separadamente e não viram lançamentos operacionais.</p>
          <p className="mt-1 text-xs text-muted-foreground">{filteredHistoricalBaseRows.length} registro(s) histórico(s)</p></div>
        <div className="max-h-[420px] overflow-auto"><table className="w-full text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr><th className="px-4 py-3">Nome na BASE</th><th className="px-4 py-3">Competência</th><th className="px-4 py-3">Atestados (h)</th><th className="px-4 py-3">Declarações (h)</th><th className="px-4 py-3">Corrigir funcionário</th><th className="px-4 py-3">Ação</th></tr></thead>
          <tbody className="divide-y">
            {filteredHistoricalBaseRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Nenhum total histórico da BASE encontrado para os filtros selecionados.</td></tr>}
            {filteredHistoricalBaseRows.map(row => <tr key={row.id} className="hover:bg-muted/25">
              <td className="px-4 py-3 font-medium">{row.employee_name || "Nome não identificado"}{row.registration ? <span className="block text-xs text-muted-foreground">Matrícula: {row.registration}</span> : null}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.period_start && row.period_end ? `${formatDate(row.period_start)} a ${formatDate(row.period_end)}` : `${row.reference_month}/${row.reference_year}`}</td>
              <td className="px-4 py-3">{formatHistoricalHours(row.certificate_minutes)}</td><td className="px-4 py-3">{formatHistoricalHours(row.declaration_minutes)}</td>
              <td className="min-w-[220px] px-4 py-3"><select value={historicalEmployeeChoices[row.id] ?? ""} onChange={e => setHistoricalEmployeeChoices(current => ({ ...current, [row.id]: e.target.value }))} className="w-full rounded-lg border bg-background px-2 py-2"><option value="">Selecionar funcionário</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}</select></td>
              <td className="px-4 py-3"><button type="button" disabled={savingHistoricalId === row.id || !historicalEmployeeChoices[row.id]} onClick={() => void saveHistoricalEmployee(row)} className="whitespace-nowrap rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50">{savingHistoricalId === row.id ? "Salvando..." : "Salvar vínculo"}</button></td>
            </tr>)}
          </tbody></table></div>
      </Card>
      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Atestados</h2><p className="text-xs text-muted-foreground">{filteredRows.length} registro(s)</p></div><button type="button" onClick={() => setShowCertificates(v => !v)} className="rounded-md border p-2 hover:bg-muted" title={showCertificates ? "Ocultar atestados" : "Mostrar atestados"} aria-label={showCertificates ? "Ocultar atestados" : "Mostrar atestados"}>{showCertificates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
        {showCertificates && <div className="max-h-[calc(100vh-300px)] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr>
          <th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Início</th><th className="px-5 py-3">Fim</th><th className="px-5 py-3">Dias</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">CID</th><th className="px-5 py-3 text-right">Ações</th>
        </tr></thead><tbody className="divide-y">
          {filteredRows.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nenhum atestado encontrado para os filtros selecionados.</td></tr>}
          {filteredRows.map(r => <tr key={r.id} className="transition-colors hover:bg-muted/25"><td className="px-5 py-4 font-medium">{r.employees?.full_name ?? "—"}</td><td className="px-5 py-4">{formatDate(r.start_date)}</td><td className="px-5 py-4">{formatDate(r.end_date)}</td><td className="px-5 py-4">{displayedDays(r)}</td><td className="px-5 py-4">{r.certificate_type}</td><td className="px-5 py-4">{r.cid ?? "—"}</td><td className="px-5 py-4 text-right"><button onClick={() => void startEdit(r)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove(r)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td></tr>)}
        </tbody></table></div>}
      </Card>
      <Card className="mt-6 overflow-hidden"><div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Declarações</h2><p className="text-xs text-muted-foreground">{filteredDeclarations.length} registro(s)</p></div><button type="button" onClick={() => setShowDeclarations(v => !v)} className="rounded-md border p-2 hover:bg-muted" title={showDeclarations ? "Ocultar declarações" : "Mostrar declarações"} aria-label={showDeclarations ? "Ocultar declarações" : "Mostrar declarações"}>{showDeclarations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>{showDeclarations && <div className="max-h-[calc(100vh-300px)] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Horas abonadas</th><th className="px-5 py-3">Observação</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">{filteredDeclarations.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Nenhuma declaração encontrada para os filtros selecionados.</td></tr>}{filteredDeclarations.map(d => <tr key={d.id} className="transition-colors hover:bg-muted/25"><td className="px-5 py-4 font-medium">{d.employees?.full_name ?? "—"}</td><td className="px-5 py-4">{formatDate(d.occurrence_date)}</td><td className="px-5 py-4">{String(Math.floor(Number(d.quantity) || 0)).padStart(2,"0")}:{String(Math.round(((Number(d.quantity)||0)%1)*60)).padStart(2,"0")}</td><td className="px-5 py-4">{d.notes ?? "—"}</td><td className="px-5 py-4 text-right"><button onClick={() => startEditDeclaration(d)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button onClick={() => void removeDeclaration(d)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>}</Card>
    </main>
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
