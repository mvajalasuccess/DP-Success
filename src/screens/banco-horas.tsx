import { ArrowLeft, RefreshCw, ChevronDown, ChevronUp, History } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Employee = { id: string; full_name: string };
type Period = { id: string; reference_year: number; reference_month: number; status: string };
type BalanceRow = {
  period: Period; label: string; range: string;
  debit: number; he60: number; heNoturna: number; he100: number;
  he100Noturna: number; noturno: number; interjornada: number;
  monthlyBalance: number; finalBalance: number;
};

function minutesToHours(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Math.round(value));
  return sign + String(Math.floor(abs / 60)).padStart(2, "0") + ":" + String(abs % 60).padStart(2, "0");
}
function periodRange(p: Period) {
  const end = new Date(p.reference_year, p.reference_month - 1, 20);
  const start = new Date(p.reference_year, p.reference_month - 2, 21);
  return start.toLocaleDateString("pt-BR") + " → " + end.toLocaleDateString("pt-BR");
}
function periodLabel(p: Period) {
  const start = new Date(p.reference_year, p.reference_month - 2, 21);
  const end = new Date(p.reference_year, p.reference_month - 1, 20);
  return start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase() + "-" +
    end.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
}
function emptyCredit() {
  return { he60: 0, heNoturna: 0, he100: 0, he100Noturna: 0, noturno: 0, interjornada: 0 };
}
function classify(row: { rate_percent: number | null; notes: string | null }) {
  const rate = Number(row.rate_percent || 0);
  const note = String(row.notes || "").toLowerCase();
  if (rate === 50) return "interjornada";
  if (rate === 100 && note.includes("noturna")) return "he100Noturna";
  if (rate === 100) return "he100";
  if (rate === 20) return "noturno";
  if (rate === 60 && (note.includes("60% + 20%") || note.includes("noturna"))) return "heNoturna";
  return "he60";
}

export function BankHours() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [expandedId, setExpandedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadEmployees() {
    const { data, error } = await supabase.from("employees").select("id,full_name").eq("status", "ativo").order("full_name");
    if (error) { setError(error.message); setLoading(false); return; }
    setEmployees(data ?? []);
    if (!selectedEmployeeId && data?.[0]?.id) setSelectedEmployeeId(data[0].id);
  }

  async function loadBalances(employeeId: string) {
    if (!employeeId) { setRows([]); setLoading(false); return; }
    setLoading(true); setError("");

    const { data: periodData, error: periodError } = await supabase
      .from("time_periods").select("id,reference_year,reference_month,status")
      .order("reference_year", { ascending: false }).order("reference_month", { ascending: false });
    if (periodError) { setError(periodError.message); setLoading(false); return; }

    const periodList = (periodData ?? []) as Period[];
    setPeriods(periodList);
    if (!periodList.length) { setRows([]); setLoading(false); return; }

    const ids = periodList.map(p => p.id);
    const [timeRes, overtimeRes, bankRes] = await Promise.all([
      supabase.from("time_records").select("period_id,negative_minutes").eq("employee_id", employeeId).in("period_id", ids),
      supabase.from("overtime_records").select("period_id,minutes,rate_percent,notes").eq("employee_id", employeeId).in("period_id", ids),
      supabase.from("bank_hours").select("period_id,kind,minutes,justification").eq("employee_id", employeeId).in("period_id", ids),
    ]);
    if (timeRes.error) { setError(timeRes.error.message); setLoading(false); return; }
    if (overtimeRes.error) { setError(overtimeRes.error.message); setLoading(false); return; }
    if (bankRes.error) { setError(bankRes.error.message); setLoading(false); return; }

    const debits = new Map<string, number>();
    for (const r of timeRes.data ?? []) debits.set(r.period_id, (debits.get(r.period_id) ?? 0) + Number(r.negative_minutes || 0));

    const credits = new Map<string, ReturnType<typeof emptyCredit>>();
    for (const r of overtimeRes.data ?? []) {
      if (!r.period_id) continue;
      const current = credits.get(r.period_id) ?? emptyCredit();
      current[classify(r) as keyof ReturnType<typeof emptyCredit>] += Number(r.minutes || 0);
      credits.set(r.period_id, current);
    }
    for (const r of bankRes.data ?? []) {
      if (r.kind !== "credito" || !r.period_id) continue;
      const current = credits.get(r.period_id) ?? emptyCredit();
      const note = String(r.justification || "").toLowerCase();
      const key = note.includes("interjornada") ? "interjornada" :
        note.includes("100% + 20%") ? "he100Noturna" :
        note.includes("100%") ? "he100" :
        note.includes("60% + 20%") || note.includes("noturna") ? "heNoturna" :
        note.includes("20%") ? "noturno" : "he60";
      current[key as keyof ReturnType<typeof emptyCredit>] += Math.abs(Number(r.minutes || 0));
      credits.set(r.period_id, current);
    }

    let running = 0;
    const calculated = periodList.slice().sort((a,b) => a.reference_year-b.reference_year || a.reference_month-b.reference_month).map(p => {
      const credit = credits.get(p.id) ?? emptyCredit();
      const debit = debits.get(p.id) ?? 0;
      const monthlyBalance = credit.he60 + credit.heNoturna + credit.he100 + credit.he100Noturna + credit.noturno - debit;
      running += monthlyBalance;
      return { period:p, label:periodLabel(p), range:periodRange(p), debit, ...credit, monthlyBalance, finalBalance:running };
    });
    setRows(calculated.reverse());
    setLoading(false);
  }

  useEffect(() => { void loadEmployees(); }, []);
  useEffect(() => { void loadBalances(selectedEmployeeId); }, [selectedEmployeeId]);

  const employee = employees.find(e => e.id === selectedEmployeeId);
  const finalBalance = rows[0]?.finalBalance ?? 0;

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</a>
        <span className="font-semibold">DP Success · Banco de Horas</span>
      </div>
    </header>
    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm font-medium text-primary">Operação</p><h1 className="mt-1 text-3xl font-bold">Banco de Horas</h1><p className="mt-1 text-sm text-muted-foreground">Visualize somente os saldos de cada competência.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funcionário
            <select value={selectedEmployeeId} onChange={e=>setSelectedEmployeeId(e.target.value)} className="min-w-[280px] rounded-lg border bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal">
              {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </label>
          <button onClick={()=>void loadBalances(selectedEmployeeId)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4"/> Atualizar</button>
        </div>
      </div>
      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <Card className="mt-6">
        <div className="grid md:grid-cols-3 md:divide-x divide-y md:divide-y-0">
          <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funcionário</p><p className="mt-1 text-lg font-bold">{employee?.full_name ?? "Selecione um funcionário"}</p></div>
          <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competências</p><p className="mt-1 text-lg font-bold">{periods.length}</p></div>
          <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo acumulado</p><p className={`mt-1 text-lg font-bold ${finalBalance<0?"text-destructive":"text-primary"}`}>{loading?"...":minutesToHours(finalBalance)}</p></div>
        </div>
      </Card>
      <div className="mt-6 space-y-3">
        {loading ? <Card className="p-8 text-center text-muted-foreground">Carregando saldos...</Card> :
        !rows.length ? <Card className="p-8 text-center text-muted-foreground">Nenhuma competência encontrada.</Card> :
        rows.map(row => {
          const expanded = expandedId === row.period.id;
          return <Card key={row.period.id} className="overflow-hidden">
            <button type="button" onClick={()=>setExpandedId(expanded?"":row.period.id)} className="flex w-full flex-col gap-4 p-5 text-left hover:bg-muted/30 md:flex-row md:items-center md:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><span className="text-lg font-bold">{row.label}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{row.range}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{row.period.status}</span></div><p className="mt-1 text-sm text-muted-foreground">Débito = horas em atraso · Interjornada é somente histórico.</p></div>
              <div className="flex items-center gap-5 md:shrink-0">
                <div className="text-right"><p className="text-xs text-muted-foreground">Saldo do mês</p><p className={`text-2xl font-bold ${row.monthlyBalance<0?"text-destructive":"text-primary"}`}>{minutesToHours(row.monthlyBalance)}</p></div>
                <div className="text-right"><p className="text-xs text-muted-foreground">Saldo acumulado</p><p className="font-semibold">{minutesToHours(row.finalBalance)}</p></div>
                {expanded?<ChevronUp className="h-5 w-5 text-muted-foreground"/>:<ChevronDown className="h-5 w-5 text-muted-foreground"/>}
              </div>
            </button>
            {expanded && <div className="border-t bg-muted/10 p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[["Débito / atraso",row.debit],["Crédito 60%",row.he60],["60% + 20% noturno",row.heNoturna],["100%",row.he100],["100% + 20% noturno",row.he100Noturna],["Adicional noturno 20%",row.noturno]].map(([label,value])=><div key={String(label)} className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-xl font-bold">{minutesToHours(Number(value))}</p></div>)}
                <div className="rounded-xl border bg-background p-4 sm:col-span-2 lg:col-span-3"><div className="flex items-center gap-2"><History className="h-4 w-4 text-muted-foreground"/><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interjornada 50% · histórico</p></div><p className="mt-1 text-xl font-bold text-muted-foreground">{minutesToHours(row.interjornada)}</p><p className="mt-1 text-xs text-muted-foreground">Não altera o saldo.</p></div>
              </div>
            </div>}
          </Card>;
        })}
      </div>
    </main>
  </div>;
}
