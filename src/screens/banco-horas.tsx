import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  employee_id: string;
  name: string;
  department: string;
  opening: number;
  movement: number;
  current: number;
};

export function BankHours() {
  const [rows, setRows] = useState<Row[]>([]);
  const [competence, setCompetence] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    const db = supabase;

    const { data: comps, error: ce } = await db
      .from("competencies")
      .select("id,name,start_date,end_date,status")
      .order("end_date", { ascending: false })
      .limit(1);

    if (ce) {
      setError(ce.message);
      setLoading(false);
      return;
    }

    const comp = comps?.[0];
    setCompetence(comp);

    if (!comp) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: balances, error: be } = await db
      .from("competence_employee_balances")
      .select(
        "employee_id,opening_minutes,credit_minutes,debit_minutes,closing_minutes",
      )
      .eq("competence_id", comp.id);

    if (be) {
      setError(be.message);
      setLoading(false);
      return;
    }

    const { data: emps, error: ee } = await db
      .from("employees")
      .select(
        "id,full_name,initial_bank_minutes,current_bank_minutes,departments(name)",
      )
      .eq("active", true)
      .order("full_name");

    if (ee) {
      setError(ee.message);
      setLoading(false);
      return;
    }

    const balanceByEmployee = new Map<string, any>(
      (balances ?? []).map((b: any) => [b.employee_id, b]),
    );

    const { data: movs, error: me } = await db
      .from("bank_movements")
      .select("employee_id,minutes")
      .eq("competence_id", comp.id);

    if (me) {
      setError(me.message);
      setLoading(false);
      return;
    }

    const movementByEmployee = new Map<string, number>();
    (movs ?? []).forEach((m: any) => {
      movementByEmployee.set(
        m.employee_id,
        (movementByEmployee.get(m.employee_id) ?? 0) + m.minutes,
      );
    });

    setRows(
      (emps ?? []).map((e: any) => {
        const b = balanceByEmployee.get(e.id);
        const movement = movementByEmployee.get(e.id) ?? 0;
        const opening =
          b?.opening_minutes ??
          e.current_bank_minutes ??
          e.initial_bank_minutes ??
          0;
        const current = b?.closing_minutes ?? opening + movement;

        return {
          employee_id: e.id,
          name: e.full_name,
          department: e.departments?.name ?? "—",
          opening,
          movement,
          current,
        };
      }),
    );

    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const totals = useMemo(
    () =>
      rows.reduce(
        (a, r) => ({
          opening: a.opening + r.opening,
          movement: a.movement + r.movement,
          current: a.current + r.current,
        }),
        { opening: 0, movement: 0, current: 0 },
      ),
    [rows],
  );

  const fmt = (v: number) => {
    const sign = v < 0 ? "-" : "+";
    const abs = Math.abs(v);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] justify-between">
          <a
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </a>
          <span className="font-semibold">DP Success · Banco de Horas</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <p className="text-sm font-medium text-primary">Operação</p>
        <h1 className="mt-1 text-3xl font-bold">Banco de Horas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saldo inicial, movimentações da competência e saldo atualizado.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Saldo anterior</p>
            <p className="mt-1 text-2xl font-bold">
              {loading ? "…" : fmt(totals.opening)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Movimentação</p>
            <p className="mt-1 text-2xl font-bold">
              {loading ? "…" : fmt(totals.movement)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs text-muted-foreground">Saldo atual</p>
            <p className="mt-1 text-2xl font-bold">
              {loading ? "…" : fmt(totals.current)}
            </p>
          </Card>
        </div>

        <Card className="mt-6 overflow-hidden">
          <div className="border-b p-5">
            <h2 className="font-display font-bold">Saldo por funcionário</h2>
            <p className="text-xs text-muted-foreground">
              {competence
                ? `${new Date(competence.start_date + "T12:00:00").toLocaleDateString("pt-BR")} → ${new Date(competence.end_date + "T12:00:00").toLocaleDateString("pt-BR")}`
                : "Nenhuma competência cadastrada"}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Funcionário</th>
                  <th className="px-5 py-3">Departamento</th>
                  <th className="px-5 py-3">Saldo anterior</th>
                  <th className="px-5 py-3">Movimentação</th>
                  <th className="px-5 py-3">Saldo atual</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.employee_id}>
                    <td className="px-5 py-4 font-medium">{r.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">
                      {r.department}
                    </td>
                    <td className="px-5 py-4">{fmt(r.opening)}</td>
                    <td className="px-5 py-4">{fmt(r.movement)}</td>
                    <td
                      className={`px-5 py-4 font-bold ${r.current < 0 ? "text-destructive" : "text-primary"}`}
                    >
                      {fmt(r.current)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!loading && rows.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Nenhum funcionário ativo encontrado.
              </div>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}
