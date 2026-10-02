import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { ScreenShell, Modal, inputCls, btnPrimary, btnOutline, btnDanger } from "@/components/screen-shell";
import {
  CREDIT_TYPES, CREDIT_TYPE_KEYS, type CreditType, type Period, type CreditRow, type DebitRow,
  fetchPeriods, fetchLaunches, periodForDate, periodRangeLabel, hoursToMinutes, minutesToHours,
  formatDateBR, composeMinutes, creditTotal, balanceOf,
} from "@/lib/dp-model";

type Employee = { id: string; full_name: string; status?: string; hire_date?: string | null; termination_date?: string | null };
type Group = { key: string; groupId: string | null; employee_id: string; date: string; credits: CreditRow[]; debits: DebitRow[] };
type Line = { type: CreditType; hours: string };

export function Launches() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [periodId, setPeriodId] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [debits, setDebits] = useState<DebitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<Line[]>([{ type: "HE_60", hours: "00:00" }]);
  const [debitHours, setDebitHours] = useState("00:00");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const period = periods.find(p => p.id === periodId) ?? null;
  const employeesInPeriod = useMemo(() => {
    if (!period) return [];
    return employees.filter(e =>
      (!e.hire_date || e.hire_date <= period.end_date) &&
      (!e.termination_date || e.termination_date >= period.start_date)
    );
  }, [employees, period]);

  async function loadBase() {
    try {
      const [emps, ps] = await Promise.all([
        supabase.from("employees").select("id,full_name,status,hire_date,termination_date").order("full_name"),
        fetchPeriods(),
      ]);
      if (emps.error) throw new Error(emps.error.message);
      setEmployees(emps.data ?? []);
      setPeriods(ps);
      if (!periodId && ps[0]) setPeriodId(ps[0].id);
      if (!ps.length) setLoading(false);
    } catch (e) { setError((e as Error).message); setLoading(false); }
  }
  async function loadLaunches() {
    if (!period) return;
    setLoading(true); setError("");
    try {
      const r = await fetchLaunches(employeeFilter ? { start: period.start_date, end: period.end_date, employeeId: employeeFilter } : { start: period.start_date, end: period.end_date });
      setCredits(r.credits); setDebits(r.debits);
    } catch (e) { setError((e as Error).message); }
    setLoading(false);
  }
  useEffect(() => { void loadBase(); }, []);
  useEffect(() => {
    if (!period) return;
    if (employeeFilter && !employeesInPeriod.some(e => e.id === employeeFilter)) {
      setEmployeeFilter("");
      return;
    }
    void loadLaunches();
  }, [periodId, employeeFilter, employeesInPeriod]);

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    const importedToken = (value?: string | null) => value?.match(/\[PDF_IMPORT:[^\]]+\]/)?.[0] ?? null;
    const add = (key: string, groupId: string | null, employee_id: string, d: string) => {
      let g = map.get(key);
      if (!g) { g = { key, groupId, employee_id, date: d, credits: [], debits: [] }; map.set(key, g); }
      return g;
    };

    // Importações antigas não tinham launch_group_id porque a coluna é UUID.
    // Para elas usamos a fingerprint gravada nas observações/justificativa para
    // reconstruir o lançamento completo (crédito + débito + resumos) como um único grupo.
    credits.forEach(c => {
      const token = importedToken(c.notes);
      const key = c.launch_group_id ?? (token ? `import:${token}:${c.employee_id}:${c.reference_date}` : c.id);
      add(key, c.launch_group_id ?? null, c.employee_id, c.reference_date).credits.push(c);
    });
    debits.forEach(d => {
      const token = importedToken(d.justification);
      const key = d.launch_group_id ?? (token ? `import:${token}:${d.employee_id}:${d.entry_date}` : d.id);
      add(key, d.launch_group_id ?? null, d.employee_id, d.entry_date).debits.push(d);
    });
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [credits, debits]);
  const names = new Map(employees.map(e => [e.id, e.full_name]));

  function openNew() {
    setEditing(null); setEmployeeId(employeeFilter); setDate(period?.end_date ?? "");
    setLines([{ type: "HE_60", hours: "00:00" }]); setDebitHours("00:00"); setError(""); setOpen(true);
  }
  function openEdit(g: Group) {
    setEditing(g); setEmployeeId(g.employee_id); setDate(g.date);
    const ls = g.credits.map(c => ({ type: c.launch_type, hours: minutesToHours(c.minutes) }));
    setLines(ls.length ? ls : [{ type: "HE_60", hours: "00:00" }]);
    setDebitHours(minutesToHours(g.debits.reduce((s, d) => s + Math.abs(d.minutes), 0)));
    setError(""); setOpen(true);
  }

  // Na tela de Lançamentos, HE 60% + 20% entra no saldo das competências
  // atuais (ago/2026 em diante), mas não no histórico importado de jan-jul.
  function launchCreditTotal(comp: ReturnType<typeof composeMinutes>, launchDate?: string) {
    const includeHe60Night = Boolean(launchDate && launchDate > "2026-07-20");
    return creditTotal(comp) + (includeHe60Night ? comp.HE_60_NOTURNO : 0);
  }

  function launchBalance(comp: ReturnType<typeof composeMinutes>, launchDate?: string) {
    return launchCreditTotal(comp, launchDate) - comp.debit;
  }

  const preview = composeMinutes(lines.map(l => ({ launch_type: l.type, minutes: hoursToMinutes(l.hours) })), [{ minutes: hoursToMinutes(debitHours) }]);

  async function removeGroup(g: Group) {
    const cIds = g.credits.map(c => c.id), dIds = g.debits.map(d => d.id);
    if (cIds.length) { const r = await supabase.from("overtime_records").delete().in("id", cIds); if (r.error) throw new Error(r.error.message); }
    if (dIds.length) { const r = await supabase.from("bank_hours").delete().in("id", dIds); if (r.error) throw new Error(r.error.message); }
  }
  function isClosed(d: string) { return periodForDate(periods, d)?.status === "fechado"; }

  async function save() {
    setError("");
    if (!employeeId || !date) return setError("Selecione o funcionário e a data.");
    const target = periodForDate(periods, date);
    if (!target) return setError("Não existe competência cadastrada que contenha esta data. Crie o fechamento em Fechamento de Ponto.");
    if (target.status === "fechado" && !editing) return setError("A competência desta data está fechada. Reabra-a para criar novos lançamentos.");
    const valid = lines.map(l => ({ type: l.type, minutes: hoursToMinutes(l.hours) })).filter(l => l.minutes > 0);
    const debit = hoursToMinutes(debitHours);
    if (!valid.length && debit <= 0) return setError("Informe ao menos um crédito ou débito.");

    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      // Grupos importados antigos podem ter uma chave textual derivada da
      // fingerprint. Ao editar, criamos um UUID novo para o grupo persistido.
      const groupId = editing?.groupId ?? crypto.randomUUID();
      if (editing) await removeGroup(editing);
      if (valid.length) {
        const r = await supabase.from("overtime_records").insert(valid.map(l => ({
          employee_id: employeeId, reference_date: date, period_id: target.id, minutes: l.minutes,
          launch_type: l.type, rate_percent: CREDIT_TYPES[l.type].ratePercent, launch_group_id: groupId, notes: CREDIT_TYPES[l.type].label,
        })));
        if (r.error) throw new Error(r.error.message);
      }
      if (debit > 0) {
        const r = await supabase.from("bank_hours").insert({
          employee_id: employeeId, entry_date: date, period_id: target.id, kind: "debito", minutes: debit,
          previous_balance_minutes: 0, balance_minutes: 0, justification: "Débito / atraso", launch_group_id: groupId, created_by: auth.user?.id ?? null,
        });
        if (r.error) throw new Error(r.error.message);
      }
      setOpen(false);
      await loadLaunches();
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  }

  async function doDelete(g: Group) {
    setSaving(true);
    try { await removeGroup(g); setConfirmDelete(null); await loadLaunches(); } catch (e) { setError((e as Error).message); }
    setSaving(false);
  }

  return (
    <ScreenShell section="Operação" title="Lançamentos" name="Lançamentos" subtitle="Créditos e débitos do banco de horas por funcionário e data."
      error={open ? "" : error}
      actions={<button className={btnPrimary} disabled={!periods.length} onClick={openNew}><Plus className="h-4 w-4" /> Novo lançamento</button>}>
      <Card className="mt-6 grid gap-4 p-5 md:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-medium">Competência
          <select className={inputCls} value={periodId} onChange={e => setPeriodId(e.target.value)}>
            {!periods.length && <option value="">Nenhuma competência cadastrada</option>}
            {periods.map(p => <option key={p.id} value={p.id}>{periodRangeLabel(p)} · {p.status === "fechado" ? "Fechado" : "Aberto"}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">Funcionário
          <select className={inputCls} value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}>
            <option value="">Todos</option>
            {employeesInPeriod.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </label>
      </Card>

      <div className="mt-6 space-y-3">
        {loading ? <Card className="p-8 text-center text-muted-foreground">Carregando lançamentos...</Card>
          : !periods.length ? <Card className="p-8 text-center text-muted-foreground">Cadastre uma competência em Fechamento de Ponto antes de lançar.</Card>
          : !groups.length ? <Card className="p-8 text-center text-muted-foreground">Nenhum lançamento nesta competência.</Card>
          : groups.map(g => {
            const comp = composeMinutes(g.credits, g.debits);
            const closed = isClosed(g.date);
            return (
              <Card key={g.key} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                  <div className="flex-1">
                    <p className="font-semibold">{names.get(g.employee_id) ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{formatDateBR(g.date)}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {g.credits.map(c => <span key={c.id} className="rounded-full bg-primary/10 px-2 py-1 text-primary">{CREDIT_TYPES[c.launch_type]?.label ?? c.launch_type}: {minutesToHours(c.minutes)}</span>)}
                      {comp.debit > 0 && <span className="rounded-full bg-destructive/10 px-2 py-1 text-destructive">Débito: {minutesToHours(comp.debit)}</span>}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-xs text-muted-foreground">Crédito {minutesToHours(launchCreditTotal(comp, g.date))} · Débito {minutesToHours(comp.debit)}</p>
                    <p className={`text-lg font-bold ${balanceOf(comp) < 0 ? "text-destructive" : "text-primary"}`}>Saldo {minutesToHours(launchBalance(comp, g.date), true)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className={btnOutline} disabled={saving} onClick={() => openEdit(g)}><Pencil className="h-3.5 w-3.5" /> Editar</button>
                    {confirmDelete === g.key ? (
                      <>
                        <button className={btnDanger} disabled={saving} onClick={() => void doDelete(g)}>Confirmar exclusão</button>
                        <button className={btnOutline} onClick={() => setConfirmDelete(null)}>Cancelar</button>
                      </>
                    ) : <button className={btnDanger} disabled={saving} onClick={() => setConfirmDelete(g.key)}><Trash2 className="h-3.5 w-3.5" /> Excluir</button>}
                  </div>
                </div>
              </Card>
            );
          })}
      </div>

      {open && (
        <Modal title={editing ? "Editar lançamento" : "Novo lançamento"} onClose={() => setOpen(false)}
          footer={<><button className={btnOutline} onClick={() => setOpen(false)}>Cancelar</button><button className={btnPrimary} disabled={saving} onClick={() => void save()}>{saving ? "Salvando..." : "Salvar"}</button></>}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium">Funcionário
              <select className={inputCls} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                <option value="">Selecione</option>
                {employeesInPeriod.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium">Data
              <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} />
            </label>
          </div>
          {date && <p className="mt-2 text-xs text-muted-foreground">{periodForDate(periods, date) ? `Competência: ${periodRangeLabel(periodForDate(periods, date)!)}` : "Nenhuma competência contém esta data."}</p>}

          <div className="mt-5">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">1. Crédito</p>
              <button type="button" className={btnOutline} onClick={() => setLines(ls => [...ls, { type: "ADICIONAL_NOTURNO", hours: "00:00" }])}><Plus className="h-3.5 w-3.5" /> Adicionar tipo</button></div>
            <div className="mt-2 space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_36px] gap-2">
                  <select className={inputCls} value={l.type} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, type: e.target.value as CreditType } : x))}>
                    {CREDIT_TYPE_KEYS.map(k => <option key={k} value={k}>{CREDIT_TYPES[k].label}</option>)}
                  </select>
                  <input className={inputCls} placeholder="HH:MM" value={l.hours} onChange={e => setLines(ls => ls.map((x, j) => j === i ? { ...x, hours: e.target.value } : x))} />
                  <button type="button" disabled={i === 0} className="text-muted-foreground disabled:opacity-30" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-5">
            <p className="text-sm font-semibold">2. Débito</p>
            <input className={`${inputCls} mt-2 max-w-[160px]`} placeholder="HH:MM" value={debitHours} onChange={e => setDebitHours(e.target.value)} />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg bg-muted/50 p-3 text-sm">
            <div><p className="text-xs text-muted-foreground">Crédito total</p><p className="font-bold">{minutesToHours(launchCreditTotal(preview, date))}</p></div>
            <div><p className="text-xs text-muted-foreground">Débito</p><p className="font-bold">{minutesToHours(preview.debit)}</p></div>
            <div><p className="text-xs text-muted-foreground">Saldo</p><p className="font-bold">{minutesToHours(launchBalance(preview, date), true)}</p></div>
          </div>
          {preview.INTERJORNADA_50 > 0 && <p className="mt-2 text-xs text-muted-foreground">Interjornada ({minutesToHours(preview.INTERJORNADA_50)}) será registrada, mas não altera o saldo.</p>}
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </Modal>
      )}
    </ScreenShell>
  );
}
