import { ArrowLeft, CalendarDays, CheckCircle2, LockKeyhole, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Period = {
  id: string;
  reference_year: number;
  reference_month: number;
  start_date: string;
  end_date: string;
  status: string;
};

function competenceDates(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (day >= 21) {
    const start = new Date(year, month, 21);
    const end = new Date(year, month + 1, 20);
    return { start, end };
  }

  const start = new Date(year, month - 1, 21);
  const end = new Date(year, month, 20);
  return { start, end };
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function periodName(start: Date, end: Date) {
  return `Competência ${String(end.getMonth() + 1).padStart(2, "0")}/${end.getFullYear()}`;
}

export function PointClosing() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    void load();
  }, []);

  async function createCompetence() {
    setSaving(true);
    setError("");

    const { start, end } = competenceDates();
    const payload = {
      reference_year: end.getFullYear(),
      reference_month: end.getMonth() + 1,
      start_date: isoDate(start),
      end_date: isoDate(end),
      status: "ABERTA",
    };

    const { error } = await supabase.from("time_periods").insert(payload);

    if (error) {
      setError(error.code === "23505" ? "Essa competência já está cadastrada." : error.message);
    } else {
      await load();
    }

    setSaving(false);
  }

  async function closeCompetence(id: string) {
    setSaving(true);
    setError("");

    const { error } = await supabase
      .from("time_periods")
      .update({ status: "FECHADA" })
      .eq("id", id);

    if (error) setError(error.message);
    else await load();

    setSaving(false);
  }

  const date = (value: string) =>
    new Date(value + "T12:00:00").toLocaleDateString("pt-BR");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </a>
          <span className="text-sm font-semibold">DP Success · Ponto</span>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-primary">Operação</p>
            <h1 className="mt-1 text-3xl font-bold">Fechamento de Ponto</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Controle as competências no ciclo do dia 21 ao dia 20.
            </p>
          </div>
          <button
            disabled={saving}
            onClick={() => void createCompetence()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Nova competência
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="mt-6 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Regra atual de fechamento</p>
                <p className="text-sm text-muted-foreground">
                  Toda competência começa no dia 21 e termina no dia 20 do mês seguinte.
                </p>
              </div>
            </div>
            <div className="rounded-lg border px-4 py-2 text-sm font-medium">21 → 20</div>
          </div>
        </Card>

        <div className="mt-6 space-y-3">
          {loading ? (
            <Card className="p-8 text-center text-muted-foreground">
              Carregando competências...
            </Card>
          ) : periods.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">
              Nenhuma competência cadastrada.
            </Card>
          ) : (
            periods.map((p) => (
              <Card key={p.id} className="p-5">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                  <div className="flex-1">
                    <h2 className="font-display font-bold">
                      {periodName(new Date(p.start_date + "T12:00:00"), new Date(p.end_date + "T12:00:00"))}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {date(p.start_date)} → {date(p.end_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${p.status === "FECHADA" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700"}`}>
                      {p.status === "FECHADA" ? (
                        <LockKeyhole className="h-3 w-3" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      {p.status}
                    </span>
                    {p.status !== "FECHADA" && (
                      <button
                        disabled={saving}
                        onClick={() => void closeCompetence(p.id)}
                        className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
                      >
                        Fechar competência
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
