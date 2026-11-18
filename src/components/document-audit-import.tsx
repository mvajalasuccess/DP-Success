import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FileUp, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { parseDocumentAuditFiles, type AuditEmployee, type AuditParseResult } from "@/lib/document-audit-import";

type Props = {
  employees: AuditEmployee[];
};

const statusLabel = (status: AuditParseResult["blocks"][number]["employeeStatus"]) => ({
  matched: "Funcionário validado",
  "missing-hire-date": "Sem admissão no bloco",
  inactive: "Inativo/desligado",
  "not-found": "Não encontrado",
  ambiguous: "Correspondência ambígua",
}[status]);

export function DocumentAuditImport({ employees }: Props) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<AuditParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);

  const documentRows = useMemo(() => result?.rows.filter(row => row.destination === "documents") ?? [], [result]);
  const attendanceRows = useMemo(() => result?.rows.filter(row => row.destination === "certificates" || row.destination === "declarations") ?? [], [result]);
  const absenceRows = useMemo(() => result?.rows.filter(row => row.destination === "absences") ?? [], [result]);
  const validRows = useMemo(() => documentRows.filter(row => row.employeeStatus === "matched" && !row.issue), [documentRows]);
  const issueRows = useMemo(() => documentRows.filter(row => row.employeeStatus !== "matched" || !!row.issue), [documentRows]);
  const visibleRows = useMemo(() => {
    const rows = showOnlyIssues ? issueRows : documentRows;
    return rows.slice(0, 250);
  }, [result, showOnlyIssues, issueRows, documentRows]);

  async function analyze() {
    if (!files.length) return;
    setBusy(true);
    setResult(null);
    const parsed = await parseDocumentAuditFiles(files, employees);
    setResult(parsed);
    setBusy(false);
  }

  function close() {
    setOpen(false);
    setFiles([]);
    setResult(null);
    setShowOnlyIssues(false);
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium hover:bg-muted">
      <FileSpreadsheet className="h-4 w-4" /> Importar auditoria Excel
    </button>
    {open && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 sm:p-6">
      <Card className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-4 border-b p-4 sm:p-5">
          <div>
            <h2 className="text-lg font-semibold">Importação auditada de documentos</h2>
            <p className="mt-1 text-sm text-muted-foreground">Selecione as planilhas para conferir os blocos, funcionários e documentos antes de qualquer gravação.</p>
          </div>
          <button type="button" onClick={close} aria-label="Fechar importação" className="rounded-md border p-2 hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          <div className="rounded-md border border-dashed p-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
              <FileUp className="h-7 w-7 text-muted-foreground" />
              <span className="text-sm font-medium">Selecionar arquivos Excel</span>
              <span className="text-xs text-muted-foreground">Você pode selecionar as duas auditorias na mesma etapa (.xlsx ou .xls).</span>
              <input type="file" accept=".xlsx,.xls" multiple className="sr-only" onChange={event => {
                setFiles(Array.from(event.target.files ?? []));
                setResult(null);
              }} />
            </label>
            {files.length > 0 && <div className="mt-3 flex flex-wrap justify-center gap-2">
              {files.map(file => <span key={file.name} className="rounded-md bg-muted px-3 py-1.5 text-xs">{file.name}</span>)}
            </div>}
            <div className="mt-4 flex justify-center">
              <button type="button" disabled={!files.length || busy} onClick={() => void analyze()} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                {busy ? "Analisando planilhas..." : "Analisar e gerar prévia"}
              </button>
            </div>
          </div>

          {result && <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Blocos de funcionários</p><p className="mt-1 text-2xl font-semibold">{result.blocks.length}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Documentos aptos para revisão</p><p className="mt-1 text-2xl font-semibold text-emerald-600">{validRows.length}</p></div>
              <div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Documentos com inconsistências</p><p className="mt-1 text-2xl font-semibold text-amber-600">{issueRows.length}</p></div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2"><div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Atestados e declarações encaminhados ao módulo próprio</p><p className="mt-1 text-2xl font-semibold">{attendanceRows.length}</p></div><div className="rounded-md border p-3"><p className="text-xs text-muted-foreground">Faltas encaminhadas a Faltas e Folgas</p><p className="mt-1 text-2xl font-semibold">{absenceRows.length}</p></div></div>

            {result.errors.length > 0 && <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{result.errors.map(error => <p key={error}>{error}</p>)}</div>}

            <section className="space-y-2">
              <h3 className="font-semibold">Validação dos blocos</h3>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-2">Arquivo / aba</th><th className="px-3 py-2">Funcionário identificado</th><th className="px-3 py-2">Admissão</th><th className="px-3 py-2">Resultado</th><th className="px-3 py-2 text-right">Linhas</th></tr></thead>
                  <tbody className="divide-y">
                    {result.blocks.map((block, index) => <tr key={block.fileName + block.sheetName + index}>
                      <td className="px-3 py-2"><span className="block font-medium">{block.fileName}</span><span className="text-xs text-muted-foreground">{block.sheetName}</span></td>
                      <td className="px-3 py-2">{block.employeeName}</td>
                      <td className="whitespace-nowrap px-3 py-2">{block.hireDate ? block.hireDate.split("-").reverse().join("/") : "Não identificada"}</td>
                      <td className="px-3 py-2"><span className={block.employeeStatus === "matched" ? "inline-flex items-center gap-1 text-emerald-600" : "inline-flex items-center gap-1 text-amber-600"}>{block.employeeStatus === "matched" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{statusLabel(block.employeeStatus)}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{block.rowCount}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">Detalhamento dos documentos</h3>
                <button type="button" onClick={() => setShowOnlyIssues(value => !value)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
                  {showOnlyIssues ? "Mostrar todas as linhas" : "Mostrar apenas inconsistências"}
                </button>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-muted/60 text-muted-foreground"><tr><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">Categoria</th><th className="px-3 py-2">Documento</th><th className="px-3 py-2">Padrão?</th><th className="px-3 py-2">Realização</th><th className="px-3 py-2">Vencimento</th><th className="px-3 py-2">Comentário original</th><th className="px-3 py-2">Validação</th></tr></thead>
                  <tbody className="divide-y">
                    {visibleRows.map(row => <tr key={row.key}>
                      <td className="px-3 py-2"><span className="font-medium">{row.employeeName}</span><span className="block text-[11px] text-muted-foreground">{row.hireDate ? row.hireDate.split("-").reverse().join("/") : "Admissão ausente"}</span></td>
                      <td className="px-3 py-2">{row.category}</td>
                      <td className="px-3 py-2">{row.documentName}</td>
                      <td className="px-3 py-2">{row.isStandard === null ? "Revisar" : row.isStandard ? "Sim" : "Não"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.completedOn ? row.completedOn.split("-").reverse().join("/") : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2">{row.dueDate ? row.dueDate.split("-").reverse().join("/") : "—"}</td>
                      <td className="max-w-[220px] whitespace-normal break-words px-3 py-2">{row.originalComment || "—"}</td>
                      <td className="max-w-[240px] whitespace-normal break-words px-3 py-2">{row.issue ? <span className="text-amber-700">{row.issue}</span> : <span className="text-emerald-600">Apto</span>}</td>
                    </tr>)}
                    {visibleRows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nenhuma linha para exibir.</td></tr>}
                  </tbody>
                </table>
              </div>
              {((showOnlyIssues ? issueRows : result.rows).length > visibleRows.length) && <p className="text-xs text-muted-foreground">Exibindo as primeiras 250 linhas desta visualização. O total e os alertas consideram todas as linhas analisadas.</p>}
            </section>

            {attendanceRows.length > 0 && <section className="space-y-2">
              <h3 className="font-semibold">Atestados e declarações — destino: Declarações e Atestados</h3>
              <p className="text-xs text-muted-foreground">Esses itens não serão cadastrados como documentos com vencimento. A data encontrada na planilha é de entrega do documento; ela não será tratada automaticamente como data do afastamento ou do comparecimento.</p>
              <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[850px] text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground"><tr><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">Tipo</th><th className="px-3 py-2">Descrição original</th><th className="px-3 py-2">Dias / horas</th><th className="px-3 py-2">CID</th><th className="px-3 py-2">Data de entrega</th><th className="px-3 py-2">Pendência</th></tr></thead>
                <tbody className="divide-y">{attendanceRows.map(row => <tr key={row.key}>
                  <td className="px-3 py-2">{row.employeeName}</td><td className="px-3 py-2">{row.destination === "declarations" ? "Declaração" : "Atestado"}</td><td className="px-3 py-2">{row.documentName}</td>
                  <td className="px-3 py-2">{row.durationDays ? row.durationDays + " dia(s)" : row.durationHours ? row.durationHours.toLocaleString("pt-BR") + " h" : "—"}</td><td className="px-3 py-2">{row.cid || "—"}</td><td className="px-3 py-2">{row.referenceDate ? row.referenceDate.split("-").reverse().join("/") : "Não identificada"}</td><td className="max-w-[280px] whitespace-normal px-3 py-2 text-amber-700">{row.issue || "Conferir data antes de lançar"}</td>
                </tr>)}</tbody>
              </table></div>
            </section>}

            {absenceRows.length > 0 && <section className="space-y-2">
              <h3 className="font-semibold">Faltas — destino: Faltas e Folgas</h3>
              <p className="text-xs text-muted-foreground">As datas da própria linha são tratadas como datas das faltas; a observação de desconto em folha será preservada separadamente.</p>
              <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[720px] text-left text-xs">
                <thead className="bg-muted/60 text-muted-foreground"><tr><th className="px-3 py-2">Funcionário</th><th className="px-3 py-2">Data da falta</th><th className="px-3 py-2">Quantidade</th><th className="px-3 py-2">Comentário original</th><th className="px-3 py-2">Validação</th></tr></thead>
                <tbody className="divide-y">{absenceRows.map(row => <tr key={row.key}>
                  <td className="px-3 py-2">{row.employeeName}</td><td className="px-3 py-2">{row.referenceDate ? row.referenceDate.split("-").reverse().join("/") : "Não identificada"}</td><td className="px-3 py-2">1 dia</td><td className="px-3 py-2">{row.originalComment || "—"}</td><td className="px-3 py-2">{row.issue ? <span className="text-amber-700">{row.issue}</span> : <span className="text-emerald-600">Apto para revisão</span>}</td>
                </tr>)}</tbody>
              </table></div>
            </section>}

            <div className="rounded-md border border-amber-300/50 bg-amber-50/60 p-3 text-sm text-amber-900">
              <strong>Prévia somente para conferência.</strong> Nenhum documento, vencimento, padrão ou configuração individual foi gravado no DP Success nesta etapa. A importação definitiva será liberada depois da validação transacional e da proteção contra reimportação. Atestados, declarações e faltas serão gravados somente nos módulos próprios, nunca em Documentos e Vencimentos.
            </div>
          </>}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <button type="button" onClick={close} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Fechar</button>
        </div>
      </Card>
    </div>}
  </>;
}
