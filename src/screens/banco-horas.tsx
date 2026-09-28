import { ChevronDown, ChevronUp, History } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ScreenShell, inputCls } from "@/components/screen-shell";
import { CREDIT_TYPES, fetchPeriods, fetchLaunches, balancesByPeriod, periodRangeLabel, minutesToHours, PERIOD_STATUS_LABEL, type PeriodBalance, type CreditType } from "@/lib/dp-model";

const BALANCE_ITEMS: CreditType[] = ["HE_60", "HE_60_NOTURNO", "HE_100", "HE_100_NOTURNO", "ADICIONAL_NOTURNO"];

export function BankHours() {
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string }>>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [rows, setRows] = useState<PeriodBalance[]>([]);
  const [expanded, setExpanded] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await supabase.from("employees").select("id,full_name").order("full_name");
      if (r.error) setError(r.error.message);
      else { setEmployees(r.data ?? []); if (r.data?.[0]) setEmployeeId(r.data[0].id); }
    })();
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    void (async () => {
      setLoading(true); setError("");
      try {
        const [periods, l] = await Promise.all([fetchPeriods(), fetchLaunches({ employeeId })]);
        setRows(balancesByPeriod(periods, l.credits, l.debits).reverse());
      } catch (e) { setError((e as Error).message); }
      setLoading(false);
    })();
  }, [employeeId]);

  const accumulated = rows[0]?.accumulated ?? 0;
  const cls = (n: number) => n < 0 ? "text-destructive" : "text-primary";

  return (
    <ScreenShell section="Operação" title="Banco de Horas" name="Banco de Horas" subtitle="Saldo por funcionário e competência." error={error}>
      <Card className="mt-6 grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end">
        <label className="grid gap-1.5 text-sm font-medium">Funcionário
          <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            {!employees.length && <option value="">Nenhum funcionário cadastrado</option>}
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </label>
        <div className="text-right"><p className="text-xs text-muted-foreground">Saldo acumulado atual</p><p className={`text-2xl font-bold ${cls(accumulated)}`}>{minutesToHours(accumulated, true)}</p></div>
      </Card>

      <div className="mt-6 space-y-3">
        {loading ? <Card className="p-8 text-center text-muted-foreground">Carregando saldos...</Card>
          : !rows.length ? <Card className="p-8 text-center text-muted-foreground">Nenhuma competência encontrada.</Card>
          : rows.map(r => {
            const open = expanded === r.period.id;
            return (
              <Card key={r.period.id} className="overflow-hidden">
                <button type="button" onClick={() => setExpanded(open ? "" : r.period.id)} className="flex w-full flex-col gap-4 p-5 text-left hover:bg-muted/30 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-lg font-bold">{periodRangeLabel(r.period)}</p>
                    <span className="mt-1 inline-block rounded-full bg-muted px-2.5 py-1 text-xs">{PERIOD_STATUS_LABEL[r.period.status]}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right"><p className="text-xs text-muted-foreground">Saldo do mês</p><p className={`text-xl font-bold ${cls(r.monthBalance)}`}>{minutesToHours(r.monthBalance, true)}</p></div>
                    <div className="text-right"><p className="text-xs text-muted-foreground">Saldo acumulado</p><p className={`font-semibold ${cls(r.accumulated)}`}>{minutesToHours(r.accumulated, true)}</p></div>
                    <div className="text-right"><p className="text-xs text-muted-foreground">Débito / atrasos</p><p className="font-semibold text-destructive">{minutesToHours(-r.composition.debit)}</p></div>
                    {open ? <ChevronUp className="h-5 w-5 text-muted-foreground" /> : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
                  </div>
                </button>
                {open && (
                  <div className="grid gap-3 border-t bg-muted/10 p-5 sm:grid-cols-2 lg:grid-cols-3">
                    {BALANCE_ITEMS.map(k => (
                      <div key={k} className="rounded-xl border bg-background p-4"><p className="text-xs text-muted-foreground">{CREDIT_TYPES[k].label}</p><p className="mt-1 text-lg font-bold">{minutesToHours(r.composition[k])}</p></div>
                    ))}
                    <div className="rounded-xl border border-dashed bg-background p-4">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="h-3.5 w-3.5" /> Interjornada 50% · histórico</p>
                      <p className="mt-1 text-lg font-bold">{minutesToHours(r.composition.INTERJORNADA_50)}</p>
                      <p className="text-[11px] text-muted-foreground">Não entra no saldo.</p>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
      </div>
    </ScreenShell>
  );
}
