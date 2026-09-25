import { ArrowLeft, Plus, Search, Clock3, Moon, CalendarDays, ArrowDownUp, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const calculationRules: Record<string, { code: string; label: string }> = {
  "Hora extra 60%": { code: "HE_60", label: "HE 60%" },
  "Hora extra noturna": { code: "HE_NOTURNA", label: "HE noturna (60% + 20%)" },
  "Adicional noturno 20%": { code: "ADICIONAL_NOTURNO", label: "Adicional noturno" },
  "Domingo / feriado 100%": { code: "DOMINGO_FERIADO", label: "Domingo / feriado" },
  "Interjornada 50%": { code: "INTERJORNADA", label: "Interjornada" },
  "Crédito / débito": { code: "CREDITO", label: "Crédito / débito" },
};
const types = [
  { label: "Hora extra 60%", icon: Clock3 }, { label: "Hora extra noturna", icon: Moon },
  { label: "Adicional noturno 20%", icon: Moon }, { label: "Domingo / feriado 100%", icon: CalendarDays },
  { label: "Interjornada 50%", icon: ArrowDownUp }, { label: "Crédito / débito", icon: ArrowDownUp },
];
type Employee = { id: string; full_name: string };
type Launch = { id: string; source: "overtime" | "bank"; employee_id: string; launch_date: string; type: string; direction: "CREDITO" | "DEBITO"; minutes: number; description: string | null; employee?: { full_name?: string } | null };

function periodDates(period: any) {
  const end = new Date(period.reference_year, period.reference_month - 1, 20);
  const start = new Date(period.reference_year, period.reference_month - 2, 21);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}
function labelForType(type: string) {
  return Object.values(calculationRules).find(r => r.code === type)?.label ?? type;
}

export function Launches() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Launch | null>(null);
  const [selectedType, setSelectedType] = useState("Hora extra 60%");
  const [hours, setHours] = useState("02:30");
  const [direction, setDirection] = useState<"CREDITO" | "DEBITO">("CREDITO");
  const [employeeId, setEmployeeId] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [competence, setCompetence] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [h, m] = hours.split(":").map(Number);
  const minutes = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);

  async function loadData() {
    setLoading(true); setError("");
    const [empRes, periodRes] = await Promise.all([
      supabase.from("employees").select("id,full_name").eq("status", "ativo").order("full_name"),
      supabase.from("time_periods").select("id,reference_year,reference_month,status").order("reference_year", { ascending: false }).order("reference_month", { ascending: false }).limit(1),
    ]);
    if (empRes.error) { setError(empRes.error.message); setLoading(false); return; }
    if (periodRes.error) { setError(periodRes.error.message); setLoading(false); return; }
    const period = periodRes.data?.[0] ?? null;
    setEmployees(empRes.data ?? []); setCompetence(period);
    if (!period) { setLaunches([]); setLoading(false); return; }

    const [otRes, bankRes] = await Promise.all([
      supabase.from("overtime_records").select("id,employee_id,reference_date,minutes,notes").eq("period_id", period.id).order("reference_date", { ascending: false }),
      supabase.from("bank_hours").select("id,employee_id,entry_date,kind,minutes,justification").eq("period_id", period.id).order("entry_date", { ascending: false }),
    ]);
    if (otRes.error) { setError(otRes.error.message); setLoading(false); return; }
    if (bankRes.error) { setError(bankRes.error.message); setLoading(false); return; }
    const names = new Map((empRes.data ?? []).map((e: any) => [e.id, e.full_name]));
    const overtime = (otRes.data ?? []).map((r: any): Launch => ({ id: r.id, source: "overtime", employee_id: r.employee_id, launch_date: r.reference_date, type: "HE_60", direction: "CREDITO", minutes: Number(r.minutes || 0), description: r.notes, employee: { full_name: names.get(r.employee_id) } }));
    const bank = (bankRes.data ?? []).map((r: any): Launch => ({ id: r.id, source: "bank", employee_id: r.employee_id, launch_date: r.entry_date, type: "CREDITO", direction: r.kind === "debito" ? "DEBITO" : "CREDITO", minutes: Number(r.minutes || 0), description: r.justification, employee: { full_name: names.get(r.employee_id) } }));
    setLaunches([...overtime, ...bank].sort((a, b) => b.launch_date.localeCompare(a.launch_date)));
    if (!launchDate) setLaunchDate(periodDates(period).end);
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);

  function openNew() {
    setEditing(null); setEmployeeId(""); setSelectedType("Hora extra 60%"); setDirection("CREDITO"); setHours("02:30"); setDescription("");
    if (competence) setLaunchDate(periodDates(competence).end);
    setOpen(true);
  }
  function openEdit(row: Launch) {
    setEditing(row); setEmployeeId(row.employee_id); setDirection(row.direction);
    setHours(String(Math.floor(row.minutes / 60)).padStart(2, "0") + ":" + String(row.minutes % 60).padStart(2, "0"));
    setDescription(row.description ?? ""); setLaunchDate(row.launch_date);
    setSelectedType(row.type === "CREDITO" ? "Crédito / débito" : (Object.entries(calculationRules).find(([, v]) => v.code === row.type)?.[0] ?? "Hora extra 60%"));
    setOpen(true);
  }

  async function saveLaunch() {
    setSaving(true); setError("");
    if (!employeeId || !competence || minutes <= 0) { setError("Selecione o funcionário, a competência e informe as horas."); setSaving(false); return; }
    const range = periodDates(competence);
    if (launchDate < range.start || launchDate > range.end) { setError("A data precisa estar dentro da competência."); setSaving(false); return; }
    if (competence.status === "fechado") { setError("A competência está fechada e não aceita alterações."); setSaving(false); return; }

    const rule = calculationRules[selectedType] ?? calculationRules["Crédito / débito"];
    let result: any;
    if (editing?.source === "overtime" && rule.code !== "CREDITO") {
      result = await supabase.from("overtime_records").update({ employee_id: employeeId, reference_date: launchDate, minutes, notes: description.trim() || null }).eq("id", editing.id);
    } else if (editing?.source === "bank" && rule.code === "CREDITO") {
      result = await supabase.from("bank_hours").update({ employee_id: employeeId, entry_date: launchDate, kind: direction === "DEBITO" ? "debito" : "credito", minutes, justification: description.trim() || null }).eq("id", editing.id);
    } else {
      if (editing) {
        const del = editing.source === "overtime" ? await supabase.from("overtime_records").delete().eq("id", editing.id) : await supabase.from("bank_hours").delete().eq("id", editing.id);
        if (del.error) { setError(del.error.message); setSaving(false); return; }
      }
      result = rule.code === "CREDITO"
        ? await supabase.from("bank_hours").insert({ employee_id: employeeId, period_id: competence.id, entry_date: launchDate, kind: direction === "DEBITO" ? "debito" : "credito", minutes, previous_balance_minutes: 0, balance_minutes: direction === "DEBITO" ? -minutes : minutes, justification: description.trim() || null })
        : await supabase.from("overtime_records").insert({ employee_id: employeeId, period_id: competence.id, reference_date: launchDate, minutes, rate_percent: rule.code === "DOMINGO_FERIADO" ? 100 : rule.code === "INTERJORNADA" ? 50 : rule.code === "ADICIONAL_NOTURNO" ? 20 : 60, notes: rule.label + (description.trim() ? " · " + description.trim() : "") });
    }
    if (result?.error) setError(result.error.message); else { setOpen(false); await loadData(); }
    setSaving(false);
  }

  async function deleteLaunch(row: Launch) {
    if (!window.confirm("Excluir este lançamento?")) return;
    const result = row.source === "overtime" ? await supabase.from("overtime_records").delete().eq("id", row.id) : await supabase.from("bank_hours").delete().eq("id", row.id);
    if (result.error) setError(result.error.message); else await loadData();
  }

  const filtered = useMemo(() => launches.filter(l => (l.employee?.full_name ?? "").toLowerCase().includes(search.toLowerCase())), [launches, search]);
  const totalMinutes = launches.reduce((sum, item) => sum + (item.direction === "DEBITO" ? -item.minutes : item.minutes), 0);
  const fmt = (v: number) => { const sign = v < 0 ? "-" : "+"; const a = Math.abs(v); return sign + String(Math.floor(a / 60)).padStart(2, "0") + ":" + String(a % 60).padStart(2, "0"); };
  const date = (v: string) => new Date(v + "T12:00:00").toLocaleDateString("pt-BR");

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] items-center justify-between"><a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</a><span className="font-semibold">DP Success · Lançamentos</span></div></header>
    <main className="mx-auto max-w-[1500px] px-6 py-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-medium text-primary">Operação</p><h1 className="mt-1 text-3xl font-bold">Lançamentos</h1><p className="mt-1 text-sm text-muted-foreground">Registre créditos, débitos e adicionais vinculados à competência.</p></div><button onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> Novo lançamento</button></div>
      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{types.map(({ label, icon: Icon }) => <Card key={label} className="p-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div><span className="text-sm font-medium">{label}</span></div></Card>)}</div>
      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-display font-bold">Lançamentos da competência</h2><p className="text-xs text-muted-foreground">{competence ? (() => { const d = periodDates(competence); return date(d.start) + " → " + date(d.end); })() : "Nenhuma competência cadastrada"}</p></div><div className="flex items-center gap-2 rounded-lg border px-3 py-2 md:w-72"><Search className="h-4 w-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar funcionário..." /></div></div>
        <div className="grid grid-cols-2 border-b text-center text-sm"><div className="p-3"><p className="text-xs text-muted-foreground">Lançamentos</p><p className="font-bold">{loading ? "…" : filtered.length}</p></div><div className="border-l p-3"><p className="text-xs text-muted-foreground">Saldo dos lançamentos</p><p className={totalMinutes < 0 ? "font-bold text-destructive" : "font-bold text-primary"}>{fmt(totalMinutes)}</p></div></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Horas</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">{filtered.map(row => <tr key={row.source + row.id}><td className="px-5 py-4 font-medium">{row.employee?.full_name ?? "—"}</td><td className="px-5 py-4 text-muted-foreground">{date(row.launch_date)}</td><td className="px-5 py-4">{labelForType(row.type)}</td><td className={"px-5 py-4 font-bold " + (row.direction === "DEBITO" ? "text-destructive" : "text-primary")}>{fmt(row.direction === "DEBITO" ? -row.minutes : row.minutes)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={() => openEdit(row)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"><Pencil className="h-3 w-3" />Editar</button><button onClick={() => void deleteLaunch(row)} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive"><Trash2 className="h-3 w-3" />Excluir</button></div></td></tr>)}</tbody></table>{!loading && !filtered.length && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado.</div>}</div>
      </Card>
    </main>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-2xl p-6"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{editing ? "Editar lançamento" : "Novo lançamento"}</h2><p className="text-sm text-muted-foreground">{competence ? "Competência atual" : "Cadastre uma competência primeiro."}</p></div><button onClick={() => setOpen(false)} className="text-sm text-muted-foreground">Fechar</button></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Funcionário<select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecione...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Data<input type="date" value={launchDate} min={competence ? periodDates(competence).start : undefined} max={competence ? periodDates(competence).end : undefined} onChange={e => setLaunchDate(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal" /></label><label className="grid gap-1 text-sm font-medium">Tipo<select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal">{types.map(t => <option key={t.label}>{t.label}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Movimento<select value={direction} onChange={e => setDirection(e.target.value as "CREDITO" | "DEBITO")} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option></select></label><label className="grid gap-1 text-sm font-medium md:col-span-2">Horas<input value={hours} onChange={e => setHours(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="02:30" /></label><label className="grid gap-1 text-sm font-medium md:col-span-2">Observação<input value={description} onChange={e => setDescription(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal" /></label></div>
      <div className="mt-5 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving || !competence} onClick={() => void saveLaunch()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Salvando..." : "Salvar lançamento"}</button></div></Card></div>}
  </div>;
}
