import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Power, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/jornadas-escalas")({ component: Schedules });

function Schedules() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", weekly: "44", divisor: "220" });
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const { data, error } = await (supabase as any).from("work_schedules").select("id,name,weekly_minutes,divisor,active").order("name");
    if (error) setError(error.message); else setRows(data ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function save() {
    const name = form.name.trim();
    const weeklyHours = Number(form.weekly.replace(",", "."));
    const divisor = Number(form.divisor.replace(",", "."));
    if (!name || weeklyHours <= 0 || divisor <= 0) {
      setError("Informe nome, carga semanal e divisor válidos.");
      return;
    }
    setSaving(true); setError("");
    const { error } = await (supabase as any).from("work_schedules").insert({
      name, weekly_minutes: Math.round(weeklyHours * 60), divisor, active: true,
    });
    if (error) {
      setError(error.code === "23505" ? "Já existe uma jornada com esse nome." : error.message);
      setSaving(false); return;
    }
    setForm({ name: "", weekly: "44", divisor: "220" }); setOpen(false); setSaving(false); await load();
  }

  async function toggle(row: any) {
    setError("");
    const { error } = await (supabase as any).from("work_schedules").update({ active: !row.active }).eq("id", row.id);
    if (error) setError(error.message); else await load();
  }

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] justify-between">
      <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</Link><b>DP Success · Cadastros</b>
    </div></header>
    <main className="mx-auto max-w-[1500px] px-6 py-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-medium text-primary">Cadastro base</p><h1 className="text-3xl font-bold">Jornadas / Escalas</h1><p className="mt-1 text-sm text-muted-foreground">Cadastre jornadas, carga semanal e divisor.</p></div>
        <button type="button" onClick={() => { setError(""); setOpen(true); }} className="rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground"><Plus className="mr-2 inline h-4 w-4" /> Nova jornada</button>
      </div>
      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <Card className="mt-6 overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Jornada</th><th className="px-5 py-3">Carga semanal</th><th className="px-5 py-3">Divisor</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Ação</th></tr></thead><tbody className="divide-y">
        {rows.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Nenhuma jornada cadastrada.</td></tr> : rows.map((row) => <tr key={row.id}><td className="px-5 py-4 font-medium">{row.name}</td><td className="px-5 py-4">{Math.floor((row.weekly_minutes || 0) / 60)}h</td><td className="px-5 py-4">{row.divisor}h</td><td className="px-5 py-4">{row.active === false ? "Inativa" : "Ativa"}</td><td className="px-5 py-4"><button type="button" onClick={() => void toggle(row)} className="text-primary"><Power className="mr-1 inline h-4 w-4" />{row.active === false ? "Ativar" : "Inativar"}</button></td></tr>)}
      </tbody></table></Card>
    </main>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-md p-6">
      <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Nova jornada</h2><p className="text-xs text-muted-foreground">O cadastro será salvo no banco.</p></div><button type="button" onClick={() => setOpen(false)}><X className="h-5 w-5" /></button></div>
      <div className="mt-5 grid gap-3">
        <label className="grid gap-1 text-sm font-medium">Nome<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border px-3 py-2 font-normal" placeholder="Ex.: Administrativo 44h" /></label>
        <label className="grid gap-1 text-sm font-medium">Horas semanais<input type="number" min="1" step="0.01" value={form.weekly} onChange={(e) => setForm({ ...form, weekly: e.target.value })} className="rounded-lg border px-3 py-2 font-normal" /></label>
        <label className="grid gap-1 text-sm font-medium">Divisor mensal<input type="number" min="1" step="0.01" value={form.divisor} onChange={(e) => setForm({ ...form, divisor: e.target.value })} className="rounded-lg border px-3 py-2 font-normal" /></label>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{saving ? "Salvando..." : "Salvar jornada"}</button></div>
    </Card></div>}
  </div>;
}