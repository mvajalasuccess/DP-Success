import { Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Search, Clock3, Moon, CalendarDays, ArrowDownUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const calculationRules: Record<string, { code: string; factor: number; label: string }> = {
  "Hora extra 60%": { code: "HE_60", factor: 1.6, label: "HE 60%" },
  "Hora extra noturna": { code: "HE_NOTURNA", factor: 1.8, label: "HE noturna (60% + 20%)" },
  "Adicional noturno 20%": { code: "ADICIONAL_NOTURNO", factor: 0.2, label: "Adicional noturno" },
  "Domingo / feriado 100%": { code: "DOMINGO_FERIADO", factor: 2, label: "Domingo / feriado" },
  "Interjornada 50%": { code: "INTERJORNADA", factor: 1.5, label: "Interjornada" },
  "Crédito / débito": { code: "CREDITO", factor: 1, label: "Crédito / débito" },
};

const types = [
  { label: "Hora extra 60%", icon: Clock3 },
  { label: "Hora extra noturna", icon: Moon },
  { label: "Adicional noturno 20%", icon: Moon },
  { label: "Domingo / feriado 100%", icon: CalendarDays },
  { label: "Interjornada 50%", icon: ArrowDownUp },
  { label: "Crédito / débito", icon: ArrowDownUp },
];

type Employee = { id: string; full_name: string; salary?: number; divisor?: number; department?: { name?: string } | null };
type Launch = {
  id: string;
  launch_date: string;
  type: string;
  direction: "CREDITO" | "DEBITO";
  minutes: number;
  financial_value: number | null;
  description: string | null;
  employees?: { full_name?: string } | null;
};

export function Launches() {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState("Hora extra 60%");
  const [hours, setHours] = useState("02:30");
  const [direction, setDirection] = useState<"CREDITO" | "DEBITO">("CREDITO");
  const [employeeId, setEmployeeId] = useState("");
  const [launchDate, setLaunchDate] = useState("2026-09-20");
  const [description, setDescription] = useState("");
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [competence, setCompetence] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedEmployee = employees.find(e => e.id === employeeId);
  const hourlyRate = (selectedEmployee?.salary ?? 0) / (selectedEmployee?.divisor ?? 220);
  const [h, m] = hours.split(":").map(Number);
  const minutes = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  const rule = calculationRules[selectedType] ?? calculationRules["Crédito / débito"];
  const estimatedValue = (minutes / 60) * hourlyRate * rule.factor;

  async function loadData() {
    setLoading(true);
    setError("");
    const db = supabase;
    const [empRes, compRes] = await Promise.all([
      db.from("employees").select("id,full_name,department_id,work_schedule_id").eq("active", true).order("full_name"),
      db.from("competencies").select("id,name,start_date,end_date,status").order("end_date", { ascending: false }).limit(1),
    ]);

    if (empRes.error) {
      setError(empRes.error.message);
      setLoading(false);
      return;
    }

    const empRows = empRes.data ?? [];
    const salaryRows = await Promise.all(
      empRows.map(async (employee: any) => {
        const { data } = await db.from("salary_history")
          .select("salary,valid_from,valid_to")
          .eq("employee_id", employee.id)
          .order("valid_from", { ascending: false })
          .limit(1);
        const schedule = await db.from("work_schedules").select("divisor").eq("id", employee.work_schedule_id).maybeSingle();
        return { ...employee, salary: data?.[0]?.salary ?? 0, divisor: schedule.data?.divisor ?? 220 };
      }),
    );

    setEmployees(salaryRows);
    if (compRes.error) setError(compRes.error.message);
    const currentComp = compRes.data?.[0] ?? null;
    setCompetence(currentComp);

    if (currentComp) {
      const launchRes = await db.from("point_launches")
        .select("id,launch_date,type,direction,minutes,financial_value,description,employees(full_name)")
        .eq("competence_id", currentComp.id)
        .order("launch_date", { ascending: false });
      if (launchRes.error) setError(launchRes.error.message);
      setLaunches(launchRes.data ?? []);
      if (!launchDate || launchDate === "2026-09-20") setLaunchDate(currentComp.end_date);
    } else {
      setLaunches([]);
    }
    setLoading(false);
  }

  useEffect(() => { void loadData(); }, []);

  async function createLaunch() {
    setSaving(true);
    setError("");
    if (!employeeId || !competence || minutes <= 0) {
      setError("Selecione o funcionário, uma competência e informe as horas.");
      setSaving(false);
      return;
    }
    if (launchDate < competence.start_date || launchDate > competence.end_date) {
      setError("A data do lançamento precisa estar dentro da competência.");
      setSaving(false);
      return;
    }
    if (competence.status === "FECHADA") {
      setError("A competência está fechada e não aceita novos lançamentos.");
      setSaving(false);
      return;
    }

    const db = supabase;
    const payload = {
      employee_id: employeeId,
      competence_id: competence.id,
      launch_date: launchDate,
      type: rule.code,
      direction,
      minutes,
      rate_factor: rule.factor,
      description: description.trim() || null,
      source: "manual",
    };

    const launchRes = await db.from("point_launches").insert(payload).select("id").single();
    if (launchRes.error) {
      setError(launchRes.error.message);
      setSaving(false);
      return;
    }

    // O banco de horas é sincronizado pelo trigger do Supabase
    // a partir do lançamento, evitando duplicidade de movimentações.

    setOpen(false);
    setDescription("");
    setHours("02:30");
    setDirection("CREDITO");
    await loadData();
    setSaving(false);
  }

  const filtered = useMemo(
    () => launches.filter(l => (l.employees?.full_name ?? "").toLowerCase().includes(search.toLowerCase())),
    [launches, search],
  );
  const totalMinutes = launches.reduce((sum, item) => sum + (item.direction === "DEBITO" ? -item.minutes : item.minutes), 0);
  const formatMinutes = (value: number) => {
    const sign = value < 0 ? "-" : "+";
    const abs = Math.abs(value);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  };
  const formatDate = (value: string) => new Date(value + "T12:00:00").toLocaleDateString("pt-BR");
  const formatMoney = (value: number | null) => value == null ? "—" : value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/> Voltar</a>
        <span className="font-semibold">DP Success · Lançamentos</span>
      </div>
    </header>
    <main className="mx-auto max-w-[1500px] px-6 py-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="text-sm font-medium text-primary">Operação</p><h1 className="mt-1 text-3xl font-bold">Lançamentos</h1><p className="mt-1 text-sm text-muted-foreground">Registre créditos, débitos e adicionais vinculados à competência.</p></div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4"/> Novo lançamento</button>
      </div>

      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {types.map(({label, icon: Icon}) => <Card key={label} className="p-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4"/></div><span className="text-sm font-medium">{label}</span></div></Card>)}
      </div>

      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div><h2 className="font-display font-bold">Lançamentos da competência</h2><p className="text-xs text-muted-foreground">{competence ? `${formatDate(competence.start_date)} → ${formatDate(competence.end_date)}` : "Nenhuma competência cadastrada"}</p></div>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2 md:w-72"><Search className="h-4 w-4 text-muted-foreground"/><input value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar funcionário..." /></div>
        </div>
        <div className="grid grid-cols-2 border-b text-center text-sm"><div className="p-3"><p className="text-xs text-muted-foreground">Lançamentos</p><p className="font-bold">{loading ? "…" : filtered.length}</p></div><div className="border-l p-3"><p className="text-xs text-muted-foreground">Saldo dos lançamentos</p><p className={totalMinutes < 0 ? "font-bold text-destructive" : "font-bold text-primary"}>{formatMinutes(totalMinutes)}</p></div></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Horas</th><th className="px-5 py-3">Valor estimado</th></tr></thead>
          <tbody className="divide-y">{filtered.map(row => <tr key={row.id}><td className="px-5 py-4 font-medium">{row.employees?.full_name ?? "—"}</td><td className="px-5 py-4 text-muted-foreground">{formatDate(row.launch_date)}</td><td className="px-5 py-4">{({HE_60:"HE 60%",HE_NOTURNA:"HE noturna",ADICIONAL_NOTURNO:"Adicional noturno",DOMINGO_FERIADO:"Domingo / feriado",INTERJORNADA:"Interjornada",CREDITO:"Crédito / débito"} as Record<string,string>)[row.type] ?? row.type}</td><td className={`px-5 py-4 font-bold ${row.direction === "DEBITO" ? "text-destructive" : "text-primary"}`}>{formatMinutes(row.direction === "DEBITO" ? -row.minutes : row.minutes)}</td><td className="px-5 py-4">{formatMoney(row.financial_value)}</td></tr>)}</tbody>
          </table>
          {!loading && filtered.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento encontrado.</div>}
        </div>
      </Card>
    </main>

    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-2xl p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">Novo lançamento</h2><p className="text-sm text-muted-foreground">{competence ? `${competence.name} · ${formatDate(competence.start_date)} → ${formatDate(competence.end_date)}` : "Cadastre uma competência primeiro."}</p></div><button onClick={() => setOpen(false)} className="text-sm text-muted-foreground">Fechar</button></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Funcionário<select value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="">Selecione...</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium">Data<input type="date" value={launchDate} min={competence?.start_date} max={competence?.end_date} onChange={e => setLaunchDate(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal"/></label>
          <label className="grid gap-1 text-sm font-medium">Tipo<select value={selectedType} onChange={e => setSelectedType(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal">{types.map(t => <option key={t.label}>{t.label}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-medium">Movimento<select value={direction} onChange={e => setDirection(e.target.value as "CREDITO" | "DEBITO")} className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="CREDITO">Crédito</option><option value="DEBITO">Débito</option></select></label>
          <label className="grid gap-1 text-sm font-medium">Horas<input value={hours} onChange={e => setHours(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="02:30"/></label>
          <label className="grid gap-1 text-sm font-medium">Observação<input value={description} onChange={e => setDescription(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal"/></label>
        </div>
        <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">Valor hora (prévia)</span><strong>{hourlyRate.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong></div><div className="mt-2 flex justify-between"><span className="text-muted-foreground">Valor estimado (prévia)</span><strong>{estimatedValue.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong></div></div>
        <div className="mt-5 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving || !competence} onClick={() => void createLaunch()} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Salvando..." : "Salvar lançamento"}</button></div>
      </Card>
    </div>}
  </div>;
}
