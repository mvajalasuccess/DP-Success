import { ArrowLeft, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Employee = { id: string; full_name: string };
type Period = { id: string; reference_year: number; reference_month: number; status: string };
type MatrixRow = {
  period: Period;
  label: string;
  range: string;
  delay: number;
  he60: number;
  heNoturna: number;
  he100: number;
  he100Noturna: number;
  noturno: number;
  interjornada: number;
  bankMovement: number;
  totalSalary: number;
  totalFolga: number;
  totalBalance: number;
  finalBalance: number;
  openHours: number;
};

function minutesToHours(value: number) {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(Math.round(value));
  return sign + String(Math.floor(abs / 60)).padStart(2, "0") + ":" + String(abs % 60).padStart(2, "0");
}

function money(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function periodRange(period: Period) {
  const end = new Date(period.reference_year, period.reference_month - 1, 20);
  const start = new Date(period.reference_year, period.reference_month - 2, 21);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " - " + end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
  };
}

function periodLabel(period: Period) {
  const start = new Date(period.reference_year, period.reference_month - 2, 21);
  const end = new Date(period.reference_year, period.reference_month - 1, 20);
  const a = start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
  const b = end.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
  return a + "-" + b;
}

function classifyOvertime(row: any) {
  const rate = Number(row.rate_percent || 0);
  const note = String(row.notes || "").toLowerCase();
  if (rate === 60 && (note.includes("60% + 20%") || note.includes("noturna"))) return "heNoturna";
  if (rate === 100 && (note.includes("100% + 20%") || note.includes("noturna"))) return "he100Noturna";
  if (rate === 100) return "he100";
  if (rate === 20) return "noturno";
  if (rate === 50) return "interjornada";
  return "he60";
}

export function BankHours() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [companyName, setCompanyName] = useState("EMPRESA");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadEmployees() {
    const { data, error: employeeError } = await supabase
      .from("employees")
      .select("id,full_name")
      .eq("status", "ativo")
      .order("full_name");
    if (employeeError) {
      setError(employeeError.message);
      return;
    }
    setEmployees(data ?? []);
    if (!selectedEmployeeId && data?.[0]?.id) setSelectedEmployeeId(data[0].id);
  }

  async function loadMatrix(employeeId: string) {
    if (!employeeId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const { data: periodData, error: periodError } = await supabase
      .from("time_periods")
      .select("id,reference_year,reference_month,status")
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false });

    if (periodError) {
      setError(periodError.message);
      setLoading(false);
      return;
    }

    const periodList = (periodData ?? []) as Period[];
    setPeriods(periodList);

    if (!periodList.length) {
      setRows([]);
      setLoading(false);
      return;
    }

    const periodIds = periodList.map(p => p.id);

    const [timeRes, overtimeRes] = await Promise.all([
      supabase.from("time_records").select("period_id,negative_minutes").eq("employee_id", employeeId).in("period_id", periodIds),
      supabase.from("overtime_records").select("period_id,minutes,rate_percent,notes").eq("employee_id", employeeId).in("period_id", periodIds),
    ]);

    if (timeRes.error) {
      setError(timeRes.error.message);
      setLoading(false);
      return;
    }
    if (overtimeRes.error) {
      setError(overtimeRes.error.message);
      setLoading(false);
      return;
    }

    const debits = new Map<string, number>();
    for (const item of timeRes.data ?? []) {
      debits.set(item.period_id, (debits.get(item.period_id) ?? 0) + Number(item.negative_minutes || 0));
    }

    const credits = new Map<string, any>();
    for (const item of overtimeRes.data ?? []) {
      if (!item.period_id) continue;
      const current = credits.get(item.period_id) ?? { he60: 0, heNoturna: 0, he100: 0, he100Noturna: 0, noturno: 0, interjornada: 0 };
      const key = classifyOvertime(item);
      current[key] += Number(item.minutes || 0);
      credits.set(item.period_id, current);
    }

    let running = 0;
    const calculated = periodList
      .slice()
      .sort((a, b) => a.reference_year - b.reference_year || a.reference_month - b.reference_month)
      .map(period => {
        const credit = credits.get(period.id) ?? { he60: 0, heNoturna: 0, he100: 0, he100Noturna: 0, noturno: 0, interjornada: 0 };
        const debit = debits.get(period.id) ?? 0;
        const creditMinutes = credit.he60 + credit.heNoturna + credit.he100 + credit.he100Noturna + credit.noturno;
        const monthlyBalance = creditMinutes - debit;
        running += monthlyBalance;

        return {
          period,
          label: periodLabel(period),
          range: periodRange(period),
          debit,
          he60: credit.he60,
          heNoturna: credit.heNoturna,
          he100: credit.he100,
          he100Noturna: credit.he100Noturna,
          noturno: credit.noturno,
          interjornada: credit.interjornada,
          monthlyBalance,
          finalBalance: running,
        };
      });

    setRows(calculated.reverse());
    setLoading(false);
  }

  useEffect(() => { void loadEmployees(); }, []);
  useEffect(() => { void loadMatrix(selectedEmployeeId); }, [selectedEmployeeId]);

  const employee = employees.find(item => item.id === selectedEmployeeId);
  const totals = useMemo(() => rows.reduce((acc, row) => ({
    delay: acc.delay + row.delay,
    he60: acc.he60 + row.he60,
    heNoturna: acc.heNoturna + row.heNoturna,
    he100: acc.he100 + row.he100,
    he100Noturna: acc.he100Noturna + row.he100Noturna,
    noturno: acc.noturno + row.noturno,
    interjornada: acc.interjornada + row.interjornada,
    salary: acc.salary + row.totalSalary,
    folga: acc.folga + row.totalFolga,
    balance: acc.balance + row.totalBalance,
    open: acc.open + row.openHours,
  }), { delay: 0, he60: 0, heNoturna: 0, he100: 0, he100Noturna: 0, noturno: 0, interjornada: 0, salary: 0, folga: 0, balance: 0, open: 0 }), [rows]);

  const finalBalance = rows.length ? rows[0].finalBalance : 0;

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4">
      <div className="mx-auto flex max-w-[1100px] items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</a>
        <span className="font-semibold">DP Success · Banco de Horas</span>
      </div>
    </header>

    <main className="mx-auto max-w-[1100px] px-4 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Operação</p>
          <h1 className="mt-1 text-3xl font-bold">Banco de Horas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visualize os saldos por competência de forma simples.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="grid gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Funcionário
            <select value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)} className="min-w-[280px] rounded-lg border bg-background px-3 py-2 text-sm font-normal normal-case tracking-normal">
              {employees.map(item => <option key={item.id} value={item.id}>{item.full_name}</option>)}
            </select>
          </label>
          <button onClick={() => void loadMatrix(selectedEmployeeId)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RefreshCw className="h-4 w-4" /> Atualizar</button>
        </div>
      </div>

      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <Card className="mt-6 overflow-hidden">
        <div className="grid grid-cols-1 divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Funcionário</p><p className="mt-1 text-lg font-bold">{employee?.full_name ?? "Selecione um funcionário"}</p></div>
          <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competências</p><p className="mt-1 text-lg font-bold">{periods.length}</p></div>
          <div className="p-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saldo acumulado</p><p className={`mt-1 text-lg font-bold ${finalBalance < 0 ? "text-destructive" : "text-primary"}`}>{loading ? "..." : minutesToHours(finalBalance)}</p></div>
        </div>
      </Card>

      <div className="mt-6 space-y-3">
        {loading ? <Card className="p-8 text-center text-muted-foreground">Carregando saldos...</Card> :
        rows.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Nenhuma competência encontrada para este funcionário.</Card> :
        rows.map(row => {
          const expanded = expandedId === row.period.id;
          return <Card key={row.period.id} className="overflow-hidden">
            <button type="button" onClick={() => setExpandedId(expanded ? "" : row.period.id)} className="flex w-full flex-col gap-4 p-5 text-left transition-colors hover:bg-muted/30 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{row.label}</span>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{row.range}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.period.status === "fechado" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700"}`}>{row.period.status}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">Débito = horas em atraso · Interjornada fica somente no histórico.</p>
              </div>
              <div className="flex items-center gap-5 md:shrink-0">
                <div className="text-right"><p className="text-xs text-muted-foreground">Saldo do mês</p><p className={`text-2xl font-bold ${row.monthlyBalance < 0 ? "text-destructive" : "text-primary"}`}>{minutesToHours(row.monthlyBalance)}</p></div>
                <div className="text-right"><p className="text-xs text-muted-foreground">Saldo acumulado</p><p className={`font-semibold ${row.finalBalance < 0 ? "text-destructive" : ""}`}>{minutesToHours(row.finalBalance)}</p></div>
                {expanded ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>
            </button>

            {expanded && <div className="border-t bg-muted/10 px-5 py-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Débito / atraso</p><p className="mt-1 text-xl font-bold text-destructive">{minutesToHours(row.debit)}</p></div>
                <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Crédito 60%</p><p className="mt-1 text-xl font-bold">{minutesToHours(row.he60)}</p></div>
                <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">60% + 20% noturno</p><p className="mt-1 text-xl font-bold">{minutesToHours(row.heNoturna)}</p></div>
                <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">100%</p><p className="mt-1 text-xl font-bold">{minutesToHours(row.he100)}</p></div>
                <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">100% + 20% noturno</p><p className="mt-1 text-xl font-bold">{minutesToHours(row.he100Noturna)}</p></div>
                <div className="rounded-xl border bg-background p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Adicional noturno 20%</p><p className="mt-1 text-xl font-bold">{minutesToHours(row.noturno)}</p></div>
                <div className="rounded-xl border bg-background p-4 sm:col-span-2">
                  <div className="flex items-center gap-2"><History className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Interjornada 50% · histórico</p></div>
                  <p className="mt-1 text-xl font-bold text-muted-foreground">{minutesToHours(row.interjornada)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Não altera o saldo do mês nem o saldo acumulado.</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border bg-background px-4 py-3">
                <span className="text-sm text-muted-foreground">Créditos − débitos</span>
                <span className={`text-lg font-bold ${row.monthlyBalance < 0 ? "text-destructive" : "text-primary"}`}>{minutesToHours(row.monthlyBalance)}</span>
              </div>
            </div>}
          </Card>;
        })}
      </div>
    </main>
  </div>;

}
