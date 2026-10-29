import { ArrowLeft, CheckCircle2, FileUp, Loader2, RotateCcw, Upload, AlertTriangle } from "lucide-react";
import { ScreenBrand } from "@/components/screen-brand";
import { useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CompanyFilter } from "@/components/company-filter";
import { fetchPeriods, minutesToHours, periodRangeLabel, type Period } from "@/lib/dp-model";
import { parsePointCardPdf, type PointImportDocument, type PointImportEmployee } from "@/lib/pdf-ponto-parser";

type Employee = { id: string; full_name: string; status?: string; hire_date?: string | null; termination_date?: string | null; company_id?: string | null };
type Match = PointImportEmployee & { employeeId: string | null; period: Period | null };

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function findEmployee(name: string, employees: Employee[]) {
  const target = normalize(name);
  if (!target) return null;

  // Importação de ponto não deve atribuir lançamentos por semelhança parcial:
  // nomes como "MARI" e "MARIANA" podem apontar para pessoas diferentes.
  const exactMatches = employees.filter(e => normalize(e.full_name) === target);
  return exactMatches.length === 1 ? exactMatches[0] : null;
}

function formatCount(n: number) {
  return n.toLocaleString("pt-BR");
}

export function ImportarCartaoPonto() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companyFilter, setCompanyFilter] = useState("");
  const [periods, setPeriods] = useState<Period[]>([]);
  const [document, setDocument] = useState<PointImportDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadBase() {
    const [emps, ps] = await Promise.all([
      supabase.from("employees").select("id,full_name,status,hire_date,termination_date,company_id").order("full_name"),
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
    })).filter(row => !companyFilter || employees.some(employee => employee.id === row.employeeId && employee.company_id === companyFilter));
  }, [document, employees, periods, companyFilter]);

  const totals = useMemo(() => matches.reduce((acc, row) => {
    acc.creditMinutes += row.creditMinutes;
    acc.debitMinutes += row.debitMinutes;
    acc.monthBalanceMinutes += row.monthBalanceMinutes;
    acc.interjornada += row.interjornadaMinutes;
    acc.he60Night += row.he60NightMinutes;
    return acc;
  }, { creditMinutes: 0, debitMinutes: 0, monthBalanceMinutes: 0, interjornada: 0, he60Night: 0 }), [matches]);
  const unmatched = matches.filter(m => !m.employeeId || !m.period);

  async function importRows() {
    if (!document || savingRef.current) return;
    if (unmatched.length) {
      setError("Corrija os funcionários/competência sem correspondência antes de importar.");
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");

    let insertedCredits = 0;
    let insertedDebits = 0;
    let insertedSummary = 0;

    try {
      // launch_group_id é UUID no banco; não podemos usar LIKE nem gravar
      // o identificador textual "pdf:..." nessa coluna. Usamos a fingerprint
      // no campo de observação para detectar uma mesma importação.
      const importFingerprint = `[PDF_IMPORT:${document.fingerprint}]`;
      const overtimeDuplicateCheck = await supabase
        .from("overtime_records")
        .select("id")
        .ilike("notes", `%${importFingerprint}%`)
        .limit(1);
      if (overtimeDuplicateCheck.error) throw new Error(overtimeDuplicateCheck.error.message);

      const bankDuplicateCheck = await supabase
        .from("bank_hours")
        .select("id")
        .ilike("justification", `%${importFingerprint}%`)
        .limit(1);
      if (bankDuplicateCheck.error) throw new Error(bankDuplicateCheck.error.message);

      if (overtimeDuplicateCheck.data?.length || bankDuplicateCheck.data?.length) {
        // Reenviar o mesmo PDF corrige a categoria da importação anterior sem duplicar lançamentos.
        const wronglyClassified = await supabase
          .from("overtime_records")
          .select("id")
          .eq("launch_type", "ADICIONAL_NOTURNO")
          .ilike("notes", `%${importFingerprint}%`)
          .ilike("notes", "%Importado do Cartão Ponto — Adicional noturno%");
        if (wronglyClassified.error) throw new Error(wronglyClassified.error.message);

        if (wronglyClassified.data?.length) {
          const repaired = await supabase
            .from("overtime_records")
            .update({
              launch_type: "HE_60_NOTURNO",
              rate_percent: 80,
              notes: `${importFingerprint} Importado do Cartão Ponto — HE 60% + 20% noturno`,
            })
            .eq("launch_type", "ADICIONAL_NOTURNO")
            .ilike("notes", `%${importFingerprint}%`)
            .ilike("notes", "%Importado do Cartão Ponto — Adicional noturno%");
          if (repaired.error) throw new Error(repaired.error.message);
          setMessage(`Correção concluída: ${formatCount(wronglyClassified.data.length)} lançamento(s) foram reclassificados para HE 60% + 20% noturno. Nenhum crédito ou débito foi duplicado.`);
          return;
        }

        throw new Error("Este PDF já foi importado e não há lançamentos pendentes dessa correção. Nenhum registro foi duplicado.");
      }

      const { data: auth } = await supabase.auth.getUser();
      for (const row of matches) {
        // Cada funcionário do PDF recebe um único grupo UUID. Assim, Crédito,
        // Débito, Interjornada e HE 60% + 20% noturno permanecem vinculados e podem ser
        // editados/excluídos juntos na tela de Lançamentos.
        const groupId = crypto.randomUUID();

        if (row.creditMinutes > 0) {
          const result = await supabase.from("overtime_records").insert({
            employee_id: row.employeeId!, reference_date: row.period!.end_date, period_id: row.period!.id,
            minutes: row.creditMinutes, launch_type: "HE_60", rate_percent: 60, launch_group_id: groupId,
            notes: `${importFingerprint} Importado do Cartão Ponto — Crédito total do período`,
          });
          if (result.error) throw new Error(row.employeeName + ": " + result.error.message);
          insertedCredits++;
        }

        if (row.debitMinutes > 0) {
          const result = await supabase.from("bank_hours").insert({
            employee_id: row.employeeId!, entry_date: row.period!.end_date, period_id: row.period!.id,
            kind: "debito", minutes: row.debitMinutes, previous_balance_minutes: 0, balance_minutes: row.monthBalanceMinutes,
            launch_group_id: groupId,
            justification: `${importFingerprint} Importado do Cartão Ponto — Débito total do período`,
            created_by: auth.user?.id ?? null,
          });
          if (result.error) throw new Error(row.employeeName + ": " + result.error.message);
          insertedDebits++;
        }

        const summaryRows: Array<{ employee_id: string; reference_date: string; period_id: string; minutes: number; launch_type: "INTERJORNADA_50" | "HE_60_NOTURNO"; rate_percent: number; launch_group_id: string; notes: string }> = [];
        if (row.interjornadaMinutes > 0) summaryRows.push({
          employee_id: row.employeeId!, reference_date: row.period!.end_date, period_id: row.period!.id,
          minutes: row.interjornadaMinutes, launch_type: "INTERJORNADA_50", rate_percent: 50, launch_group_id: groupId,
          notes: `${importFingerprint} Importado do Cartão Ponto — Interjornada`,
        });
        if (row.he60NightMinutes > 0) summaryRows.push({
          employee_id: row.employeeId!, reference_date: row.period!.end_date, period_id: row.period!.id,
          minutes: row.he60NightMinutes, launch_type: "HE_60_NOTURNO", rate_percent: 80, launch_group_id: groupId,
          notes: `${importFingerprint} Importado do Cartão Ponto — HE 60% + 20% noturno`,
        });
        if (summaryRows.length) {
          const result = await supabase.from("overtime_records").insert(summaryRows);
          if (result.error) throw new Error(row.employeeName + ": " + result.error.message);
          insertedSummary += summaryRows.length;
        }
      }

      setMessage(`Importação concluída: ${formatCount(insertedCredits)} créditos, ${formatCount(insertedDebits)} débitos e ${formatCount(insertedSummary)} lançamentos de resumo.`);
    } catch (e) {
      const reason = (e as Error).message || "Não foi possível concluir a importação.";
      const insertedTotal = insertedCredits + insertedDebits + insertedSummary;
      setError(
        insertedTotal > 0
          ? reason + " A importação foi interrompida após gravar " + formatCount(insertedCredits) + " créditos, " + formatCount(insertedDebits) + " débitos e " + formatCount(insertedSummary) + " lançamentos de resumo. Não tente importar o mesmo PDF novamente; confira os registros já gravados em Lançamentos e Banco de Horas."
          : reason,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function clear() {
    setDocument(null);
    setMessage("");
    setError("");
  }

  return (
    <div className="dp-screen min-h-screen bg-background">
      <header className="dp-screen-topbar border-b bg-background px-4 py-3 sm:px-6 sm:py-3.5">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-3">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </a>
          <ScreenBrand name="Importar Cartão de Ponto" />
        </div>
      </header>

      <main className="dp-screen-content mx-auto max-w-[1500px] space-y-6 px-4 py-5 sm:px-6 sm:py-6">
        <div className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 [&_p]:!text-white/75 [&_h1]:!text-white">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-white/75">Fechamento de Ponto</p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-[30px]">Importar Cartão Ponto</h1>
              <p className="mt-1 max-w-3xl text-sm text-white/80">Envie o PDF do cartão ponto e importe somente Crédito, Débito, Saldo do mês, HE 60% + 20% noturno e Interjornada.</p>
            </div>
            {document && <button type="button" onClick={clear} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-white transition-colors hover:bg-white/15"><RotateCcw className="h-4 w-4" />Novo PDF</button>}
          </div>
        </div>
        <Card className="p-4"><label className="grid max-w-sm gap-1.5 text-sm font-medium"><span>Empresa</span><CompanyFilter value={companyFilter} onChange={setCompanyFilter} /></label><p className="mt-2 text-xs text-muted-foreground">O filtro limita a prévia e a importação à empresa selecionada. “Todas as empresas” mantém todos os funcionários do PDF.</p></Card>
        <Card className="border-dashed p-8">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center hover:bg-muted/30">
            {loading ? <Loader2 className="h-10 w-10 animate-spin text-primary" /> : <FileUp className="h-10 w-10 text-primary" />}
            <div>
              <p className="font-semibold">{loading ? "Lendo o PDF..." : "Clique para selecionar o cartão ponto em PDF"}</p>
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
                <div><p className="text-xs text-muted-foreground">HE 60% + 20% noturno</p><p className="font-semibold">{minutesToHours(totals.he60Night)}</p></div><div><p className="text-xs text-muted-foreground">Interjornada</p><p className="font-semibold">{minutesToHours(totals.interjornada)}</p></div>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="border-b px-5 py-4">
                <h2 className="font-semibold">Prévia antes de gravar</h2>
                <p className="text-xs text-muted-foreground">Nada é salvo enquanto você não clicar em Importar.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Competência</th><th className="px-5 py-3">Crédito</th><th className="px-5 py-3">Débito</th><th className="px-5 py-3">Saldo do mês</th><th className="px-5 py-3">HE 60% + 20% noturno</th><th className="px-5 py-3">Interjornada</th><th className="px-5 py-3">Status</th></tr></thead>
                  <tbody className="divide-y">
                    {matches.map((row) => (
                      <tr key={row.page}>
                        <td className="px-5 py-4 font-medium">
                          {row.employeeName}
                          {!row.employeeId && <p className="mt-1 text-xs font-normal text-destructive">Cadastro não identificado por nome exato</p>}
                        </td>
                        <td className="px-5 py-4">
                          {row.period ? periodRangeLabel(row.period) : (
                            <span className="text-destructive">Não encontrada</span>
                          )}
                        </td>
                        <td className="px-5 py-4">{minutesToHours(row.creditMinutes)}</td>
                        <td className="px-5 py-4">{minutesToHours(row.debitMinutes)}</td>
                        <td className="px-5 py-4">{minutesToHours(row.monthBalanceMinutes)}</td>
                        <td className="px-5 py-4">{minutesToHours(row.he60NightMinutes)}</td>
                        <td className="px-5 py-4">{minutesToHours(row.interjornadaMinutes)}</td>
                        <td className="px-5 py-4">
                          {row.employeeId && row.period ? (
                            <span className="inline-flex items-center gap-1 text-primary">
                              <CheckCircle2 className="h-4 w-4" />
                              Pronto
                            </span>
                          ) : (
                            <span className="text-destructive">
                              {!row.employeeId && !row.period
                                ? "Funcionário e competência não identificados"
                                : !row.employeeId
                                  ? "Funcionário não identificado"
                                  : "Competência não identificada"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t bg-muted/20 p-5 md:flex-row md:items-center md:justify-between">
                <div className="text-xs text-muted-foreground"><strong>Importação:</strong> somente Crédito, Débito, Saldo do mês, HE 60% + 20% noturno e Interjornada. Os demais dados do relatório são ignorados.</div>
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
