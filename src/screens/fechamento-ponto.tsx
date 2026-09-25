import { ArrowLeft, CalendarDays, CheckCircle2, LockKeyhole, Plus, Trash2 } from "lucide-react";
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
      status: "aberto",
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

        <div className="mt-6 space-y-3">
          {loading ? <Card className="p-8 text-center text-muted-foreground">Carregando competências...</Card> :
          periods.length === 0 ? <Card className="p-8 text-center text-muted-foreground">Nenhum fechamento cadastrado.</Card> :
          periods.map(p => (
            <Card key={p.id} className="p-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                <div className="flex-1">
                  <h2 className="font-display font-bold">{periodName(p)}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Referência {String(p.reference_month).padStart(2, "0")}/{p.reference_year}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${p.status === "fechado" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700"}`}>
                    {p.status === "fechado" ? <LockKeyhole className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{p.status}
                  </span>
                  {p.status !== "fechado" && <button disabled={saving} onClick={() => void closeCompetence(p.id)} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">Fechar competência</button>}
                  {confirmDelete !== p.id ? (
                    <button disabled={saving} onClick={() => setConfirmDelete(p.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/5 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Excluir fechamento</button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2">
                      <span className="text-xs text-destructive">Excluir este fechamento?</span>
                      <button disabled={saving} onClick={() => void deleteCompetence(p.id)} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground disabled:opacity-50">Excluir</button>
                      <button disabled={saving} onClick={() => setConfirmDelete(null)} className="rounded-md border px-3 py-1.5 text-xs font-medium disabled:opacity-50">Cancelar</button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
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
