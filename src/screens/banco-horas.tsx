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

    const [timeRes, overtimeRes, bankRes, occurrenceRes, settingsRes] = await Promise.all([
      supabase.from("time_records").select("period_id,negative_minutes").eq("employee_id", employeeId).in("period_id", periodIds),
      supabase.from("overtime_records").select("period_id,minutes,rate_percent,estimated_value,notes").eq("employee_id", employeeId).in("period_id", periodIds),
      supabase.from("bank_hours").select("period_id,kind,minutes,justification").eq("employee_id", employeeId).in("period_id", periodIds),
      supabase.from("occurrences").select("period_id,quantity,unit,occurrence_type_id,occurrence_types(code,name)").eq("employee_id", employeeId).in("period_id", periodIds),
      supabase.from("app_settings").select("key,value").eq("key", "company_name").limit(1),
    ]);

    if (timeRes.error) { setError(timeRes.error.message); setLoading(false); return; }
    if (overtimeRes.error) { setError(overtimeRes.error.message); setLoading(false); return; }
    if (bankRes.error) { setError(bankRes.error.message); setLoading(false); return; }
    if (occurrenceRes.error) { setError(occurrenceRes.error.message); setLoading(false); return; }

    const setting = settingsRes.data?.[0] as any;
    if (setting?.value) {
      const value = typeof setting.value === "string" ? setting.value : setting.value?.name;
      if (value) setCompanyName(value);
    }

    const delays = new Map<string, number>();
    for (const item of timeRes.data ?? []) {
      delays.set(item.period_id, (delays.get(item.period_id) ?? 0) + Number(item.negative_minutes || 0));
    }

    const overtime = new Map<string, { he60: number; heNoturna: number; he100: number; he100Noturna: number; noturno: number; interjornada: number; salary: number }>();
    for (const item of overtimeRes.data ?? []) {
      if (!item.period_id) continue;
      const current = overtime.get(item.period_id) ?? { he60: 0, heNoturna: 0, he100: 0, he100Noturna: 0, noturno: 0, interjornada: 0, salary: 0 };
      const key = classifyOvertime(item);
      current[key] += Number(item.minutes || 0);
      current.salary += Number(item.estimated_value || 0);
      overtime.set(item.period_id, current);
    }

    // Créditos lançados no Banco de Horas também alimentam as colunas de natureza.
    // A justificativa preserva o tipo escolhido no lançamento consolidado.
    const bankCategories = new Map<string, { he60: number; heNoturna: number; he100: number; he100Noturna: number; noturno: number; interjornada: number }>();
    const bankMovement = new Map<string, number>();

    function classifyBankCredit(justification: string | null) {
      const note = String(justification || "").toLowerCase();
      if (note.includes("100% + 20%")) return "he100Noturna";
      if (note.includes("60% + 20%")) return "heNoturna";
      if (note.includes("interjornada")) return "interjornada";
      if (note.includes("100%")) return "he100";
      if (note.includes("20%")) return "noturno";
      return "he60";
    }

    for (const item of bankRes.data ?? []) {
      if (!item.period_id) continue;
      const minutes = Math.abs(Number(item.minutes || 0));

      if (item.kind === "credito") {
        const current = bankCategories.get(item.period_id) ?? { he60: 0, heNoturna: 0, he100: 0, he100Noturna: 0, noturno: 0, interjornada: 0 };
        const key = classifyBankCredit((item as any).justification);
        current[key] += minutes;
        bankCategories.set(item.period_id, current);
      } else {
        const signed = item.kind === "debito" ? -minutes : minutes;
        bankMovement.set(item.period_id, (bankMovement.get(item.period_id) ?? 0) + signed);
      }
    }

    const folga = new Map<string, number>();
    for (const item of occurrenceRes.data ?? []) {
      if (!item.period_id) continue;
      const type = (item as any).occurrence_types;
      if (type?.code === "folga") {
        const quantity = Number(item.quantity || 0);
        const minutes = item.unit === "horas" ? quantity * 60 : 0;
        folga.set(item.period_id, (folga.get(item.period_id) ?? 0) + minutes);
      }
    }

    let running = 0;
    const calculated = periodList
      .slice()
      .sort((a, b) => a.reference_year - b.reference_year || a.reference_month - b.reference_month)
      .map(period => {
        const extra = overtime.get(period.id) ?? { he60: 0, heNoturna: 0, he100: 0, he100Noturna: 0, noturno: 0, interjornada: 0, salary: 0 };
        const categorizedBank = bankCategories.get(period.id) ?? { he60: 0, heNoturna: 0, he100: 0, he100Noturna: 0, noturno: 0, interjornada: 0 };
        const delay = delays.get(period.id) ?? 0;
        const movement = bankMovement.get(period.id) ?? 0;
        const totalFolga = folga.get(period.id) ?? 0;
        const he60 = extra.he60 + categorizedBank.he60;
        const heNoturna = extra.heNoturna + categorizedBank.heNoturna;
        const he100 = extra.he100 + categorizedBank.he100;
        const he100Noturna = extra.he100Noturna + categorizedBank.he100Noturna;
        const noturno = extra.noturno + categorizedBank.noturno;
        const interjornada = extra.interjornada + categorizedBank.interjornada;
        const creditMinutes = he60 + heNoturna + he100 + he100Noturna + noturno;
        const totalBalance = creditMinutes - delay + movement - totalFolga;
        running += totalBalance;
        return {
          period,
          label: periodLabel(period),
          range: periodRange(period).label,
          delay,
          he60,
          heNoturna,
          he100,
          he100Noturna,
          noturno,
          interjornada,
          bankMovement: movement,
          totalSalary: extra.salary,
          totalFolga,
          totalBalance,
          finalBalance: running,
          openHours: period.status === "aberto" ? Math.max(totalBalance, 0) : 0,
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
      <div className="mx-auto flex max-w-[1700px] items-center justify-between">
        <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</a>
        <span className="font-semibold">DP Success · Banco de Horas</span>
      </div>
    </header>

    <main className="mx-auto max-w-[1700px] px-4 py-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-primary">Operação</p>
          <h1 className="mt-1 text-3xl font-bold">Banco de Horas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Visão por competência inspirada na sua planilha, com saldo, adicionais e horas em aberto.</p>
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
        <div className="grid grid-cols-2 border-b bg-muted/20 md:grid-cols-4">
          <div className="border-r p-3 text-center"><p className="text-[10px] font-bold uppercase text-muted-foreground">Empresa</p><p className="mt-1 font-semibold">{companyName}</p></div>
          <div className="border-r p-3 text-center"><p className="text-[10px] font-bold uppercase text-muted-foreground">Funcionário</p><p className="mt-1 font-semibold">{employee?.full_name ?? "Selecione um funcionário"}</p></div>
          <div className="border-r p-3 text-center"><p className="text-[10px] font-bold uppercase text-muted-foreground">Competências</p><p className="mt-1 font-semibold">{periods.length}</p></div>
          <div className="p-3 text-center"><p className="text-[10px] font-bold uppercase text-muted-foreground">Saldo final</p><p className={"mt-1 font-bold " + (finalBalance < 0 ? "text-destructive" : "text-primary")}>{loading ? "..." : minutesToHours(finalBalance)}</p></div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1550px] w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-700 text-white">
                <th className="sticky left-0 z-10 border-r border-slate-500 px-3 py-2 text-left">COMPETÊNCIA</th>
                <th className="border-r border-slate-500 px-3 py-2 text-left">MÊS (TRAB)</th>
                <th className="border-r border-slate-500 px-3 py-2">ATRASOS NO MÊS</th>
                <th className="border-r border-slate-500 px-3 py-2">60%</th>
                <th className="border-r border-slate-500 px-3 py-2">60% + 20% NOT</th>
                <th className="border-r border-slate-500 px-3 py-2">100%</th>
                <th className="border-r border-slate-500 px-3 py-2">100% + 20% NOT</th>
                <th className="border-r border-slate-500 px-3 py-2">NOT</th>
                <th className="border-r border-slate-500 px-3 py-2">TOTAL SALDO</th>
                <th className="border-r border-slate-500 px-3 py-2">TOTAL $</th>
                <th className="border-r border-slate-500 px-3 py-2">TOTAL FOLGA</th>
                <th className="border-r border-slate-500 px-3 py-2">SALDO FINAL</th>
                <th className="border-r border-slate-500 px-3 py-2">HORAS EM ABERTO</th>
                <th className="px-3 py-2">INTERJ 50%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => <tr key={row.period.id} className="border-b">
                <td className="sticky left-0 z-[1] border-r bg-background px-3 py-2 font-semibold">{row.label}</td>
                <td className="border-r px-3 py-2 whitespace-nowrap">{row.range}</td>
                <td className="border-r px-3 py-2 text-center text-red-600 font-semibold">{minutesToHours(row.delay)}</td>
                <td className="border-r bg-muted/30 px-3 py-2 text-center">{minutesToHours(row.he60)}</td>
                <td className="border-r bg-muted/30 px-3 py-2 text-center">{minutesToHours(row.heNoturna)}</td>
                <td className="border-r bg-muted/30 px-3 py-2 text-center">{minutesToHours(row.he100)}</td>
                <td className="border-r bg-muted/30 px-3 py-2 text-center">{minutesToHours(row.he100Noturna)}</td>
                <td className="border-r bg-muted/30 px-3 py-2 text-center">{minutesToHours(row.noturno)}</td>
                <td className={"border-r px-3 py-2 text-center font-bold " + (row.totalBalance < 0 ? "text-red-600" : "")}>{minutesToHours(row.totalBalance)}</td>
                <td className="border-r px-3 py-2 text-center whitespace-nowrap">{money(row.totalSalary)}</td>
                <td className="border-r px-3 py-2 text-center">{minutesToHours(row.totalFolga)}</td>
                <td className={"border-r px-3 py-2 text-center font-bold " + (row.finalBalance < 0 ? "text-red-600" : "")}>{minutesToHours(row.finalBalance)}</td>
                <td className={"border-r px-3 py-2 text-center font-semibold " + (row.openHours > 0 ? "bg-orange-100 text-orange-700" : "bg-emerald-50 text-emerald-700")}>{minutesToHours(row.openHours)}</td>
                <td className="px-3 py-2 text-center text-red-600">{minutesToHours(row.interjornada)}</td>
              </tr>)}
              {!loading && !rows.length && <tr><td colSpan={14} className="p-10 text-center text-muted-foreground">Nenhuma competência encontrada para este funcionário.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold">
                <td colSpan={2} className="px-3 py-3 text-right">TOTAL</td>
                <td className="px-3 py-3 text-center text-red-600">{minutesToHours(totals.delay)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(totals.he60)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(totals.heNoturna)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(totals.he100)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(totals.he100Noturna)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(totals.noturno)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(totals.balance)}</td>
                <td className="px-3 py-3 text-center">{money(totals.salary)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(totals.folga)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(finalBalance)}</td>
                <td className="px-3 py-3 text-center">{minutesToHours(totals.open)}</td>
                <td className="px-3 py-3 text-center text-red-600">{minutesToHours(totals.interjornada)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 p-4 text-xs text-muted-foreground">
          <span>As colunas seguem a lógica da sua planilha: atrasos reduzem o saldo; adicionais aumentam; o saldo final acumula competência a competência.</span>
          <span>{loading ? "Carregando..." : "Atualizado agora"}</span>
        </div>
      </Card>
    </main>
  </div>;
}
