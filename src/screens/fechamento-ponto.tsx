import { ArrowLeft, CalendarDays, CheckCircle2, LockKeyhole, Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

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
    setSelectedPeriod(p); setEditingRow(null); setLoadingRows(true); setError("");
    const { data, error } = await supabase.from("historical_kpi_data")
      .select("id,employee_id,registration,employee_name,department_name,position_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
      .eq("period_id", p.id).order("employee_name", { ascending: true });
    if (error) setError(error.message); else setHistoricalRows(data ?? []);
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

  async function closeCompetence(id: string) {
    setSaving(true);
    setError("");
    const { error } = await supabase.from("time_periods").update({ status: "fechado", closed_at: new Date().toISOString() }).eq("id", id);
    if (error) setError(error.message);
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
              <p className="mt-1 text-xs text-muted-foreground">Edite os dados importados da BASE diretamente no sistema. Não é necessário importar novamente a planilha.</p>
            </Card>
            <Card className="mt-4 overflow-hidden">
              {loadingRows ? <div className="p-8 text-center text-muted-foreground">Carregando fechamento...</div> :
              historicalRows.length === 0 ? <div className="p-8 text-center text-muted-foreground">Nenhum lançamento histórico encontrado nesta competência.</div> :
              <div className="overflow-x-auto"><table className="min-w-[1500px] w-full text-xs">
                <thead className="bg-muted/50"><tr>{["Funcionário","Previstas","Trabalhadas","Faltas","Atestados","Declaração","Abonos","Débito","HE 60%","HE 60%+20%","HE 100%","HE 20%","Interjornada","Ação"].map(h => <th key={h} className="whitespace-nowrap px-3 py-3 text-left font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y">{historicalRows.map(row => editingRow?.id === row.id ? (
                  <tr key={row.id} className="bg-primary/5">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{row.employee_name}</td>
                    {[["expected","Previstas"],["worked","Trabalhadas"],["certificate","Atestados"],["declaration","Declaração"],["allowance","Abonos"],["debit","Débito"],["he60","HE 60%"],["he60night","HE 60%+20%"],["he100","HE 100%"],["he20","HE 20%"],["interjornada","Interjornada"]].map(([key,label]) => <td key={key} className="px-2 py-2"><input aria-label={label} value={editingRow[key]} onChange={e => setEditingRow((v: any) => ({...v,[key]:e.target.value}))} className="w-24 rounded-md border bg-background px-2 py-1.5 text-center font-mono" placeholder="00:00" /></td>)}
                    <td className="px-3 py-2"><div className="flex gap-1.5"><button disabled={rowSaving} onClick={() => void saveHistoricalRow()} className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground"><Save className="h-3.5 w-3.5" /> Salvar</button><button disabled={rowSaving} onClick={() => setEditingRow(null)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"><X className="h-3.5 w-3.5" /> Cancelar</button></div></td>
                  </tr>
                ) : (
                  <tr key={row.id} className="hover:bg-muted/30">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{row.employee_name}</td>
                    {[row.expected_minutes,row.worked_minutes].map((v,i) => <td key={i} className="whitespace-nowrap px-3 py-2 font-mono">{minutesToHHMM(v)}</td>)}
                    <td className="px-3 py-2 font-mono">{Number(row.absence_quantity || 0)}</td>
                    {[row.certificate_minutes,row.declaration_minutes,row.allowance_minutes,row.debit_minutes,row.he_60_minutes,row.he_60_night_minutes,row.he_100_minutes,row.he_20_minutes,row.interjornada_minutes].map((v,i) => <td key={i} className="whitespace-nowrap px-3 py-2 font-mono">{minutesToHHMM(v)}</td>)}
                    <td className="px-3 py-2"><button onClick={() => beginEdit(row)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs"><Pencil className="h-3.5 w-3.5" /> Editar</button></td>
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
              {p.status !== "fechado" && <button disabled={saving} onClick={() => void closeCompetence(p.id)} className="rounded-lg border px-3 py-2 text-xs font-medium">Fechar competência</button>}
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
