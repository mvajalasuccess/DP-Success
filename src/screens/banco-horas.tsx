import { ChevronDown, ChevronUp, History, Plus, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ScreenShell, inputCls } from "@/components/screen-shell";
import { CREDIT_TYPES, balancesByEmployee, periodRangeLabel, minutesToHours, PERIOD_STATUS_LABEL, type PeriodBalance, type CreditType } from "@/lib/dp-model";

const BALANCE_ITEMS: CreditType[] = ["HE_60", "HE_60_NOTURNO", "HE_100", "HE_100_NOTURNO", "ADICIONAL_NOTURNO"];

export function BankHours() {
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string }>>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [rows, setRows] = useState<PeriodBalance[]>([]);
  const [expanded, setExpanded] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentDirection, setAdjustmentDirection] = useState<"credito" | "debito">("credito");
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [adjustmentHours, setAdjustmentHours] = useState("");
  const [adjustmentReason, setAdjustmentReason] = useState("Saldo inicial");
  const [adjustmentJustification, setAdjustmentJustification] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);

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
        setRows((await balancesByEmployee(employeeId)).reverse());
      } catch (e) { setError((e as Error).message); }
      setLoading(false);
    })();
  }, [employeeId]);

  const accumulated = rows[0]?.accumulated ?? 0;
  const cls = (n: number) => n < 0 ? "text-destructive" : "text-primary";

  async function saveAdjustment() {
    if (!employeeId || !adjustmentHours) return;
    const parts = adjustmentHours.split(":");
    const parsedMinutes = Number(parts[0] || 0) * 60 + Number(parts[1] || 0);
    if (!Number.isFinite(parsedMinutes) || parsedMinutes <= 0) {
      setError("Informe um tempo válido no formato HH:MM.");
      return;
    }
    if (!adjustmentJustification.trim()) {
      setError("Informe o motivo do ajuste.");
      return;
    }
    setSavingAdjustment(true);
    setError("");
    try {
      const period = rows.find(r => adjustmentDate >= r.period.start_date && adjustmentDate <= r.period.end_date)?.period;
      const { error: insertError } = await supabase.from("bank_hours").insert({
        employee_id: employeeId,
        period_id: period?.id ?? null,
        entry_date: adjustmentDate,
        kind: "ajuste",
        minutes: parsedMinutes,
        adjustment_direction: adjustmentDirection,
        justification: adjustmentReason + ": " + adjustmentJustification.trim(),
      } as any);
      if (insertError) throw new Error(insertError.message);
      setAdjustmentOpen(false);
      setAdjustmentHours("");
      setAdjustmentJustification("");
      setRows((await balancesByEmployee(employeeId)).reverse());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingAdjustment(false);
    }
  }

  return (
    <ScreenShell section="Operação" title="Banco de Horas" name="Banco de Horas" subtitle="Saldo por funcionário e competência." error={error}>
      <Card className="mt-6 grid gap-4 p-5 md:grid-cols-[1fr_auto_auto] md:items-end">
        <label className="grid gap-1.5 text-sm font-medium">Funcionário
          <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            {!employees.length && <option value="">Nenhum funcionário cadastrado</option>}
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </label>
        <div className="text-right"><p className="text-xs text-muted-foreground">Saldo acumulado atual</p><p className={`text-2xl font-bold ${cls(accumulated)}`}>{minutesToHours(accumulated, true)}</p></div>
        <button type="button" onClick={() => setAdjustmentOpen(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Lançar crédito / débito</button>
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
                    {r.adjustment !== 0 && <div className="text-right"><p className="text-xs text-muted-foreground">Ajuste</p><p className={`font-semibold ${cls(r.adjustment)}`}>{minutesToHours(r.adjustment, true)}</p></div>}
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

      {adjustmentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div><h2 className="text-xl font-bold">Lançar ajuste no Banco de Horas</h2><p className="mt-1 text-sm text-muted-foreground">Saldo anterior, pagamento/zeragem ou correção.</p></div>
              <button type="button" onClick={() => setAdjustmentOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid gap-4">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{employees.find(e => e.id === employeeId)?.full_name ?? "—"}</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium">Tipo<select className={inputCls} value={adjustmentDirection} onChange={e => setAdjustmentDirection(e.target.value as "credito" | "debito")}><option value="credito">Crédito</option><option value="debito">Débito</option></select></label>
                <label className="grid gap-1.5 text-sm font-medium">Data<input type="date" className={inputCls} value={adjustmentDate} onChange={e => setAdjustmentDate(e.target.value)} /></label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">Horas<input type="text" inputMode="numeric" placeholder="Ex.: 12:30" className={inputCls} value={adjustmentHours} onChange={e => setAdjustmentHours(e.target.value)} /></label>
              <label className="grid gap-1.5 text-sm font-medium">Motivo<select className={inputCls} value={adjustmentReason} onChange={e => setAdjustmentReason(e.target.value)}><option>Saldo inicial</option><option>Pagamento de horas</option><option>Correção de saldo</option><option>Outros</option></select></label>
              <label className="grid gap-1.5 text-sm font-medium">Justificativa<textarea className={inputCls} rows={3} placeholder="Ex.: saldo trazido de período anterior / horas pagas no holerite." value={adjustmentJustification} onChange={e => setAdjustmentJustification(e.target.value)} /></label>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setAdjustmentOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={savingAdjustment} onClick={() => void saveAdjustment()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{savingAdjustment ? "Salvando..." : "Salvar ajuste"}</button></div>
            </div>
          </Card>
        </div>
      )}

    </ScreenShell>
  );
}
