import { CheckCircle2, FileUp, Loader2, RotateCcw, Upload, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { fetchPeriods, minutesToHours, periodRangeLabel, type Period } from "@/lib/dp-model";
import { parsePointCardPdf, type PointImportDocument, type PointImportEmployee } from "@/lib/pdf-ponto-parser";

type Employee = { id: string; full_name: string; status?: string; hire_date?: string | null; termination_date?: string | null };
type Match = PointImportEmployee & { employeeId: string | null; period: Period | null };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function findEmployee(name: string, employees: Employee[]) {
  const target = normalize(name);
  const exact = employees.find(e => normalize(e.full_name) === target);
  if (exact) return exact;
  return employees.find(e => normalize(e.full_name).includes(target) || target.includes(normalize(e.full_name))) ?? null;
}

function formatCount(n: number) {
  return n.toLocaleString("pt-BR");
}

export function ImportarCartaoPonto() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [document, setDocument] = useState<PointImportDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadBase() {
    const [emps, ps] = await Promise.all([
      supabase.from("employees").select("id,full_name,status,hire_date,termination_date").order("full_name"),
      fetchPeriods(),
    ]);
    if (emps.error) throw new Error(emps.error.message);
    setEmployees(emps.data ?? []);
    setPeriods(ps);
  }

  async function handleFile(file: File) {
    setError("");
    setMessage("");
    setDocument(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Selecione um arquivo PDF de Cartão Ponto.");
      return;
    }
    setLoading(true);
    try {
      await loadBase();
      const parsed = await parsePointCardPdf(file);
      if (!parsed.employees.length) throw new Error("Não encontrei páginas de funcionários nesse PDF.");
      setDocument(parsed);
      setMessage(`PDF lido: ${parsed.employees.length} funcionário(s) encontrado(s).`);
    } catch (e) {
      setError((e as Error).message || "Não foi possível ler o PDF.");
    } finally {
      setLoading(false);
    }
  }

  const matches = useMemo<Match[]>(() => {
    if (!document) return [];
    return document.employees.map(item => ({
      ...item,
      employeeId: findEmployee(item.employeeName, employees)?.id ?? null,
      period: periods.find(p => p.start_date === item.periodStart && p.end_date === item.periodEnd)
        ?? periods.find(p => item.periodEnd >= p.start_date && item.periodEnd <= p.end_date)
        ?? null,
    }));
  }, [document, employees, periods]);

  const totals = useMemo(() => matches.reduce((acc, row) => {
    acc.creditMinutes += row.creditMinutes;
    acc.debitMinutes += row.debitMinutes;
    acc.monthBalanceMinutes += row.monthBalanceMinutes;
    acc.interjornada += row.interjornadaMinutes;
    acc.additionalNight += row.additionalNightMinutes;
    return acc;
  }, { creditMinutes: 0, debitMinutes: 0, monthBalanceMinutes: 0, interjornada: 0, additionalNight: 0 }), [matches]);
  const unmatched = matches.filter(m => !m.employeeId || !m.period);

  async function importRows() {
    if (!document) return;
    if (unmatched.length) {
      setError("Corrija os funcionários/competência sem correspondência antes de importar.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const duplicateCheck = await supabase.from("overtime_records").select("id").like("launch_group_id", `pdf:${document.fingerprint}:%`).limit(1);
      if (duplicateCheck.error) throw new Error(duplicateCheck.error.message);
      if (duplicateCheck.data?.length) throw new Error("Este PDF já foi importado anteriormente. Não vou duplicar os lançamentos.");

      const { data: auth } = await supabase.auth.getUser();
      let insertedCredits = 0;
      let insertedDebits = 0;
      let insertedSummary = 0;

      for (const row of matches) {
        const groupPrefix = "pdf:" + document.fingerprint + ":" + row.page;

        if (row.creditMinutes > 0) {
          const result = await supabase.from("overtime_records").insert({
            employee_id: row.employeeId, reference_date: row.period!.end_date, period_id: row.period!.id,
            minutes: row.creditMinutes, launch_type: "HE_60", rate_percent: 60,
            launch_group_id: groupPrefix + ":credito", notes: "Importado do Cartão Ponto — Crédito total do período",
          });
          if (result.error) throw new Error(row.employeeName + ": " + result.error.message);
          insertedCredits++;
        }

        if (row.debitMinutes > 0) {
          const result = await supabase.from("bank_hours").insert({
            employee_id: row.employeeId, entry_date: row.period!.end_date, period_id: row.period!.id,
            kind: "debito", minutes: row.debitMinutes, previous_balance_minutes: 0, balance_minutes: row.monthBalanceMinutes,
            justification: "Importado do Cartão Ponto — Débito total do período",
            launch_group_id: groupPrefix + ":debito", created_by: auth.user?.id ?? null,
          });
          if (result.error) throw new Error(row.employeeName + ": " + result.error.message);
          insertedDebits++;
        }

        const summaryRows: Array<{ employee_id: string; reference_date: string; period_id: string; minutes: number; launch_type: "INTERJORNADA_50" | "ADICIONAL_NOTURNO"; rate_percent: number; launch_group_id: string; notes: string }> = [];
        if (row.interjornadaMinutes > 0) summaryRows.push({
          employee_id: row.employeeId, reference_date: row.period!.end_date, period_id: row.period!.id,
          minutes: row.interjornadaMinutes, launch_type: "INTERJORNADA_50", rate_percent: 50,
          launch_group_id: groupPrefix + ":interjornada", notes: "Importado do Cartão Ponto — Interjornada",
        });
        if (row.additionalNightMinutes > 0) summaryRows.push({
          employee_id: row.employeeId, reference_date: row.period!.end_date, period_id: row.period!.id,
          minutes: row.additionalNightMinutes, launch_type: "ADICIONAL_NOTURNO", rate_percent: 20,
          launch_group_id: groupPrefix + ":adicional-noturno", notes: "Importado do Cartão Ponto — Adicional noturno",
        });
        if (summaryRows.length) {
          const result = await supabase.from("overtime_records").insert(summaryRows);
          if (result.error) throw new Error(row.employeeName + ": " + result.error.message);
          insertedSummary += summaryRows.length;
        }
      }

      setMessage(`Importação concluída: ${formatCount(insertedCredits)} créditos, ${formatCount(insertedDebits)} débitos e ${formatCount(insertedSummary)} lançamentos de resumo.`);
    } catch (e) {
      setError((e as Error).message || "Não foi possível concluir a importação.");
    } finally {
      setSaving(false);
    }
  }

  function clear() {
    setDocument(null);
    setMessage("");
    setError("");
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-5">
          <div>
            <p className="text-sm font-medium text-primary">Fechamento de Ponto</p>
            <h1 className="text-2xl font-bold">Importar Cartão Ponto</h1>
            <p className="mt-1 text-sm text-muted-foreground">Envie o PDF do período 21 → 20 e transforme os eventos do relatório em lançamentos.</p>
          </div>
          {document && <button type="button" onClick={clear} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><RotateCcw className="h-4 w-4" />Novo PDF</button>}
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-6 py-7">
        <Card className="border-dashed p-8">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center hover:bg-muted/30">
            {loading ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <FileUp className="h-10 w-10 text-primary" />}
            <div>
              <p className="font-semibold">{loading ? "Lendo o PDF..." : "Clique para selecionar o Cartão Ponto em PDF"}</p>
              <p className="mt-1 text-sm text-muted-foreground">O arquivo é processado no navegador e não é enviado para outro serviço.</p>
            </div>
            <input className="hidden" type="file" accept="application/pdf,.pdf" disabled={loading || saving} onChange={e => { const file = e.target.files?.[0]; if (file) void handleFile(file); e.currentTarget.value = ""; }} />
          </label>
        </Card>

        {error && <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertTriangle className="mr-2 inline h-4 w-4" />{error}</Card>}
        {message && <Card className="border-primary/30 bg-primary/5 p-4 text-sm">{message}</Card>}

        {document && (
          <>
            <Card className="p-5">
              <div className="grid gap-4 md:grid-cols-6">
                <div><p className="text-xs text-muted-foreground">Arquivo</p><p className="truncate font-semibold">{document.fileName}</p></div>
                <div><p className="text-xs text-muted-foreground">Funcionários</p><p className="font-semibold">{formatCount(matches.length)}</p></div>
                <div><p className="text-xs text-muted-foreground">Crédito</p><p className="font-semibold">{minutesToHours(totals.creditMinutes)}</p></div><div><p className="text-xs text-muted-foreground">Débito</p><p className="font-semibold">{minutesToHours(totals.debitMinutes)}</p></div><div><p className="text-xs text-muted-foreground">Saldo do mês</p><p className="font-semibold">{minutesToHours(totals.monthBalanceMinutes)}</p></div>
                <div><p className="text-xs text-muted-foreground">Ad. Noturno</p><p className="font-semibold">{minutesToHours(totals.additionalNight)}</p></div><div><p className="text-xs text-muted-foreground">Interjornada</p><p className="font-semibold">{minutesToHours(totals.interjornada)}</p></div>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b px-5 py-4">
                <h2 className="font-semibold">Prévia antes de gravar</h2>
                <p className="text-xs text-muted-foreground">Nada é salvo enquanto você não clicar em Importar.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Competência</th><th className="px-5 py-3">Crédito</th><th className="px-5 py-3">Débito</th><th className="px-5 py-3">Saldo do mês</th><th className="px-5 py-3">Ad. Noturno</th><th className="px-5 py-3">Interjornada</th><th className="px-5 py-3">Status</th></tr></thead>
                  <tbody className="divide-y">
                    {matches.map(row => <tr key={row.page}>
                      <td className="px-5 py-4 font-medium">{row.employeeName}<div className="text-xs text-muted-foreground">Matrícula {row.registration ?? "—"}</div></td><td className="px-5 py-4">{row.period ? periodRangeLabel(row.period) : <span className="text-destructive">Não encontrada</span>}</td><td className="px-5 py-4">{minutesToHours(row.creditMinutes)}</td><td className="px-5 py-4">{minutesToHours(row.debitMinutes)}</td><td className="px-5 py-4">{minutesToHours(row.monthBalanceMinutes)}</td><td className="px-5 py-4">{minutesToHours(row.additionalNightMinutes)}</td><td className="px-5 py-4">{minutesToHours(row.interjornadaMinutes)}</td><td className="px-5 py-4">{row.employeeId && row.period ? <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="h-4 w-4" />Pronto</span> : <span className="text-destructive">Revisar cadastro</span>}</td></tr>)}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t bg-muted/20 p-5 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-muted-foreground"><strong>Importação:</strong> somente Crédito, Débito, Saldo do mês, Ad. Noturno e Interjornada. Os demais dados do relatório são ignorados.</div>
                <button type="button" disabled={saving || unmatched.length > 0} onClick={() => void importRows()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {saving ? "Importando..." : "Importar lançamentos"}
                </button>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
