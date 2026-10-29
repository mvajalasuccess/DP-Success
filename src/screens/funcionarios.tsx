import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Search, UserRound, BriefcaseBusiness, WalletCards, Pencil, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

import { ScreenBrand } from "@/components/screen-brand";
export function Employees() {
  const [employees, setEmployees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "ativo" | "inativo">("ativo");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; role: string; department: string; salary: string; birth_date: string; gender: string; pension_amount: "sim" | "nao"; admission: string; termination: string; bank: string; work_schedule_id: string; status: "ativo" | "inativo"; company_id: string }>({ name: "", role: "", department: "", salary: "", birth_date: "", gender: "", pension_amount: "nao", admission: "", termination: "", bank: "", work_schedule_id: "", status: "ativo", company_id: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const formatSalary = (value: string | number) => {
    const parsed = typeof value === "number" ? value : parseSalary(value);
    if (!Number.isFinite(parsed)) return "";
    return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parsed);
  };
  const parseSalary = (value: string) => {
    const cleaned = value.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
    if (!cleaned) return 0;
    const normalized = cleaned.includes(",")
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/\./g, "");
    return Number(normalized);
  };

  async function loadEmployees() {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("employees")
      .select("id,full_name,birth_date,gender,pension_amount,status,hire_date,termination_date,department_id,position_id,work_schedule_id,salary,company_id,companies(name),departments(name),positions(name),work_schedules(name)")
      .order("full_name");
    if (error) setError(error.message);
    else setEmployees(data ?? []);
    setLoading(false);
  }

  async function loadFormOptions() {
    const [dep, pos, schedule, company] = await Promise.all([
      (supabase).from("departments").select("id,name").eq("active", true).order("name"),
      (supabase).from("positions").select("id,name").eq("active", true).order("name"),
      (supabase).from("work_schedules").select("id,name").eq("active", true).order("name"),
      (supabase as any).from("companies").select("id,name").order("name"),
    ]);
    if (dep.error || pos.error || schedule.error || company.error) {
      setError(dep.error?.message || pos.error?.message || schedule.error?.message || company.error?.message || "Não foi possível carregar as opções do cadastro.");
      return;
    }
    setDepartments(dep.data ?? []);
    setPositions(pos.data ?? []);
    setSchedules(schedule.data ?? []);
    setCompanies(company.data ?? []);
  }

  useEffect(() => {
    void loadEmployees();
    void loadFormOptions();
  }, []);

  function openNew() {
    setError("");
    setEditingId(null);
    setForm({ name: "", role: "", department: "", salary: "", birth_date: "", gender: "", pension_amount: "nao", admission: "", termination: "", bank: "", work_schedule_id: "", status: "ativo", company_id: "" });
    setOpen(true);
  }

  function openEdit(employee: any) {
    setError("");
    setEditingId(employee.id);
    setForm({
      name: employee.full_name ?? "",
      role: employee.position_id ?? "",
      department: employee.department_id ?? "",
      salary: employee.salary != null ? formatSalary(Number(employee.salary)) : "",
      birth_date: employee.birth_date ?? "",
      gender: employee.gender ?? "",
      pension_amount: Number(employee.pension_amount ?? 0) > 0 ? "sim" : "nao",
      admission: employee.hire_date ?? "",
      termination: employee.termination_date ?? "",
      bank: "",
      status: employee.status ?? "ativo",
      work_schedule_id: employee.work_schedule_id ?? "",
      company_id: employee.company_id ?? "",
    });
    setOpen(true);
  }

  async function saveEmployee() {
    if (!form.name.trim() || !form.role || !form.department || !form.admission) {
      setError("Preencha nome, cargo, departamento e data de admissão.");
      return;
    }
    if (form.status === "inativo" && !form.termination) {
      setError("Informe a data de desligamento para um funcionário inativo.");
      return;
    }
    if (form.termination && form.termination < form.admission) {
      setError("A data de desligamento não pode ser anterior à data de admissão.");
      return;
    }
    setSaving(true);
    setError("");

    if (editingId) {
      const result = await (supabase as any).from("employees").update({
        full_name: form.name.trim(),
        birth_date: form.birth_date || null,
        gender: form.gender || null,
        pension_amount: form.pension_amount === "sim" ? 1 : 0,
        department_id: form.department,
        position_id: form.role,
        hire_date: form.admission,
        termination_date: form.status === "inativo" ? form.termination || null : null,
        status: form.status,
        work_schedule_id: form.work_schedule_id || null,
        company_id: form.company_id || null,
        salary: parseSalary(form.salary),
      }).eq("id", editingId);
      if (result.error) {
        setError(result.error.message);
        setSaving(false);
        return;
      }
      setOpen(false);
      setSaving(false);
      setEditingId(null);
      await loadEmployees();
      return;
    }

    const salary = parseSalary(form.salary);
    const match = form.bank.trim().match(/^([+-])?(\d{1,3}):(\d{2})$/);
    const bankMinutes = match
      ? Number(match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3]))
      : 0;

    if (!salary || salary < 0) {
      setError("Informe um salário válido.");
      setSaving(false);
      return;
    }

    const emp = await (supabase as any).from("employees").insert({
      full_name: form.name.trim(),
      birth_date: form.birth_date || null,
      gender: form.gender || null,
      pension_amount: form.pension_amount === "sim" ? 1 : 0,
      department_id: form.department,
      position_id: form.role,
      hire_date: form.admission,
      termination_date: form.status === "inativo" ? form.termination || null : null,
      status: form.status,
      work_schedule_id: form.work_schedule_id || null,
      company_id: form.company_id || null,
      salary,
    }).select("id").single();

    if (emp.error) {
      setError(emp.error.code === "23505" ? "Já existe um funcionário com esse cadastro." : emp.error.message);
      setSaving(false);
      return;
    }

    if (bankMinutes !== 0) {
      const bank = await supabase.from("bank_hours").insert({
        employee_id: emp.data.id,
        entry_date: form.admission,
        kind: bankMinutes > 0 ? "credito" : "debito",
        minutes: Math.abs(bankMinutes),
        previous_balance_minutes: 0,
        balance_minutes: bankMinutes,
        justification: "Saldo inicial do cadastro",
      });
      if (bank.error) setError("Funcionário criado, mas o saldo inicial não pôde ser lançado: " + bank.error.message);
    }

    setForm({ name: "", role: "", department: "", salary: "", birth_date: "", gender: "", pension_amount: "nao", admission: "", termination: "", bank: "", work_schedule_id: "", status: "ativo", company_id: "" });
    setOpen(false);
    setSaving(false);
    await loadEmployees();
  }

  async function deactivateEmployee(employee: any) {
    const date = window.prompt("Data de desligamento:", employee.termination_date ?? new Date().toISOString().slice(0, 10));
    if (!date) return;
    setError("");
    setActionLoading(employee.id);
    const result = await (supabase as any).from("employees").update({ status: "inativo", termination_date: date }).eq("id", employee.id);
    setActionLoading(null);
    if (result.error) setError(result.error.message);
    else await loadEmployees();
  }

  async function deleteEmployee(employee: any) {
    const confirmed = window.confirm("Excluir definitivamente o cadastro de " + employee.full_name + "?\n\nUse Desligar quando houver histórico que precise ser preservado.");
    if (!confirmed) return;
    setError("");
    setActionLoading(employee.id);
    const result = await (supabase as any).from("employees").delete().eq("id", employee.id);
    setActionLoading(null);
    if (result.error) {
      setError('Não foi possível excluir. Se houver histórico, use "Desligar". Detalhe: ' + result.error.message);
      return;
    }
    await loadEmployees();
  }

  const filtered = employees.filter((e) => {
    const matchesSearch = e.full_name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "todos" || e.status === statusFilter;
    const matchesCompany = !companyFilter || e.company_id === companyFilter;
    return matchesSearch && matchesStatus && matchesCompany;
  });
  return (
    <div className="dp-screen min-h-screen bg-background">
      <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</a>
          <ScreenBrand name="Funcionários" />
        </div>
      </header>

      <main className="dp-screen-content mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
        <div className="relative isolate mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 flex flex-col justify-between gap-4 md:flex-row md:items-end [&_p]:!text-white/75 [&_h1]:!text-white">
          <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Cadastro base</p><h1 className="mt-1 text-3xl font-bold">Funcionários</h1><p className="mt-1 text-sm text-muted-foreground">Gerencie os colaboradores, vínculos e status do quadro de funcionários.</p></div>
          <button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4" /> Novo funcionário</button>
        </div>

        {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {([
            ["Funcionários ativos", String(employees.filter((e) => e.status === "ativo").length), UserRound],
            ["Funcionários cadastrados", String(employees.length), BriefcaseBusiness],
            ["Cadastros ativos", String(employees.filter((e) => e.status === "ativo").length), WalletCards],
          ] as [string, string, typeof UserRound][]).map(([label, value, Icon]) => (
            <Card key={label} className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></div></Card>
          ))}
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div><h2 className="font-display font-bold">Lista de funcionários</h2><p className="text-xs text-muted-foreground">Funcionários cadastrados</p></div>
            <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto"><div className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 sm:w-72"><Search className="h-4 w-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar funcionário..." /></div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "todos" | "ativo" | "inativo")} className="rounded-lg border bg-background px-3 py-2 text-sm outline-none"><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="todos">Todos</option></select><select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm outline-none"><option value="">Todas as empresas</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          <div className="max-h-[calc(100vh-250px)] overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr>
                <th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Cargo</th><th className="px-5 py-3">Departamento</th><th className="px-5 py-3">Admissão</th><th className="px-5 py-3">Desligamento</th><th className="px-5 py-3">Status</th><th className="px-5 py-3 text-right">Ações</th>
              </tr></thead>
              <tbody className="divide-y">
                {loading ? <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">Carregando...</td></tr> :
                filtered.length === 0 ? <tr><td colSpan={8} className="px-5 py-8 text-center text-muted-foreground">Nenhum funcionário encontrado.</td></tr> :
                filtered.map((e) => <tr key={e.id} className="transition-colors hover:bg-muted/25">
                  <td className="px-5 py-4 font-medium">{e.full_name}</td>
                  <td className="px-5 py-4 text-muted-foreground">{e.companies?.name ?? "—"}</td>
                  <td className="px-5 py-4 text-muted-foreground">{e.positions?.name ?? "—"}</td>
                  <td className="px-5 py-4 text-muted-foreground">{e.departments?.name ?? "—"}</td>
                  <td className="px-5 py-4">{e.hire_date ? new Date(e.hire_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-5 py-4">{e.termination_date ? new Date(e.termination_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${e.status === "ativo" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{e.status === "ativo" ? "Ativo" : "Inativo"}</span></td>
                  <td className="px-5 py-4"><div className="flex justify-end gap-2">
                    <button type="button" disabled={actionLoading===e.id} onClick={()=>openEdit(e)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50"><Pencil className="h-3.5 w-3.5"/>Editar</button>
                    {e.status==="ativo" && <button type="button" disabled={actionLoading===e.id} onClick={()=>void deactivateEmployee(e)} className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-50">Desligar</button>}
                    <button type="button" disabled={actionLoading===e.id} onClick={()=>void deleteEmployee(e)} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5"/>Excluir</button>
                  </div></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <Card className="w-full max-w-4xl p-7">
          <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{editingId ? "Editar funcionário" : "Novo funcionário"}</h2><p className="text-sm text-muted-foreground">Selecione os cadastros já existentes e salve o funcionário.</p></div><button type="button" onClick={() => setOpen(false)} className="text-muted-foreground"><X className="h-5 w-5" /></button></div>

          <div className="mt-7 grid gap-y-7 gap-x-10 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium md:col-span-2">Nome completo<input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="Nome completo" /></label>
            <label className="grid min-w-0 gap-1 text-sm font-medium">Empresa<select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })} className="h-10 w-full min-w-0 max-w-full rounded-lg border bg-background px-3 py-2 font-normal text-ellipsis"><option value="">Sem empresa vinculada</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Cargo<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecione o cargo</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Departamento<select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecione o departamento</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-medium">Salário (R$)<input type="text" inputMode="decimal" value={form.salary} onChange={(e) => setForm({ ...form, salary: e.target.value })} onBlur={() => setForm((current) => ({ ...current, salary: current.salary.trim() ? formatSalary(current.salary) : "" }))} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="3.000,00" /></label>
            <label className="grid gap-1 text-sm font-medium">Data de nascimento<input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">Sexo<select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecione o sexo</option><option value="feminino">Feminino</option><option value="masculino">Masculino</option><option value="outro">Outro</option></select></label>
            <label className="grid gap-1 text-sm font-medium">Paga pensão?<select value={form.pension_amount} onChange={(e) => setForm({ ...form, pension_amount: e.target.value === "sim" ? "sim" : "nao" })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="nao">Não</option><option value="sim">Sim</option></select></label>
            <label className="grid gap-1 text-sm font-medium">Data de admissão<input type="date" value={form.admission} onChange={(e) => setForm({ ...form, admission: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" /></label>
            <label className="grid gap-1 text-sm font-medium">Situação<select value={form.status} onChange={(e) => { const status = e.target.value === "inativo" ? "inativo" : "ativo"; setForm({ ...form, status, termination: status === "ativo" ? "" : form.termination }); }} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="ativo">Ativo</option><option value="inativo">Inativo</option></select></label>
            <label className="grid gap-1 text-sm font-medium">Data de desligamento<input type="date" value={form.termination} onChange={(e) => setForm({ ...form, termination: e.target.value })} disabled={form.status !== "inativo"} className="rounded-lg border bg-background px-3 py-2 font-normal disabled:bg-muted disabled:text-muted-foreground" /></label>
            {!editingId && <label className="grid gap-1 text-sm font-medium">Saldo inicial<input value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="+12:35 ou -03:20" /></label>}
            <label className="grid gap-1 text-sm font-medium md:col-span-2">Jornada / escala<select value={form.work_schedule_id} onChange={(e) => setForm({ ...form, work_schedule_id: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecionar jornada</option>{schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          </div>

          {error && <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

          <div className="mt-7 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={saving} onClick={() => void saveEmployee()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar funcionário"}</button></div>
        </Card>
      </div>}
    </div>
  );
}
