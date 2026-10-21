import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, CalendarDays, CircleDollarSign, Clock3, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { ScreenShell, inputCls } from "@/components/screen-shell";
import { supabase } from "@/integrations/supabase/client";
import { balancesByEmployee, fetchLaunches, minutesToHours, type PeriodBalance } from "@/lib/dp-model";

type Period = { id: string; reference_year: number; reference_month: number; start_date: string; end_date: string; status: string };
type Employee = { id: string; full_name: string; salary: number | null; work_schedule_id: string | null; status: string; hire_date: string | null; termination_date: string | null; work_schedules?: { weekly_minutes: number | null } | null };
type PaymentRow = { id: string; employee_id: string; period_id: string | null; entry_date: string; minutes: number; justification: string | null; created_at?: string };
type Detail = { key: string; label: string; minutes: number; multiplier: number };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (value?: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
const todayLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const hhmm = (value: number) => minutesToHours(Math.abs(Math.round(value)));
const isReversed = (row: PaymentRow) => String(row.justification ?? "").startsWith("[ESTORNADO]");

function periodLabel(p: Period) {
  return `${dateBR(p.start_date)} a ${dateBR(p.end_date)}`;
}

export function Payments() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [details, setDetails] = useState<Detail[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [balances, setBalances] = useState<PeriodBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmPayment, setConfirmPayment] = useState(false);
  const [confirmReversal, setConfirmReversal] = useState<PaymentRow | null>(null);

  const period = periods.find(p => p.id === periodId) ?? null;
  const employee = employees.find(e => e.id === employeeId) ?? null;
  const activePayment = payments.find(p => p.employee_id === employeeId && p.period_id === periodId && !isReversed(p));
  // O total de horas pagáveis vem do saldo líquido da competência, não da soma bruta dos créditos.
  // O adicional noturno é exibido e valorizado à parte, mas não compõe o saldo nem o total de horas do banco.
  const totalMinutes = details.filter(item => item.key !== "night").reduce((sum, item) => sum + item.minutes, 0);
  const divisor = employee?.work_schedules?.weekly_minutes ? (Number(employee.work_schedules.weekly_minutes) / 60) * 5 : 220;
  const hourlyRate = Number(employee?.salary || 0) / divisor;
  const totalValue = details.reduce((sum, item) => sum + (item.minutes / 60) * hourlyRate * item.multiplier, 0);
  const balanceForPeriod = balances.find(b => b.period.id === periodId);
  const balanceMinutes = balanceForPeriod?.accumulated ?? 0;

  const loadBase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [periodResult, employeeResult] = await Promise.all([
        supabase.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("start_date", { ascending: false }),
        supabase.from("employees").select("id,full_name,salary,work_schedule_id,status,hire_date,termination_date,work_schedules(weekly_minutes)").order("full_name"),
      ]);
      if (periodResult.error) throw new Error(periodResult.error.message);
      if (employeeResult.error) throw new Error(employeeResult.error.message);
      const nextPeriods = (periodResult.data ?? []) as Period[];
      const nextEmployees = (employeeResult.data ?? []) as unknown as Employee[];
      setPeriods(nextPeriods);
      setEmployees(nextEmployees);
      if (!periodId && nextPeriods[0]) setPeriodId(nextPeriods[0].id);
      if (!employeeId) {
        const active = nextEmployees.find(e => e.status !== "inativo");
        if (active) setEmployeeId(active.id);
        else if (nextEmployees[0]) setEmployeeId(nextEmployees[0].id);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [periodId, employeeId]);

  useEffect(() => { void loadBase(); }, [loadBase]);

  const loadDetails = useCallback(async () => {
    if (!period || !employeeId) {
      setDetails([]);
      setPayments([]);
      setBalances([]);
      return;
    }
    setLoadingDetails(true);
    setError("");
    try {
      const [historicalResult, overrideResult, paymentResult, balanceResult, launchResult] = await Promise.all([
        supabase.from("historical_kpi_data").select("employee_id,period_id,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes").eq("employee_id", employeeId).eq("period_id", period.id).maybeSingle(),
        (supabase as any).from("point_closing_overrides").select("employee_id,period_id,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes").eq("employee_id", employeeId).eq("period_id", period.id).maybeSingle(),
        supabase.from("bank_hours").select("id,employee_id,period_id,entry_date,minutes,justification,created_at").eq("period_id", period.id).eq("kind", "pagamento_he").order("created_at", { ascending: false }),
        balancesByEmployee(employeeId),
        fetchLaunches({ employeeId, start: period.start_date, end: period.end_date }),
      ]);
      if (historicalResult.error) throw new Error(historicalResult.error.message);
      if (overrideResult.error && !String(overrideResult.error.message ?? "").toLowerCase().includes("point_closing_overrides")) throw new Error(overrideResult.error.message);
      if (paymentResult.error) throw new Error(paymentResult.error.message);

      const historical = historicalResult.data as any;
      const override = overrideResult.data as any;
      const source = override ?? historical;
      const credits = launchResult.credits.filter(row => row.reference_date >= period.start_date && row.reference_date <= period.end_date);
      const sumType = (type: string) => credits.filter(row => row.launch_type === type).reduce((sum, row) => sum + Math.abs(Number(row.minutes) || 0), 0);
      const hasHistorical = Boolean(source);
      const periodBalance = balanceResult.find(b => b.period.id === period.id);
      const composition = periodBalance?.composition;
      const grossPayable = [
        hasHistorical ? Number(source.he_60_minutes || 0) : (composition?.HE_60 ?? sumType("HE_60")),
        hasHistorical ? Number(source.he_60_night_minutes || 0) : (composition?.HE_60_NOTURNO ?? sumType("HE_60_NOTURNO")),
        hasHistorical ? Number(source.he_100_minutes || 0) : (composition?.HE_100 ?? sumType("HE_100")),
      ].map(value => Math.max(0, value));
      // Distribui o saldo líquido pelas categorias de HE, descontando débitos primeiro da HE 60%.
      // Se houver saldo manual/ajuste que não esteja detalhado por tipo, a diferença fica na HE 60%.
      const targetPayable = Math.max(0, Number(periodBalance?.monthBalance ?? 0));
      const grossTotal = grossPayable.reduce((sum, value) => sum + value, 0);
      let reduction = Math.max(0, grossTotal - targetPayable);
      const netPayable = [...grossPayable];
      for (const index of [0, 1, 2]) {
        const deducted = Math.min(netPayable[index], reduction);
        netPayable[index] -= deducted;
        reduction -= deducted;
      }
      const remaining = Math.max(0, targetPayable - netPayable.reduce((sum, value) => sum + value, 0));
      netPayable[0] += remaining;
      const nightMinutes = hasHistorical ? Number(source.he_20_minutes || 0) : (composition?.ADICIONAL_NOTURNO ?? sumType("ADICIONAL_NOTURNO"));
      const nextDetails: Detail[] = [
        { key: "he60", label: "Hora extra 60%", minutes: netPayable[0], multiplier: 1.6 },
        { key: "he60night", label: "Hora extra 60% + 20% noturno", minutes: netPayable[1], multiplier: 1.8 },
        { key: "he100", label: "Hora extra 100%", minutes: netPayable[2], multiplier: 2 },
        { key: "night", label: "Adicional noturno 20% (informativo)", minutes: Math.max(0, nightMinutes), multiplier: 0.2 },
      ];
      setDetails(nextDetails);
      setPayments((paymentResult.data ?? []) as PaymentRow[]);
      setBalances(balanceResult);
    } catch (e) {
      setError((e as Error).message);
      setDetails([]);
    } finally {
      setLoadingDetails(false);
    }
  }, [period, employeeId]);

  useEffect(() => { void loadDetails(); }, [loadDetails]);

  async function confirmPay() {
    if (!period || !employee || totalMinutes <= 0) return;
    if (activePayment) {
      setError("Já existe um pagamento ativo para este funcionário nesta competência. Estorne-o antes de registrar outro.");
      setConfirmPayment(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const date = todayLocal();
      const breakdown = details.filter(d => d.minutes > 0).map(d => `${d.label}: ${hhmm(d.minutes)} / ${money((d.minutes / 60) * hourlyRate * d.multiplier)}`).join(" | ");
      const result = await supabase.from("bank_hours").insert({
        employee_id: employee.id,
        period_id: period.id,
        entry_date: date,
        kind: "pagamento_he",
        minutes: totalMinutes,
        adjustment_direction: "debito",
        justification: `Pagamento HE DP SUCCESS | ${periodLabel(period)} | Total: ${hhmm(totalMinutes)} | Valor: ${money(totalValue)} | ${breakdown}`,
        created_by: session.session?.user.id ?? null,
      });
      if (result.error) throw new Error(result.error.message);
      toast.success("Pagamento registrado e horas descontadas do saldo geral.");
      setConfirmPayment(false);
      await loadDetails();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function reversePayment(payment: PaymentRow) {
    if (isReversed(payment) || !period) return;
    setSaving(true);
    setError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const paymentMinutes = Math.abs(Number(payment.minutes) || 0);
      const reversalDate = todayLocal();
      const marker = `[ESTORNO DO PAGAMENTO ${payment.id}]`;
      const creditResult = await supabase.from("bank_hours").insert({
        employee_id: payment.employee_id,
        period_id: payment.period_id,
        entry_date: reversalDate,
        kind: "ajuste",
        minutes: paymentMinutes,
        adjustment_direction: "credito",
        justification: `${marker} Devolução de ${hhmm(paymentMinutes)} ao saldo geral.`,
        created_by: session.session?.user.id ?? null,
      });
      if (creditResult.error) throw new Error(`Não foi possível devolver as horas ao saldo: ${creditResult.error.message}`);
      const updateResult = await supabase.from("bank_hours").update({
        justification: `[ESTORNADO] ${payment.justification ?? "Pagamento de horas extras"}`,
      }).eq("id", payment.id).eq("kind", "pagamento_he");
      if (updateResult.error) {
        setError("As horas foram devolvidas ao saldo, mas não foi possível marcar o pagamento como estornado. Entre em contato com o suporte antes de repetir a operação.");
        return;
      }
      toast.success("Pagamento estornado. As horas foram devolvidas ao saldo e o histórico foi preservado.");
      setConfirmReversal(null);
      await loadDetails();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const history = useMemo(() => payments.filter(p => p.period_id === periodId), [payments, periodId]);

  return (
    <ScreenShell section="Fechamento de Ponto" title="Pagamentos" name="Pagamentos" subtitle="Calcule o valor das horas extras, registre o pagamento e desconte somente o total de horas do saldo geral." error={error}>
      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.72fr)]">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></div>
            <div><h2 className="font-display text-base font-semibold">Dados do pagamento</h2><p className="mt-1 text-sm text-muted-foreground">Selecione a competência e o funcionário para consultar as horas e os valores.</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">Competência
              <select className={inputCls} value={periodId} onChange={e => setPeriodId(e.target.value)} disabled={loading}>
                <option value="">Selecione a competência</option>
                {periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">Funcionário
              <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)} disabled={loading}>
                <option value="">Selecione o funcionário</option>
                {employees.filter(e => (!period || !e.hire_date || e.hire_date <= period.end_date) && (!period || !e.termination_date || e.termination_date >= period.start_date)).map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </label>
          </div>
          {employee && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
            <div><p className="text-xs text-muted-foreground">Salário base cadastrado</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(Number(employee.salary || 0))}</p></div>
            <div className="text-right"><p className="text-xs text-muted-foreground">Divisor da jornada</p><p className="mt-1 text-lg font-semibold tabular-nums">{divisor}h</p></div>
          </div>}
          <div className="mt-6 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Composição das horas e valores</h3>
            <span className="text-xs text-muted-foreground">Valores estimados pelo salário cadastrado</span>
          </div>
          <div className="mt-3 overflow-hidden rounded-xl border">
            <div className="grid grid-cols-[minmax(0,1fr)_82px_112px] gap-2 bg-muted/50 px-3 py-3 text-xs font-semibold text-muted-foreground sm:grid-cols-[minmax(0,1fr)_100px_130px] sm:px-4"><span>Tipo de hora</span><span className="text-right">Horas</span><span className="text-right">Valor</span></div>
            {loadingDetails ? <div className="p-6 text-center text-sm text-muted-foreground">Carregando composição...</div> : details.map(item => <div key={item.key} className="grid grid-cols-[minmax(0,1fr)_82px_112px] items-center gap-2 border-t px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_100px_130px] sm:px-4"><span className="font-medium">{item.label}</span><span className="text-right font-mono tabular-nums">{hhmm(item.minutes)}</span><span className="text-right font-semibold tabular-nums">{money((item.minutes / 60) * hourlyRate * item.multiplier)}</span></div>)}
            <div className="grid grid-cols-[minmax(0,1fr)_82px_112px] items-center gap-2 border-t bg-muted/40 px-3 py-4 text-sm font-bold sm:grid-cols-[minmax(0,1fr)_100px_130px] sm:px-4"><span>Total do pagamento</span><span className="text-right font-mono tabular-nums">{hhmm(totalMinutes)}</span><span className="text-right tabular-nums">{money(totalValue)}</span></div>
          </div>
          {employee && balanceForPeriod && <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm"><WalletCards className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><span className="font-semibold">Saldo do mês (líquido):</span> <span className="font-mono">{hhmm(balanceForPeriod.monthBalance)}</span><p className="mt-1 text-xs text-muted-foreground">O saldo já considera os débitos da competência. O adicional noturno é exibido à parte e não aumenta as horas a pagar.</p></div></div>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" />O histórico será mantido; o saldo será debitado pelo total de horas.</div>
            <button type="button" onClick={() => setConfirmPayment(true)} disabled={!period || !employee || totalMinutes <= 0 || loadingDetails || saving || Boolean(activePayment) || isConsultaOnly()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"><CircleDollarSign className="h-4 w-4" />{activePayment ? "Pagamento já registrado" : "Confirmar pagamento"}</button>
          </div>
          {activePayment && <p className="mt-2 text-xs text-amber-700">Já existe um pagamento ativo para esta competência e funcionário. Para corrigir, utilize o estorno no histórico abaixo.</p>}
          {confirmPayment && <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4"><p className="font-semibold">Confirmar pagamento?</p><p className="mt-1 text-sm text-muted-foreground">Serão registrados {hhmm(totalMinutes)} e {money(totalValue)} para {employee?.full_name}. O saldo geral será debitado em {hhmm(totalMinutes)}; os cálculos históricos não serão recalculados.</p><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setConfirmPayment(false)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button><button type="button" onClick={() => void confirmPay()} disabled={saving} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Registrando..." : "Sim, confirmar"}</button></div></div>}
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Clock3 className="h-5 w-5" /></div><div><h2 className="font-display font-semibold">Resumo</h2><p className="text-xs text-muted-foreground">Visão consolidada deste pagamento</p></div></div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Total de horas</p><p className="mt-2 text-2xl font-bold tabular-nums">{hhmm(totalMinutes)}</p></div>
              <div className="rounded-xl border p-4"><p className="text-xs text-muted-foreground">Valor total</p><p className="mt-2 text-xl font-bold tabular-nums">{money(totalValue)}</p></div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">O sistema mantém o detalhamento por tipo de hora, mas lança apenas um débito equivalente ao total pago no Banco de Horas.</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground"><BadgeCheck className="h-5 w-5" /></div><div><h2 className="font-display font-semibold">Histórico de pagamentos</h2><p className="text-xs text-muted-foreground">{period ? periodLabel(period) : "Selecione uma competência"}</p></div></div>
            <div className="mt-4 space-y-3">
              {!history.length ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Nenhum pagamento registrado nesta competência.</p> : history.map(payment => <div key={payment.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold">{employees.find(e => e.id === payment.employee_id)?.full_name ?? "Funcionário"}</p><p className="mt-1 text-xs text-muted-foreground">{dateBR(payment.entry_date)} · {hhmm(payment.minutes)}</p><p className="mt-1 text-sm font-semibold tabular-nums">{payment.justification?.match(/Valor: (R\$\s*[\d.,]+)/)?.[1] ?? "Valor não informado"}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${isReversed(payment) ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>{isReversed(payment) ? "Estornado" : "Pago"}</span></div>
                {payment.employee_id === employeeId && !isReversed(payment) && <button type="button" onClick={() => setConfirmReversal(payment)} disabled={saving || isConsultaOnly()} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />Estornar pagamento</button>}
              </div>)}
            </div>
          </Card>
        </div>
      </div>
      {confirmReversal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"><div className="w-full max-w-md rounded-2xl border bg-background p-6 shadow-xl"><h2 className="font-display text-lg font-semibold">Estornar pagamento?</h2><p className="mt-2 text-sm text-muted-foreground">As {hhmm(confirmReversal.minutes)} serão devolvidas ao saldo geral. O registro original permanecerá no histórico como estornado.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setConfirmReversal(null)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button><button type="button" onClick={() => void reversePayment(confirmReversal)} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"><RotateCcw className="h-4 w-4" />{saving ? "Estornando..." : "Confirmar estorno"}</button></div></div></div>}
    </ScreenShell>
  );
}

function isConsultaOnly() {
  return typeof document !== "undefined" && document.body.classList.contains("role-consulta");
}
