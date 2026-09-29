import { ArrowLeft, CalendarDays, CheckCircle2, LockKeyhole, Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { countWorkingWeekdays } from "@/lib/feriados";

type Period = {
  id: string;
  reference_year: number;
  reference_month: number;
  start_date: string;
  end_date: string;
  status: "aberto" | "em_conferencia" | "fechado";
};

function localDateString(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultRange() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth() + (now.getDate() >= 21 ? 1 : 0), 20);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 21);
  return { start: localDateString(start), end: localDateString(end) };
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function minutesToHHMM(minutes: number | null | undefined) {
  const total = Math.max(0, Math.round(Number(minutes || 0)));
  return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}
function hhmmToMinutes(value: string) {
  const match = String(value || "").trim().match(/^(\d+):(\d{1,2})$/);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}
function periodName(p: Period) {
  return `Competência ${formatDate(p.start_date)} → ${formatDate(p.end_date)}`;
}

export function PointClosing() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<"padrao" | "personalizado">("padrao");
  const [startDate, setStartDate] = useState(defaultRange().start);
  const [endDate, setEndDate] = useState(defaultRange().end);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [historicalRows, setHistoricalRows] = useState<any[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [rowsSource, setRowsSource] = useState<"historical" | "manual">("historical");
  const [rowSaving, setRowSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    const { data, error } = await supabase
      .from("time_periods")
      .select("id,reference_year,reference_month,start_date,end_date,status")
      .order("end_date", { ascending: false });

    if (error) setError(error.message);
    else setPeriods((data ?? []) as Period[]);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function openPeriod(p: Period) {
    setSelectedPeriod(p);
    setEditingRow(null);
    setLoadingRows(true);
    setError("");

    const { data: historical, error: historicalError } = await supabase.from("historical_kpi_data")
      .select("id,employee_id,registration,employee_name,department_name,position_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
      .eq("period_id", p.id)
      .order("employee_name", { ascending: true });

    if (historicalError) {
      setError(historicalError.message);
      setHistoricalRows([]);
      setLoadingRows(false);
      return;
    }

    // A BASE histórica foi importada somente até a competência de julho/2026.
    // A partir de agosto/2026, o fechamento deve sempre usar os dados atuais
    // do DP-Success, mesmo que existam registros históricos antigos para a mesma
    // competência. Isso garante que funcionários inativos que participaram da
    // competência continuem aparecendo.
    const HISTORICAL_CUTOFF = "2026-07-20";
    if (p.end_date <= HISTORICAL_CUTOFF && (historical ?? []).length > 0) {
      setRowsSource("historical");
      setHistoricalRows(historical ?? []);
      setLoadingRows(false);
      return;
    }

    // Competências criadas manualmente não possuem historical_kpi_data.
    // Para elas, montamos a mesma visão diretamente dos lançamentos atuais
    // do DP-Success, consolidando todos os funcionários da competência.
    const [
      { data: employeeRows, error: employeeError },
      { data: timeRows, error: timeError },
      { data: overtimeRows, error: overtimeError },
      { data: occurrenceRows, error: occurrenceError },
      { data: debitRows, error: debitError },
      { data: certificateRows, error: certificateError },
      { data: scheduleRows, error: scheduleError },
    ] = await Promise.all([
      supabase.from("employees")
        .select("id,full_name,registration,department_id,position_id,hire_date,termination_date,status,work_schedule_id,departments(name),positions(name)")
        .order("full_name"),
      supabase.from("time_records")
        .select("employee_id,period_id,expected_minutes,worked_minutes")
        .eq("period_id", p.id),
      supabase.from("overtime_records")
        .select("employee_id,period_id,minutes,launch_type")
        .eq("period_id", p.id),
      supabase.from("occurrences")
        .select("employee_id,period_id,quantity,unit,occurrence_types(code)")
        .eq("period_id", p.id),
      supabase.from("bank_hours")
        .select("employee_id,period_id,minutes,kind")
        .eq("period_id", p.id)
        .eq("kind", "debito"),
      supabase.from("medical_certificates")
        .select("employee_id,start_date,end_date,days")
        .lte("start_date", p.end_date)
        .gte("end_date", p.start_date),
      supabase.from("work_schedules")
        .select("id,weekly_minutes")
        .eq("active", true),
    ]);

    if (employeeError || timeError || overtimeError || occurrenceError || debitError || certificateError || scheduleError) {
      setError(
        employeeError?.message ??
        timeError?.message ??
        overtimeError?.message ??
        occurrenceError?.message ??
        debitError?.message ??
        certificateError?.message ??
        scheduleError?.message ??
        "Não foi possível carregar a visão da competência."
      );
      setHistoricalRows([]);
      setLoadingRows(false);
      return;
    }

    const inCompetence = (employee: any) =>
      (!employee.hire_date || employee.hire_date <= p.end_date) &&
      (!employee.termination_date || employee.termination_date >= p.start_date);

    // O status atual não pode excluir quem participou da competência.
    // Ex.: João Victor Lima e Leandro Ricci podem estar inativos hoje,
    // mas devem continuar na competência de agosto/setembro se estavam
    // contratados durante o período.
    const employeesInPeriod = (employeeRows ?? []).filter((e: any) =>
      inCompetence(e)
    );

    // Regra oficial do fechamento manual:
    // cada dia útil dentro da competência vale 08:48 (528 minutos),
    // descontando sábados, domingos e feriados.
    const expectedMinutesForEmployee = (employee: any) => {
      const effectiveStart = employee.hire_date && employee.hire_date > p.start_date
        ? employee.hire_date
        : p.start_date;
      const effectiveEnd = employee.termination_date && employee.termination_date < p.end_date
        ? employee.termination_date
        : p.end_date;
      if (effectiveStart > effectiveEnd) return 0;
      const workingDays = countWorkingWeekdays(effectiveStart, effectiveEnd);
      return workingDays * 528;
    };

    const expectedByEmployee = new Map<string, number>();
    for (const employee of employeesInPeriod) {
      expectedByEmployee.set(employee.id, expectedMinutesForEmployee(employee));
    }

    const rows = employeesInPeriod.map((employee: any) => {
      const id = employee.id;
      const expected = expectedByEmployee.get(id) ?? 0;
      let faltasDays = 0;
      let certificateMinutes = 0;
      let declarationMinutes = 0;
      let allowanceMinutes = 0;
      let debitMinutes = 0;
      let he60 = 0;
      let he60Night = 0;
      let he100 = 0;
      let he20 = 0;
      let interjornada = 0;

      for (const row of occurrenceRows ?? []) {
        if (row.employee_id !== id) continue;
        const code = String(row.occurrence_types?.code ?? "").toLowerCase();
        const quantity = Number(row.quantity || 0);
        const unit = String(row.unit ?? "dias").toLowerCase();
        const minutes = unit.startsWith("dia")
          ? Math.round(quantity * 528)
          : unit.startsWith("hor")
            ? Math.round(quantity * 60)
            : Math.round(quantity);

        if (["falta", "folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"].includes(code)) {
          faltasDays += quantity;
        } else if (code === "declaracao_horas" || code === "declaracao") {
          declarationMinutes += minutes;
        } else if (code === "abono") {
          allowanceMinutes += minutes;
        }
      }

      for (const row of certificateRows ?? []) {
        if (row.employee_id !== id) continue;
        const overlapStart = row.start_date > p.start_date ? row.start_date : p.start_date;
        const overlapEnd = row.end_date < p.end_date ? row.end_date : p.end_date;
        if (overlapStart > overlapEnd) continue;
        const calendarDays = Math.floor(
          (new Date(overlapEnd + "T00:00:00").getTime() - new Date(overlapStart + "T00:00:00").getTime()) / 86400000
        ) + 1;
        const days = Math.max(0, Math.min(Number(row.days || 0), calendarDays));
        certificateMinutes += Math.round(days * 528);
      }

      for (const row of debitRows ?? []) {
        if (row.employee_id === id) debitMinutes += Math.abs(Number(row.minutes || 0));
      }

      for (const row of overtimeRows ?? []) {
        if (row.employee_id !== id) continue;
        const minutes = Math.abs(Number(row.minutes || 0));
        const type = String(row.launch_type ?? "").toUpperCase();
        if (type === "HE_60") he60 += minutes;
        else if (type === "HE_60_NOTURNO") he60Night += minutes;
        else if (type === "HE_100" || type === "HE_100_NOTURNO") he100 += minutes;
        else if (type === "ADICIONAL_NOTURNO") he20 += minutes;
        else if (type === "INTERJORNADA_50") interjornada += minutes;
      }

      // Abono = atestados + declarações de horas.
      // Horas perdidas = faltas + abonos + débitos.
      // Horas trabalhadas = horas previstas - horas perdidas.
      const allowanceTotal = certificateMinutes + declarationMinutes;
      const absenceMinutes = Math.round(faltasDays * 528);
      const lostMinutes = absenceMinutes + allowanceTotal + debitMinutes;
      const worked = Math.max(0, expected - lostMinutes);

      return {
        id: id + "::manual",
        employee_id: id,
        registration: employee.registration,
        employee_name: employee.full_name,
        department_name: employee.departments?.name ?? "",
        position_name: employee.positions?.name ?? "",
        expected_minutes: expected,
        worked_minutes: worked,
        absence_quantity: faltasDays,
        certificate_minutes: certificateMinutes,
        declaration_minutes: declarationMinutes,
        allowance_minutes: allowanceTotal,
        debit_minutes: debitMinutes,
        he_60_minutes: he60,
        he_60_night_minutes: he60Night,
        he_100_minutes: he100,
        he_20_minutes: he20,
        interjornada_minutes: interjornada,
      };
    });

    setRowsSource("manual");
    setHistoricalRows(rows);
    setLoadingRows(false);
  }

  function beginEdit(row: any) {
    setEditingRow({...row, expected: minutesToHHMM(row.expected_minutes), worked: minutesToHHMM(row.worked_minutes),
      certificate: minutesToHHMM(row.certificate_minutes), declaration: minutesToHHMM(row.declaration_minutes),
      allowance: minutesToHHMM(row.allowance_minutes), debit: minutesToHHMM(row.debit_minutes),
      he60: minutesToHHMM(row.he_60_minutes), he60night: minutesToHHMM(row.he_60_night_minutes),
      he100: minutesToHHMM(row.he_100_minutes), he20: minutesToHHMM(row.he_20_minutes),
      interjornada: minutesToHHMM(row.interjornada_minutes)});
  }

  async function saveHistoricalRow() {
    if (!editingRow) return;
    setRowSaving(true); setError("");
    const payload = {
      expected_minutes: hhmmToMinutes(editingRow.expected), worked_minutes: hhmmToMinutes(editingRow.worked),
      absence_quantity: Number(editingRow.absence_quantity || 0), certificate_minutes: hhmmToMinutes(editingRow.certificate),
      declaration_minutes: hhmmToMinutes(editingRow.declaration), allowance_minutes: hhmmToMinutes(editingRow.allowance),
      debit_minutes: hhmmToMinutes(editingRow.debit), he_60_minutes: hhmmToMinutes(editingRow.he60),
      he_60_night_minutes: hhmmToMinutes(editingRow.he60night), he_100_minutes: hhmmToMinutes(editingRow.he100),
      he_20_minutes: hhmmToMinutes(editingRow.he20), interjornada_minutes: hhmmToMinutes(editingRow.interjornada),
    };
    const { data, error } = await supabase.from("historical_kpi_data").update(payload).eq("id", editingRow.id).select("id,employee_id,registration,employee_name,department_name,position_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes").single();
    if (error) setError("Não foi possível salvar a alteração: " + error.message);
    else { setHistoricalRows(rows => rows.map(row => row.id === data.id ? data : row)); setEditingRow(null); }
    setRowSaving(false);
  }

  function openNew() {
    const range = defaultRange();
    setRangeMode("padrao");
    setStartDate(range.start);
    setEndDate(range.end);
    setError("");
    setModalOpen(true);
  }

  function chooseMode(mode: "padrao" | "personalizado") {
    setRangeMode(mode);
    if (mode === "padrao") {
      const end = new Date();
      const rangeEnd = new Date(end.getFullYear(), end.getMonth() + (end.getDate() >= 21 ? 1 : 0), 20);
      const rangeStart = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth() - 1, 21);
      setStartDate(localDateString(rangeStart));
      setEndDate(localDateString(rangeEnd));
    }
  }

  async function createCompetence() {
    if (!startDate || !endDate) {
      setError("Informe a data inicial e a data final.");
      return;
    }
    if (startDate > endDate) {
      setError("A data inicial não pode ser maior que a data final.");
      return;
    }

    setSaving(true);
    setError("");

    const end = new Date(`${endDate}T12:00:00`);
    const payload = {
      reference_year: end.getFullYear(),
      reference_month: end.getMonth() + 1,
      start_date: startDate,
      end_date: endDate,
      status: "aberto" as const,
    };

    const { error } = await supabase.from("time_periods").insert(payload);
    if (error) {
      setError(error.code === "23505" ? "Esse período de fechamento já está cadastrado." : error.message);
    } else {
      setModalOpen(false);
      await load();
    }
    setSaving(false);
  }

  async function toggleCompetence(id: string, status: Period["status"]) {
    setSaving(true);
    setError("");
    const nextStatus: Period["status"] = status === "fechado" ? "aberto" : "fechado";
    const payload = nextStatus === "fechado"
      ? { status: nextStatus, closed_at: new Date().toISOString() }
      : { status: nextStatus, closed_at: null };
    const { error } = await supabase.from("time_periods").update(payload).eq("id", id);
    if (error) setError("Não foi possível alterar o status do fechamento: " + error.message);
    else await load();
    setSaving(false);
  }

  async function deleteCompetence(id: string) {
    setSaving(true);
    setError("");
    const { error } = await supabase.from("time_periods").delete().eq("id", id);
    if (error) setError("Não foi possível excluir esta competência: " + error.message);
    else { setConfirmDelete(null); await load(); }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Voltar</a>
          <span className="text-sm font-semibold">DP Success · Ponto</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-primary">Operação</p>
            <h1 className="mt-1 text-3xl font-bold">Fechamento de Ponto</h1>
            <p className="mt-1 text-sm text-muted-foreground">Crie competências no período padrão 21 → 20 ou escolha qualquer intervalo.</p>
          </div>
          <button disabled={saving} onClick={openNew} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"><Plus className="h-4 w-4" /> Novo fechamento</button>
        </div>

        {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        <Card className="mt-6 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></div>
            <div>
              <p className="font-semibold">Período do fechamento</p>
              <p className="text-sm text-muted-foreground">O padrão continua sendo dia 21 até dia 20, mas cada novo fechamento pode ter datas próprias.</p>
            </div>
          </div>
        </Card>

        {selectedPeriod ? (
          <div className="mt-6">
            <Card className="p-5">
              <button type="button" onClick={() => setSelectedPeriod(null)} className="mb-2 inline-flex items-center gap-2 text-xs text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Voltar para competências</button>
              <h2 className="text-xl font-bold">{periodName(selectedPeriod)}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {rowsSource === "historical"
                  ? "Dados importados da BASE. Você pode editar os valores diretamente nesta tabela."
                  : "Visão consolidada de todos os funcionários da competência, formada pelos lançamentos atuais do DP-Success."}
              </p>
            </Card>
            <Card className="mt-4 overflow-hidden">
              {loadingRows ? <div className="p-8 text-center text-muted-foreground">Carregando fechamento...</div> :
              historicalRows.length === 0 ? <div className="p-8 text-center text-muted-foreground">Nenhum lançamento histórico encontrado nesta competência.</div> :
              <div className="overflow-x-auto"><table className="min-w-[1500px] w-full text-xs">
                <thead className="bg-muted/50"><tr>{["Funcionário","Previstas","Trabalhadas","Faltas","Atestados","Declaração","Abonos","Débito","HE 60%","HE 60%+20%","HE 100%","HE 20%","Interjornada",...(rowsSource === "historical" ? ["Ação"] : [])].map(h => <th key={h} className="whitespace-nowrap px-3 py-3 text-left font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{historicalRows.map(row => editingRow?.id === row.id && rowsSource === "historical" ? (
                  <tr key={row.id} className="bg-primary/5">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{row.employee_name}</td>
                    {[["expected","Previstas"],["worked","Trabalhadas"],["certificate","Atestados"],["declaration","Declaração"],["allowance","Abonos"],["debit","Débito"],["he60","HE 60%"],["he60night","HE 60%+20%"],["he100","HE 100%"],["he20","HE 20%"],["interjornada","Interjornada"]].map(([key,label]) => <td key={String(key)} className="px-2 py-2"><input aria-label={String(label)} value={editingRow[String(key)]} onChange={e => setEditingRow((v: any) => ({...v,[String(key)]:e.target.value}))} className="w-24 rounded-md border bg-background px-2 py-1.5 text-center font-mono" placeholder="00:00" /></td>)}
                    <td className="px-3 py-2"><div className="flex gap-1.5"><button disabled={rowSaving} onClick={() => void saveHistoricalRow()} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground"><Save className="h-3.5 w-3.5" /> Salvar</button><button disabled={rowSaving} onClick={() => setEditingRow(null)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"><X className="h-3.5 w-3.5" /> Cancelar</button></div></td>
                  </tr>
                ) : (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{row.employee_name}</td>
                    {[row.expected_minutes,row.worked_minutes].map((v,i) => <td key={i} className="whitespace-nowrap px-3 py-2 font-mono">{minutesToHHMM(v)}</td>)}
                    <td className="px-3 py-2 font-mono">{Number(row.absence_quantity || 0)}</td>
                    {[row.certificate_minutes,row.declaration_minutes,row.allowance_minutes,row.debit_minutes,row.he_60_minutes,row.he_60_night_minutes,row.he_100_minutes,row.he_20_minutes,row.interjornada_minutes].map((v,i) => <td key={i} className="whitespace-nowrap px-3 py-2 font-mono">{minutesToHHMM(v)}</td>)}
                    {rowsSource === "historical" && <td className="px-3 py-2"><button onClick={() => beginEdit(row)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"><Pencil className="h-3.5 w-3.5" /> Editar</button></td>}
                  </tr>
                ))}</tbody>
              </table></div>}
            </Card>
          </div>
        ) : (
        <div className="mt-6 space-y-3">
          {loading ? <Card className="p-8 text-center text-muted-foreground">Carregando competências...</Card> :
          periods.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Nenhum fechamento cadastrado.</Card> :
          periods.map(p => (
            <Card key={p.id} className="p-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-center"><div className="flex-1">
              <h2 className="font-display font-bold">{periodName(p)}</h2><p className="mt-1 text-xs text-muted-foreground">Referência {String(p.reference_month).padStart(2, "0")}/{p.reference_year}</p>
            </div><div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${p.status === "fechado" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700"}`}>{p.status === "fechado" ? <LockKeyhole className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{p.status}</span>
              <button disabled={saving} onClick={() => void openPeriod(p)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"><Pencil className="h-3.5 w-3.5" /> Editar fechamento</button>
              <button disabled={saving} onClick={() => void toggleCompetence(p.id, p.status)} className="rounded-lg border px-3 py-2 text-xs font-medium">{p.status === "fechado" ? "Reabrir competência" : "Fechar competência"}</button>
              {confirmDelete !== p.id ? <button disabled={saving} onClick={() => setConfirmDelete(p.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive"><Trash2 className="h-3.5 w-3.5" /> Excluir fechamento</button> :
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2"><span className="text-xs text-destructive">Excluir este fechamento?</span><button disabled={saving} onClick={() => void deleteCompetence(p.id)} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground">Excluir</button><button disabled={saving} onClick={() => setConfirmDelete(null)} className="rounded-md border px-3 py-1.5 text-xs">Cancelar</button></div>}
            </div></div></Card>
          ))}
        </div>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div><h2 className="text-xl font-bold">Novo fechamento de ponto</h2><p className="mt-1 text-sm text-muted-foreground">Escolha o intervalo que será considerado nesta competência.</p></div>
              <button onClick={() => setModalOpen(false)} className="text-sm text-muted-foreground">Fechar</button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => chooseMode("padrao")} className={`rounded-xl border p-4 text-left ${rangeMode === "padrao" ? "border-primary bg-primary/5" : ""}`}>
                <p className="font-semibold">Padrão 21 → 20</p><p className="mt-1 text-xs text-muted-foreground">Usa automaticamente o ciclo atual.</p>
              </button>
              <button type="button" onClick={() => chooseMode("personalizado")} className={`rounded-xl border p-4 text-left ${rangeMode === "personalizado" ? "border-primary bg-primary/5" : ""}`}>
                <p className="font-semibold">Personalizado</p><p className="mt-1 text-xs text-muted-foreground">Escolha qualquer data inicial e final.</p>
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium">Data inicial<input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setRangeMode("personalizado"); }} className="rounded-lg border bg-background px-3 py-2.5 font-normal" /></label>
              <label className="grid gap-1.5 text-sm font-medium">Data final<input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setRangeMode("personalizado"); }} className="rounded-lg border bg-background px-3 py-2.5 font-normal" /></label>
            </div>

            <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
              <strong className="text-foreground">Período:</strong> {formatDate(startDate)} → {formatDate(endDate)}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2.5 text-sm">Cancelar</button>
              <button disabled={saving} onClick={() => void createCompetence()} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">Criar fechamento</button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
