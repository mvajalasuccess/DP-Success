import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Search, UserRound, BriefcaseBusiness, WalletCards, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function Employees() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", role: "", department: "", salary: "", admission: "", bank: "", work_schedule_id: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadEmployees() {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("id,full_name,status,departments(name),positions(name),work_schedules(name)")
      .order("full_name");
    if (error) setError(error.message);
    else setEmployees(data ?? []);
    setLoading(false);
  }

  async function loadFormOptions() {
    const [dep, pos, schedule] = await Promise.all([
      (supabase).from("departments").select("id,name").eq("active", true).order("name"),
      (supabase).from("positions").select("id,name").eq("active", true).order("name"),
      (supabase).from("work_schedules").select("id,name").eq("active", true).order("name"),
    ]);
    if (dep.error || pos.error || schedule.error) {
      setError(dep.error?.message || pos.error?.message || schedule.error?.message || "Não foi possível carregar as opções do cadastro.");
      return;
    }
    setDepartments(dep.data ?? []);
    setPositions(pos.data ?? []);
    setSchedules(schedule.data ?? []);
  }

  useEffect(() => {
    void loadEmployees();
    void loadFormOptions();
  }, []);

  function openNew() {
    setError("");
    setForm({ name: "", role: "", department: "", salary: "", admission: "", bank: "", work_schedule_id: "" });
    setOpen(true);
  }

  async function createEmployee() {
    const salary = Number(form.salary.replace(",", "."));
    const match = form.bank.trim().match(/^([+-])?(\d{1,3}):(\d{2})$/);
    const bankMinutes = match
      ? Number(match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
      : 0;

    if (!form.name.trim() || !form.role || !form.department || !salary || salary < 0 || !form.admission) {
      setError("Preencha nome, cargo, departamento, salário e data de admissão.");
      return;
    }

    setSaving(true);
    setError("");

    const emp = await supabase
      .from("employees")
      .insert({
        full_name: form.name.trim(),
        department_id: form.department,
        position_id: form.role,
        hire_date: form.admission,
        status: "ativo",
        work_schedule_id: form.work_schedule_id || null,
      })
      .select("id")
      .single();

    if (emp.error) {
      setError(emp.error.code === "23505" ? "Já existe um funcionário com esse cadastro." : emp.error.message);
      setSaving(false);
      return;
    }

    if (bankMinutes !== 0) {
      const kind = bankMinutes > 0 ? "credito" : "debito";
      const bank = await supabase.from("bank_hours").insert({
        employee_id: emp.data.id,
        entry_date: form.admission,
        kind,
        minutes: Math.abs(bankMinutes),
        previous_balance_minutes: 0,
        balance_minutes: bankMinutes,
        justification: "Saldo inicial do cadastro",
      });
      if (bank.error) {
        setError("Funcionário criado, mas o saldo inicial não pôde ser lançado: " + bank.error.message);
      }
    }

    setForm({ name: "", role: "", department: "", salary: "", admission: "", bank: "", work_schedule_id: "" });
    setOpen(false);
    setSaving(false);
    await loadEmployees();
  }

  const filtered = employees.filter((e) => e.full_name.toLowerCase().includes(search.toLowerCase()));
  const money = (v: number | undefined) => v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const mins = (v: number) => {
    const s = v < 0 ? "-" : "+";
    const a = Math.abs(v);
    return `${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar ao dashboard</a>
          <div className="text-sm font-semibold">DP Success · Cadastros</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="text-sm font-medium text-primary">Cadastro base</p><h1 className="mt-1 text-3xl font-bold">Funcionários</h1><p className="mt-1 text-sm text-muted-foreground">Cadastro conectado ao Supabase.</p></div>
          <button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> Novo funcionário</button>
        </div>

        {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            ["Funcionários ativos", String(employees.filter((e) => e.status === "ativo").length), UserRound],
            ["Funcionários cadastrados", String(employees.length), BriefcaseBusiness],
            ["Banco inicial lançado", employees.length ? `${Math.round(employees.filter(() => false).length / employees.length * 100)}%` : "0%", WalletCards],
          ].map(([label, value, Icon]) => (
            <Card key={label as string} className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></div></Card>
          ))}
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div><h2 className="font-display font-bold">Lista de funcionários</h2><p className="text-xs text-muted-foreground">Dados vindos do banco</p></div>
            <div className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 md:w-72"><Search className="h-4 w-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar funcionário..." /></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Cargo</th><th className="px-5 py-3">Departamento</th><th className="px-5 py-3">Salário</th><th className="px-5 py-3">Saldo inicial</th><th className="px-5 py-3">Status</th></tr></thead>
              <tbody className="divide-y">
                {loading ? <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Carregando...</td></tr> : filtered.length === 0 ? <tr><td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Nenhum funcionário encontrado.</td></tr> : filtered.map((e) => <tr key={e.id}><td className="px-5 py-4 font-medium">{e.full_name}</td><td className="px-5 py-4 text-muted-foreground">{e.positions?.name ?? "—"}</td><td className="px-5 py-4 text-muted-foreground">{e.departments?.name ?? "—"}</td><td className="px-5 py-4">—</td><td className="px-5 py-4">—</td><td className="px-5 py-4"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{e.status === "ativo" ? "Ativo" : "Inativo"}</span></td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <Card className="w-full max-w-2xl p-6">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Novo funcionário</h2><p className="text-sm text-muted-foreground">Selecione os cadastros já existentes e salve o funcionário.</p></div><button type="button" onClick={() => setOpen(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button></div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium md:col-span-2">Nome completo<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="Nome completo" /></label>
            <label className="grid gap-1 text-sm font-medium">Cargo<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecione o cargo</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Departamento<select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecione o departamento</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Salário<input type="number" min="0" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="3000,00" /></label>
            <label className="grid gap-1 text-sm font-medium">Data de admissão<input type="date" value={form.admission} onChange={(e) => setForm({ ...form, admission: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">Saldo inicial<input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="+12:35 ou -03:20" /></label>
            <label className="grid gap-1 text-sm font-medium md:col-span-2">Jornada / escala<select value={form.work_schedule_id} onChange={(e) => setForm({ ...form, work_schedule_id: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecionar jornada</option>{schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          </div>

          {error && <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={saving} onClick={() => void createEmployee()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Salvando..." : "Salvar funcionário"}</button></div>
        </Card>
      </div>}
    </div>
  );
}
