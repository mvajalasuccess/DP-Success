import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight, History, Plus, X, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ScreenShell, inputCls } from "@/components/screen-shell";
import { CREDIT_TYPES, balancesByEmployee, periodRangeLabel, minutesToHours, formatDateBR, PERIOD_STATUS_LABEL, type PeriodBalance, type CreditType } from "@/lib/dp-model";

const BALANCE_ITEMS: CreditType[] = ["HE_60", "HE_60_NOTURNO", "HE_100", "HE_100_NOTURNO", "ADICIONAL_NOTURNO"];

export function BankHours() {
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string; status?: string }>>([]);
  const [statusFilter, setStatusFilter] = useState<"ativo" | "inativo" | "todos">("ativo");
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
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [editingAdjustment, setEditingAdjustment] = useState<any | null>(null);
  const [confirmAdjustmentDelete, setConfirmAdjustmentDelete] = useState<string | null>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentHours, setPaymentHours] = useState("");
  const [paymentJustification, setPaymentJustification] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any | null>(null);
  const [confirmPaymentDelete, setConfirmPaymentDelete] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await supabase.from("employees").select("id,full_name,status").order("full_name");
      if (r.error) setError(r.error.message);
      else { setEmployees(r.data ?? []); const active = (r.data ?? []).find((e: any) => e.status !== "inativo"); if (active) setEmployeeId(active.id); else if (r.data?.[0]) setEmployeeId(r.data[0].id); }
    })();
  }, []);

  async function loadBankData() {
    if (!employeeId) return;
    setLoading(true); setError("");
    try {
      const [balanceRows, adjustmentRows, paymentRows] = await Promise.all([
        balancesByEmployee(employeeId),
        supabase.from("bank_hours").select("id,entry_date,minutes,adjustment_direction,justification,period_id").eq("employee_id", employeeId).eq("kind", "ajuste").order("entry_date", { ascending: false }),
        supabase.from("bank_hours").select("id,entry_date,minutes,justification,period_id").eq("employee_id", employeeId).eq("kind", "pagamento_he").order("entry_date", { ascending: false }),
      ]);
      if (adjustmentRows.error) throw new Error(adjustmentRows.error.message);
      if (paymentRows.error) throw new Error(paymentRows.error.message);
      const orderedRows = [...balanceRows].reverse();
      setRows(orderedRows);
      setAdjustments(adjustmentRows.data ?? []);
      setPayments(paymentRows.data ?? []);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }

  useEffect(() => { void loadBankData(); }, [employeeId]);

  const visibleEmployees = employees.filter(e => statusFilter === "todos" || (statusFilter === "ativo" ? e.status !== "inativo" : e.status === "inativo"));

  function goToPreviousEmployee() {
    if (!visibleEmployees.length) return;
    const currentIndex = visibleEmployees.findIndex(e => e.id === employeeId);
    const previousIndex = currentIndex <= 0 ? visibleEmployees.length - 1 : currentIndex - 1;
    setEmployeeId(visibleEmployees[previousIndex].id);
  }

  function goToNextEmployee() {
    if (!visibleEmployees.length) return;
    const currentIndex = visibleEmployees.findIndex(e => e.id === employeeId);
    const nextIndex = currentIndex < 0 || currentIndex >= visibleEmployees.length - 1 ? 0 : currentIndex + 1;
    setEmployeeId(visibleEmployees[nextIndex].id);
  }

  const accumulated = rows[0]?.accumulated ?? 0;
  const firstPeriod = rows[rows.length - 1]?.period;
  const cls = (n: number) => n < 0 ? "text-destructive" : "text-primary";

  function openAdjustmentNew() {
    setEditingAdjustment(null);
    setAdjustmentDirection("credito");
    const targetPeriod = rows.find(r => r.period.status === "aberto") ?? rows[0];
    setAdjustmentDate(targetPeriod?.period.end_date ?? new Date().toISOString().slice(0, 10));
    setAdjustmentHours("");
    setAdjustmentReason("Saldo inicial");
    setAdjustmentJustification("");
    setAdjustmentOpen(true);
  }

  function openPaymentNew() {
    setEditingPayment(null);
    const targetPeriod = rows.find(r => r.period.status === "aberto") ?? rows[0];
    setPaymentDate(targetPeriod?.period.end_date ?? new Date().toISOString().slice(0, 10));
    setPaymentHours("");
    setPaymentJustification("");
    setError("");
    setPaymentOpen(true);
  }

  function openPaymentEdit(payment: any) {
    setEditingPayment(payment);
    setPaymentDate(payment.entry_date ?? new Date().toISOString().slice(0, 10));
    setPaymentHours(minutesToHours(Math.abs(Number(payment.minutes || 0))));
    setPaymentJustification(payment.justification ?? "");
    setError("");
    setPaymentOpen(true);
  }

  async function savePayment() {
    if (!employeeId || !paymentHours) return;
    const parsed = parseSignedHours(paymentHours);
    if (parsed === null || parsed <= 0) {
      setError("Informe as horas pagas no formato HH:MM, sem sinal negativo.");
      return;
    }
    setSavingPayment(true);
    setError("");
    try {
      const target = rows.find(r => paymentDate >= r.period.start_date && paymentDate <= r.period.end_date)?.period;
      if (!target) {
        setError("A data do pagamento precisa estar dentro de uma competência existente.");
        return;
      }
      const payload = {
        employee_id: employeeId,
        entry_date: paymentDate,
        period_id: target.id,
        kind: "pagamento_he" as const,
        minutes: Math.abs(parsed),
        adjustment_direction: "debito" as const,
        justification: paymentJustification.trim() || "Pagamento de horas extras",
      };
      const result = editingPayment
        ? await supabase.from("bank_hours").update(payload).eq("id", editingPayment.id)
        : await supabase.from("bank_hours").insert(payload);
      if (result.error) throw new Error(result.error.message);
      setPaymentOpen(false);
      setEditingPayment(null);
      setPaymentHours("");
      setPaymentJustification("");
      await loadBankData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingPayment(false);
    }
  }

  async function deletePayment(id: string) {
    setSavingPayment(true);
    setError("");
    try {
      const result = await supabase.from("bank_hours").delete().eq("id", id).eq("kind", "pagamento_he");
      if (result.error) throw new Error(result.error.message);
      setConfirmPaymentDelete(null);
      await loadBankData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingPayment(false);
    }
  }

  function openAdjustmentEdit(a: any) {
    setEditingAdjustment(a);
    setAdjustmentDirection(a.adjustment_direction === "debito" ? "debito" : "credito");
    setAdjustmentDate(a.entry_date ?? new Date().toISOString().slice(0, 10));
    setAdjustmentHours(minutesToHours(Math.abs(Number(a.minutes || 0))));
    const full = String(a.justification ?? "");
    const parts = full.split(": ");
    setAdjustmentReason(parts.shift() || "Correção de saldo");
    setAdjustmentJustification(parts.join(": "));
    setAdjustmentOpen(true);
  }

  function parseSignedHours(value: string) {
    const match = value.trim().match(/^([+-])?(\d+):(\d{2})$/);
    if (!match) return null;
    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60) return null;
    return sign * (hours * 60 + minutes);
  }

  async function saveAdjustment() {
    if (!employeeId || !adjustmentHours) return;
    const parsed = parseSignedHours(adjustmentHours);
    if (parsed === null || parsed === 0) {
      setError("Informe um tempo válido no formato HH:MM, podendo usar -HH:MM.");
      return;
    }
    if (!adjustmentJustification.trim()) {
      setError("Informe o motivo do ajuste.");
      return;
    }
    const direction = parsed < 0 ? "debito" : adjustmentDirection;
    const minutes = Math.abs(parsed);
    setSavingAdjustment(true);
    setError("");
    try {
      const period = rows.find(r => adjustmentDate >= r.period.start_date && adjustmentDate <= r.period.end_date)?.period;
      const isPriorBalance = Boolean(firstPeriod && adjustmentDate < firstPeriod.start_date);
      if (!period && !isPriorBalance) {
        setError("A data do ajuste precisa estar dentro de uma competência existente ou ser anterior à primeira competência para representar saldo anterior.");
        return;
      }
      const payload = {
        employee_id: employeeId,
        period_id: period?.id ?? null,
        entry_date: adjustmentDate,
        kind: "ajuste" as const,
        minutes,
        adjustment_direction: direction,
        justification: adjustmentReason + ": " + adjustmentJustification.trim(),
      };
      const result = editingAdjustment
        ? await supabase.from("bank_hours").update(payload).eq("id", editingAdjustment.id)
        : await supabase.from("bank_hours").insert(payload);
      if (result.error) throw new Error(result.error.message);
      setAdjustmentOpen(false);
      setEditingAdjustment(null);
      setAdjustmentHours("");
      setAdjustmentJustification("");
      await loadBankData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function deleteAdjustment(id: string) {
    setSavingAdjustment(true);
    setError("");
    try {
      const result = await supabase.from("bank_hours").delete().eq("id", id);
      if (result.error) throw new Error(result.error.message);
      setConfirmAdjustmentDelete(null);
      await loadBankData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingAdjustment(false);
    }
  }

  return (
    <ScreenShell section="Operação" title="Banco de Horas" name="Banco de Horas" subtitle="Saldo por funcionário e competência." error={error}>

      <Card className="mt-6 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid w-[150px] gap-1.5 text-sm font-medium">Status
            <select className={inputCls} value={statusFilter} onChange={e => {
              const next = e.target.value as "ativo" | "inativo" | "todos";
              setStatusFilter(next);
              const first = employees.find(x => next === "todos" || (next === "ativo" ? x.status !== "inativo" : x.status === "inativo"));
              setEmployeeId(first?.id ?? "");
            }}>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <div className="grid min-w-0 w-full max-w-[760px] flex-1 mx-auto gap-1.5 text-sm font-medium">
            <span>Funcionário</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={goToPreviousEmployee} disabled={visibleEmployees.length < 2} title="Funcionário anterior" aria-label="Funcionário anterior" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <select className={inputCls + " min-w-0 flex-1"} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                {!visibleEmployees.length && <option value="">Nenhum funcionário neste filtro</option>}
                {visibleEmployees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
              <button type="button" onClick={goToNextEmployee} disabled={visibleEmployees.length < 2} title="Próximo funcionário" aria-label="Próximo funcionário" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="ml-auto text-right"><p className="text-xs text-muted-foreground">Saldo disponível atual</p><p className={"text-2xl font-bold " + cls(accumulated)}>{minutesToHours(accumulated, true)}</p></div>
          <div className="flex gap-2">
            <button type="button" onClick={openAdjustmentNew} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold"><Plus className="h-4 w-4" /> Novo ajuste</button>
            <button type="button" onClick={openPaymentNew} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Registrar pagamento de HE</button>
          </div>
        </div>
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
                    <div className="text-right"><p className="text-xs text-muted-foreground">Saldo disponível</p><p className={`font-semibold ${cls(r.accumulated)}`}>{minutesToHours(r.accumulated, true)}</p></div>
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
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><History className="h-3.5 w-3.5" /> Interjornada · informativo</p>
                      <p className="mt-1 text-lg font-bold">{minutesToHours(r.composition.INTERJORNADA_50)}</p>
                      <p className="text-[11px] text-muted-foreground">Não entra no saldo.</p>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
      </div>

      <Card className="mt-6 border-dashed p-5">
        <div><h2 className="font-bold">Movimentações separadas</h2><p className="text-sm text-muted-foreground">Ajustes e correções alteram o saldo disponível, mas ficam separados das movimentações das competências.</p></div>
        {adjustments.length ? <div className="mt-4 space-y-2">{adjustments.map(a => { const value = a.adjustment_direction === "debito" ? -Math.abs(Number(a.minutes || 0)) : Math.abs(Number(a.minutes || 0)); return <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><span className="font-medium">{formatDateBR(a.entry_date)}</span><span className={`ml-3 font-semibold ${cls(value)}`}>{minutesToHours(value, true)}</span><span className="ml-3 text-muted-foreground">{a.justification ?? "Ajuste"}</span></div><div className="flex gap-2"><button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => openAdjustmentEdit(a)}><Pencil className="inline h-3 w-3" /> Editar</button>{confirmAdjustmentDelete === a.id ? <><button type="button" className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive" disabled={savingAdjustment} onClick={() => void deleteAdjustment(a.id)}>Confirmar exclusão</button><button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => setConfirmAdjustmentDelete(null)}>Cancelar</button></> : <button type="button" className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive" onClick={() => setConfirmAdjustmentDelete(a.id)}><Trash2 className="inline h-3 w-3" /> Excluir</button>}</div></div>; })}</div> : <p className="mt-4 text-sm text-muted-foreground">Nenhum ajuste registrado.</p>}
        {payments.length ? <div className="mt-6 space-y-2"><p className="text-sm font-semibold">Pagamentos de HE</p>{payments.map(p => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"><div><span className="font-medium">{formatDateBR(p.entry_date)}</span><span className="ml-3 font-semibold text-destructive">-{minutesToHours(Number(p.minutes || 0))}</span><span className="ml-3 text-muted-foreground">{p.justification ?? "Pagamento de horas extras"}</span></div><div className="flex gap-2"><button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => openPaymentEdit(p)}><Pencil className="inline h-3 w-3" /> Editar</button>{confirmPaymentDelete === p.id ? <><button type="button" className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive" disabled={savingPayment} onClick={() => void deletePayment(p.id)}>Confirmar exclusão</button><button type="button" className="rounded-md border px-2 py-1 text-xs" onClick={() => setConfirmPaymentDelete(null)}>Cancelar</button></> : <button type="button" className="rounded-md border border-destructive/30 px-2 py-1 text-xs text-destructive" onClick={() => setConfirmPaymentDelete(p.id)}><Trash2 className="inline h-3 w-3" /> Excluir</button>}</div></div>)}</div> : <p className="mt-4 text-sm text-muted-foreground">Nenhum pagamento de HE registrado.</p>}
      </Card>

      {paymentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-lg p-6 shadow-xl">
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{editingPayment ? "Editar pagamento de HE" : "Registrar pagamento de HE"}</h2><p className="mt-1 text-sm text-muted-foreground">O pagamento não altera o saldo da competência original; apenas reduz o saldo disponível acumulado.</p></div><button type="button" onClick={() => setPaymentOpen(false)}><X className="h-5 w-5" /></button></div>
            <div className="mt-5 grid gap-4">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">{employees.find(e => e.id === employeeId)?.full_name ?? "—"}</div>
              <label className="grid gap-1.5 text-sm font-medium">Data do pagamento<input type="date" className={inputCls} value={paymentDate} onChange={e => setPaymentDate(e.target.value)} /></label>
              <label className="grid gap-1.5 text-sm font-medium">Horas pagas<input type="text" inputMode="numeric" placeholder="Ex.: 20:00" className={inputCls} value={paymentHours} onChange={e => setPaymentHours(e.target.value)} /></label>
              <label className="grid gap-1.5 text-sm font-medium">Observação<textarea className={inputCls} rows={3} placeholder="Ex.: pagamento das horas extras da competência de julho." value={paymentJustification} onChange={e => setPaymentJustification(e.target.value)} /></label>
              <div className="flex justify-end gap-2"><button type="button" onClick={() => setPaymentOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" disabled={savingPayment} onClick={() => void savePayment()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{savingPayment ? "Salvando..." : editingPayment ? "Salvar alterações" : "Registrar pagamento"}</button></div>
            </div>
          </Card>
        </div>
      )}

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
