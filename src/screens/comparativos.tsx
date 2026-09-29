import { ArrowLeft, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Employee = { id: string; full_name: string; status?: string };
type Totals = {
  he60: number; he60_20: number; he100: number; he20: number;
  interjornada: number; debitos: number; faltas: number; atestados: number;
};
const EMPTY: Totals = { he60: 0, he60_20: 0, he100: 0, he20: 0, interjornada: 0, debitos: 0, faltas: 0, atestados: 0 };
const ABSENCE_CODES = ["folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"];

function fmt(minutes: number) {
  const n = Math.abs(Math.round(minutes || 0));
  return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
}

export function Comparativos() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [periodMode, setPeriodMode] = useState<"geral" | "competencia">("geral");
  const [periodId, setPeriodId] = useState("");
  const [totals, setTotals] = useState<Record<string, Totals>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const db = supabase as any;
        const [{ data: employeeData, error: employeeError }, { data: periodData, error: periodError }] = await Promise.all([
          db.from("employees").select("id,full_name,status").order("full_name"),
          db.from("time_periods").select("id,reference_year,reference_month,start_date,end_date").order("start_date", { ascending: false }),
        ]);
        if (employeeError) throw employeeError;
        if (periodError) throw periodError;
        const list = (employeeData ?? []) as Employee[];
        setEmployees(list);
        setSelected(list.filter(e => e.status !== "inativo").map(e => e.id));
        setPeriods(periodData ?? []);
      } catch (e: any) {
        setError(e.message ?? "Não foi possível carregar os filtros.");
      } finally { setLoading(false); }
    })();
  }, []);

  async function loadComparison(ids: string[], mode: "geral" | "competencia", selectedPeriod: string) {
    if (!ids.length) { setTotals({}); return; }
    setError("");
    try {
      const db = supabase as any;
      const period = (periods ?? []).find(p => p.id === selectedPeriod);
      const historicalQuery = db.from("historical_kpi_data")
        .select("employee_id,reference_year,reference_month,period_id,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes");
      const overtimeQuery = db.from("overtime_records").select("employee_id,minutes,launch_type,period_id,reference_date").in("employee_id", ids);
      const debitQuery = db.from("bank_hours").select("employee_id,minutes,kind,period_id,entry_date").in("employee_id", ids).eq("kind", "debito");
      const absenceQuery = db.from("occurrences").select("employee_id,quantity,occurrence_date,end_date,occurrence_types!inner(code)").in("employee_id", ids).in("occurrence_types.code", ABSENCE_CODES);
      const certificateQuery = db.from("medical_certificates").select("employee_id,days,start_date,end_date").in("employee_id", ids);

      if (mode === "competencia" && period) {
        historicalQuery.eq("period_id", period.id);
        overtimeQuery.eq("period_id", period.id);
        debitQuery.eq("period_id", period.id);
        absenceQuery.lte("occurrence_date", period.end_date).or(`end_date.is.null,end_date.gte.${period.start_date}`);
        certificateQuery.lte("start_date", period.end_date).gte("end_date", period.start_date);
      }

      const [historical, overtime, debits, absences, certificates] = await Promise.all([
        historicalQuery.in("employee_id", ids),
        overtimeQuery,
        debitQuery,
        absenceQuery,
        certificateQuery,
      ]);
      for (const result of [historical, overtime, debits, absences, certificates]) if (result.error) throw result.error;

      const next: Record<string, Totals> = {};
      ids.forEach(id => { next[id] = { ...EMPTY }; });

      for (const row of historical.data ?? []) {
        const t = next[row.employee_id]; if (!t) continue;
        t.he60 += Number(row.he_60_minutes || 0);
        t.he60_20 += Number(row.he_60_night_minutes || 0);
        t.he100 += Number(row.he_100_minutes || 0);
        t.he20 += Number(row.he_20_minutes || 0);
        t.interjornada += Number(row.interjornada_minutes || 0);
      }
      for (const row of overtime.data ?? []) {
        const t = next[row.employee_id]; if (!t) continue;
        const type = String(row.launch_type || "").toUpperCase();
        const minutes = Math.abs(Number(row.minutes) || 0);
        if (type.includes("INTERJORNADA")) t.interjornada += minutes;
        else if (type.includes("60_20") || type.includes("60%20") || type.includes("60+20")) t.he60_20 += minutes;
        else if (type.includes("100")) t.he100 += minutes;
        else if (type.includes("20")) t.he20 += minutes;
        else t.he60 += minutes;
      }
      for (const row of debits.data ?? []) if (next[row.employee_id]) next[row.employee_id].debitos += Math.abs(Number(row.minutes) || 0);
      for (const row of absences.data ?? []) if (next[row.employee_id]) next[row.employee_id].faltas += Number(row.quantity || 0);
      for (const row of certificates.data ?? []) if (next[row.employee_id]) next[row.employee_id].atestados += Number(row.days || 0);

      setTotals(next);
    } catch (e: any) {
      setError(e.message ?? "Não foi possível carregar os comparativos.");
    }
  }

  useEffect(() => {
    if (!loading) void loadComparison(selected, periodMode, periodId);
  }, [selected, periodMode, periodId, loading, periods]);

  const visibleEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e => !q || e.full_name.toLowerCase().includes(q));
  }, [employees, search]);

  function toggle(id: string) { setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }
  function selectVisible() { setSelected(prev => [...new Set([...prev, ...visibleEmployees.map(e => e.id)])]); }

  const columns: [keyof Totals, string][] = [
    ["he60", "HE 60%"], ["he60_20", "HE 60% + 20%"], ["he100", "HE 100%"], ["he20", "HE 20%"],
    ["interjornada", "Interjornada"], ["debitos", "Débitos"]
  ];

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] items-center justify-between"><a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a><b>DP Success · Comparativos</b></div></header>
    <main className="mx-auto max-w-[1600px] px-6 py-7">
      <p className="text-sm text-primary">Gestão</p>
      <h1 className="mt-1 text-3xl font-bold">Comparativos</h1>
      <p className="mt-1 text-sm text-muted-foreground">Compare funcionários por uma competência específica ou pelo quadro geral.</p>

      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

      <Card className="mt-6 p-5">
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div>
            <label className="text-sm font-medium">Período da comparação</label>
            <select value={periodMode} onChange={e => setPeriodMode(e.target.value as any)} className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="geral">Quadro geral</option>
              <option value="competencia">Competência única</option>
            </select>
          </div>
          {periodMode === "competencia" && <div>
            <label className="text-sm font-medium">Competência</label>
            <select value={periodId} onChange={e => setPeriodId(e.target.value)} className="mt-2 w-full rounded-lg border bg-background px-3 py-2 text-sm">
              <option value="">Selecione a competência</option>
              {periods.map(p => <option key={p.id} value={p.id}>{String(p.reference_month).padStart(2, "0")}/{p.reference_year} · {p.start_date} até {p.end_date}</option>)}
            </select>
          </div>}
        </div>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><h2 className="font-semibold">Funcionários para comparar</h2><p className="text-xs text-muted-foreground">{selected.length} selecionado(s)</p></div>
          <div className="flex gap-2"><button onClick={selectVisible} className="rounded-lg border px-3 py-2 text-sm">Selecionar exibidos</button><button onClick={() => setSelected([])} className="rounded-lg border px-3 py-2 text-sm">Limpar seleção</button></div>
        </div>
        <div className="relative mt-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar funcionário..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm" /></div>
        <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleEmployees.map(employee => <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 hover:bg-muted/40"><input type="checkbox" checked={selected.includes(employee.id)} onChange={() => toggle(employee.id)} /><span className="truncate text-sm">{employee.full_name}</span></label>)}
        </div>
      </Card>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[1250px] text-left text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
            <th className="px-4 py-3">Funcionário</th>
            {columns.map(([, label]) => <th key={label} className="px-4 py-3">{label}</th>)}
            <th className="px-4 py-3">Faltas (dias)</th><th className="px-4 py-3">Atestados (dias)</th>
          </tr></thead>
          <tbody className="divide-y">
            {selected.map(id => { const employee = employees.find(e => e.id === id); const t = totals[id] ?? EMPTY; return <tr key={id}>
              <td className="px-4 py-4 font-medium">{employee?.full_name ?? "Funcionário"}</td>
              {columns.map(([key]) => <td key={key} className="px-4 py-4">{fmt(t[key])}</td>)}
              <td className="px-4 py-4">{t.faltas.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
              <td className="px-4 py-4">{t.atestados.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
            </tr>; })}
            {!selected.length && <tr><td colSpan={9} className="px-5 py-10 text-center text-sm text-muted-foreground">Selecione pelo menos um funcionário.</td></tr>}
          </tbody>
        </table>
      </Card>
    </main>
  </div>;
}