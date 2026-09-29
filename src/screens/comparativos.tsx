import { ArrowLeft, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Employee = { id: string; full_name: string; status?: string };
type Totals = {
  he: number;
  interjornada: number;
  debitos: number;
  faltas: number;
  atestados: number;
};

const EMPTY: Totals = { he: 0, interjornada: 0, debitos: 0, faltas: 0, atestados: 0 };
const ABSENCE_CODES = ["folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"];

function fmt(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const n = Math.abs(Math.round(minutes || 0));
  return sign + String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
}

export function Comparativos() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [totals, setTotals] = useState<Record<string, Totals>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("employees")
          .select("id,full_name,status")
          .order("full_name");
        if (error) throw error;
        const list = (data ?? []) as Employee[];
        setEmployees(list);
        setSelected(list.filter(e => e.status !== "inativo").map(e => e.id));
      } catch (e: any) {
        setError(e.message ?? "Não foi possível carregar os funcionários.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadComparison(ids: string[]) {
    if (!ids.length) {
      setTotals({});
      return;
    }
    setError("");
    try {
      const db = supabase as any;
      const [historical, overtime, debits, absences, certificates] = await Promise.all([
        db.from("historical_kpi_data")
          .select("employee_id,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
          .in("employee_id", ids),
        db.from("overtime_records")
          .select("employee_id,minutes,launch_type")
          .in("employee_id", ids),
        db.from("bank_hours")
          .select("employee_id,minutes,kind")
          .in("employee_id", ids)
          .eq("kind", "debito"),
        db.from("occurrences")
          .select("employee_id,quantity,unit,occurrence_types!inner(code)")
          .in("employee_id", ids)
          .in("occurrence_types.code", ABSENCE_CODES),
        db.from("medical_certificates")
          .select("employee_id,days")
          .in("employee_id", ids),
      ]);

      for (const result of [historical, overtime, debits, absences, certificates]) {
        if (result.error) throw result.error;
      }

      const next: Record<string, Totals> = {};
      ids.forEach(id => { next[id] = { ...EMPTY }; });

      for (const row of historical.data ?? []) {
        const t = next[row.employee_id];
        if (!t) continue;
        t.he += Number(row.he_60_minutes || 0) + Number(row.he_60_night_minutes || 0) + Number(row.he_100_minutes || 0) + Number(row.he_20_minutes || 0);
        t.interjornada += Number(row.interjornada_minutes || 0);
      }

      for (const row of overtime.data ?? []) {
        const t = next[row.employee_id];
        if (!t) continue;
        if (String(row.launch_type || "").toUpperCase().includes("INTERJORNADA")) t.interjornada += Math.abs(Number(row.minutes) || 0);
        else t.he += Math.abs(Number(row.minutes) || 0);
      }

      for (const row of debits.data ?? []) {
        if (next[row.employee_id]) next[row.employee_id].debitos += Math.abs(Number(row.minutes) || 0);
      }

      for (const row of absences.data ?? []) {
        if (next[row.employee_id]) {
          const quantity = Number(row.quantity || 0);
          // Faltas são cadastradas em dias. Para comparação de horas, usamos 8h por dia.
          next[row.employee_id].faltas += Math.round(quantity * 8 * 60);
        }
      }

      for (const row of certificates.data ?? []) {
        if (next[row.employee_id]) next[row.employee_id].atestados += Math.round(Number(row.days || 0) * 8 * 60);
      }

      setTotals(next);
    } catch (e: any) {
      setError(e.message ?? "Não foi possível carregar os comparativos.");
    }
  }

  useEffect(() => {
    if (!loading) void loadComparison(selected);
  }, [selected, loading]);

  const visibleEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(e => !q || e.full_name.toLowerCase().includes(q));
  }, [employees, search]);

  function toggle(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function selectVisible() {
    setSelected(prev => [...new Set([...prev, ...visibleEmployees.map(e => e.id)])]);
  }

  function clearAll() {
    setSelected([]);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a>
          <b>DP Success · Comparativos</b>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <p className="text-sm text-primary">Gestão</p>
        <h1 className="mt-1 text-3xl font-bold">Comparativos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Compare a vida inteira dos funcionários: horas extras, interjornadas, débitos, faltas e atestados.
        </p>

        {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        <Card className="mt-6 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-semibold">Funcionários para comparar</h2>
              <p className="text-xs text-muted-foreground">{selected.length} selecionado(s)</p>
            </div>
            <div className="flex gap-2">
              <button onClick={selectVisible} className="rounded-lg border px-3 py-2 text-sm">Selecionar exibidos</button>
              <button onClick={clearAll} className="rounded-lg border px-3 py-2 text-sm">Limpar seleção</button>
            </div>
          </div>

          <div className="relative mt-4">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar funcionário..." className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm" />
          </div>

          <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleEmployees.map(employee => (
              <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 hover:bg-muted/40">
                <input type="checkbox" checked={selected.includes(employee.id)} onChange={() => toggle(employee.id)} />
                <span className="truncate text-sm">{employee.full_name}</span>
              </label>
            ))}
          </div>
        </Card>

        <Card className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Funcionário</th>
                <th className="px-5 py-3">Horas extras</th>
                <th className="px-5 py-3">Interjornadas</th>
                <th className="px-5 py-3">Débitos</th>
                <th className="px-5 py-3">Faltas</th>
                <th className="px-5 py-3">Atestados</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {selected.map(id => {
                const employee = employees.find(e => e.id === id);
                const t = totals[id] ?? EMPTY;
                return (
                  <tr key={id}>
                    <td className="px-5 py-4 font-medium">{employee?.full_name ?? "Funcionário"}</td>
                    <td className="px-5 py-4">{fmt(t.he)}</td>
                    <td className="px-5 py-4">{fmt(t.interjornada)}</td>
                    <td className="px-5 py-4">{fmt(t.debitos)}</td>
                    <td className="px-5 py-4">{fmt(t.faltas)}</td>
                    <td className="px-5 py-4">{fmt(t.atestados)}</td>
                  </tr>
                );
              })}
              {!selected.length && <tr><td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">Selecione pelo menos um funcionário.</td></tr>}
            </tbody>
          </table>
        </Card>
      </main>
    </div>
  );
}