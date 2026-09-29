import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Employee = { id: string; full_name: string };
type OccType = { id: string; code: string; name: string; unit: string; requires_justification: boolean; affects_balance: boolean };
type Occ = { id: string; employee_id: string; occurrence_type_id: string; period_id: string | null; occurrence_date: string; end_date: string | null; quantity: number | null; unit: string; justification: string | null; notes: string | null; employees?: { full_name: string } | null; occurrence_types?: { name: string; code: string } | null };

const emptyForm = { employee_id: "", occurrence_type_id: "", occurrence_date: "", end_date: "", quantity: "", justification: "", notes: "" };

export function Ocorrencias() {
  const [rows, setRows] = useState<Occ[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [types, setTypes] = useState<OccType[]>([]);
  const [periods, setPeriods] = useState<{ id: string; start_date: string; end_date: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Occ | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");
    const { data, error } = await supabase.from("occurrences")
      .select("id,employee_id,occurrence_type_id,period_id,occurrence_date,end_date,quantity,unit,justification,notes,employees(full_name),occurrence_types(name,code)")
      .order("occurrence_date", { ascending: false });
    if (error) setError(error.message); else setRows((data ?? []) as Occ[]);
  }

  async function loadOptions() {
    const [e, t, p] = await Promise.all([
      supabase.from("employees").select("id,full_name").eq("status", "ativo").order("full_name"),
      supabase.from("occurrence_types").select("id,code,name,unit,requires_justification,affects_balance").eq("active", true).order("name"),
      supabase.from("time_periods").select("id,start_date,end_date").order("start_date", { ascending: false }),
    ]);
    setEmployees((e.data ?? []) as Employee[]);
    setTypes((t.data ?? []) as OccType[]);
    setPeriods((p.data ?? []) as { id: string; start_date: string; end_date: string }[]);
  }

  useEffect(() => { void load(); void loadOptions(); }, []);

  function startNew() {
    setEditing(null);
    setForm({ ...emptyForm, occurrence_type_id: types.find(t => t.code === "atraso")?.id ?? types[0]?.id ?? "" });
    setError("");
    setOpen(true);
  }

  function startEdit(row: Occ) {
    setEditing(row);
    setForm({
      employee_id: row.employee_id, occurrence_type_id: row.occurrence_type_id,
      occurrence_date: row.occurrence_date, end_date: row.end_date ?? "",
      quantity: isDeclarationCode(row.occurrence_types?.code) ? decimalHoursToText(row.quantity) : (row.quantity == null ? "" : String(row.quantity)),
      justification: row.justification ?? "", notes: row.notes ?? "",
    });
    setError("");
    setOpen(true);
  }

  function isDeclarationCode(value?: string | null) { return value === "declaracao_horas"; }

  const selectedType = types.find(t => t.id === form.occurrence_type_id);
  const unit = selectedType?.unit || "horas";

  async function save() {
    setError("");
    if (!form.employee_id || !form.occurrence_type_id || !form.occurrence_date) {
      setError("Informe funcionário, tipo e data.");
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
    const payload = {
      employee_id: form.employee_id, occurrence_type_id: form.occurrence_type_id,
      period_id: period?.id ?? null, occurrence_date: form.occurrence_date,
      end_date: form.end_date || null, quantity: form.quantity === "" ? null : Number(form.quantity),
      unit, justification: form.justification.trim() || null, notes: form.notes.trim() || null,
    };
    const result = editing
      ? await supabase.from("occurrences").update(payload).eq("id", editing.id)
      : await supabase.from("occurrences").insert(payload);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    setOpen(false); setEditing(null); setForm(emptyForm); await load();
  }

  async function remove(row: Occ) {
    if (!window.confirm(`Excluir a ocorrência de ${row.employees?.full_name ?? "funcionário"}?`)) return;
    setError("");
    const { error } = await supabase.from("occurrences").delete().eq("id", row.id);
    if (error) setError(error.message); else await load();
  }

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] items-center justify-between"><a href="/" className="flex gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a><b>DP Success · Ocorrências</b></div></header>
    <main className="mx-auto max-w-[1500px] px-6 py-7">
      <div className="flex items-end justify-between gap-4"><div><p className="text-sm text-primary">Ponto</p><h1 className="text-3xl font-bold">Faltas e Ocorrências</h1><p className="text-sm text-muted-foreground">Faltas, atrasos, saídas antecipadas, abonos e demais ocorrências.</p></div><button onClick={startNew} className="rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground"><Plus className="mr-2 inline h-4 w-4" />Nova ocorrência</button></div>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <Card className="mt-6 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Quantidade</th><th className="px-5 py-3">Unidade</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">
        {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">Nenhuma ocorrência cadastrada.</td></tr>}
        {rows.map(r => <tr key={r.id}><td className="px-5 py-4 font-medium">{r.employees?.full_name ?? "—"}</td><td className="px-5 py-4">{r.occurrence_date}{r.end_date ? ` → ${r.end_date}` : ""}</td><td className="px-5 py-4">{r.occurrence_types?.name ?? "—"}</td><td className="px-5 py-4">{r.quantity ?? "—"}</td><td className="px-5 py-4">{r.unit}</td><td className="px-5 py-4 text-right"><button onClick={() => startEdit(r)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button onClick={() => void remove(r)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td></tr>)}
      </tbody></table></div></Card>
    </main>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-xl p-6"><h2 className="text-xl font-bold">{editing ? "Editar ocorrência" : "Nova ocorrência"}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2"><option value="">Funcionário</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select>
        <select value={form.occurrence_type_id} onChange={e => setForm({ ...form, occurrence_type_id: e.target.value, quantity: "" })} className="rounded-lg border px-3 py-2 md:col-span-2"><option value="">Tipo de ocorrência</option>{types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <input type="date" value={form.occurrence_date} onChange={e => setForm({ ...form, occurrence_date: e.target.value })} className="rounded-lg border px-3 py-2" />
        <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="rounded-lg border px-3 py-2" />
        <input type="number" min="0" step="0.01" placeholder={unit === "dias" ? "Quantidade de dias" : unit === "horas" ? "Quantidade de horas" : "Quantidade"} value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="rounded-lg border px-3 py-2" />
        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Unidade: <b>{unit}</b></div>
        <textarea placeholder="Justificativa" value={form.justification} onChange={e => setForm({ ...form, justification: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
        <textarea placeholder="Observações" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2" />
      </div>
      <div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{saving ? "Salvando..." : "Salvar"}</button></div>
    </Card></div>}
  </div>;
}
