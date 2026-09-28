import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatDateBR } from "@/lib/dp-model";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

const REQUIRED = [
  "Ano", "Mês", "Matrícula", "Funcionário", "Setor", "Cargo",
  "Horas Previstas", "Horas Trabalhadas", "Faltas", "Atestados",
  "Declaração de Horas", "Abonos", "Débito", "HE 60%", "HE 60%20%",
  "HE 100%", "HE 20%", "INTERJORNADA",
];

function numberValue(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** A BASE usa horas decimais: 237,60 = 237,6 horas. Persistimos em minutos. */
function decimalHoursToMinutes(value: unknown) {
  return Math.round(numberValue(value) * 60);
}

function monthFromCell(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getMonth() + 1;
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return date.m;
  }
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.getMonth() + 1;
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const idx = names.indexOf(text.toLowerCase());
  return idx >= 0 ? idx + 1 : Number(text) || 0;
}

function competenceRange(year: number, month: number) {
  const start = new Date(year, month - 2, 21);
  const end = new Date(year, month - 1, 20);
  const iso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  return { start: iso(start), end: iso(end) };
}

export function ImportacaoHistorico() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; unmatched: number } | null>(null);

  async function readFile(file: File) {
    setError("");
    setMessage("");
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets.BASE;
      if (!sheet) throw new Error('A planilha precisa ter uma aba chamada "BASE".');
      const data = XLSX.utils.sheet_to_json<Row>(sheet, { defval: 0, raw: true });
      if (!data.length) throw new Error("A aba BASE está vazia.");
      const foundHeaders = Object.keys(data[0]);
      const missing = REQUIRED.filter(h => !foundHeaders.includes(h));
      if (missing.length) throw new Error(`A aba BASE não possui: ${missing.join(", ")}`);
      setRows(data);
      setHeaders(foundHeaders);
      setFileName(file.name);
    } catch (e) {
      setRows([]);
      setHeaders([]);
      setError(e instanceof Error ? e.message : "Não foi possível ler o arquivo.");
    }
  }

  async function importData() {
    if (!rows.length) return;
    setLoading(true);
    setError("");
    setMessage("");
    setResult(null);

    try {
      const db = supabase as any;
      const { data: employees, error: employeesError } = await db
        .from("employees")
        .select("id,registration,full_name");
      if (employeesError) throw new Error(employeesError.message);

      const employeeByRegistration = new Map(
        (employees ?? []).map((e: any) => [String(e.registration ?? "").trim(), e]),
      );

      const { data: batch, error: batchError } = await db
        .from("historical_import_batches")
        .insert({ file_name: fileName, source_sheet: "BASE", row_count: rows.length, status: "em_andamento" })
        .select("id")
        .single();
      if (batchError) throw new Error(batchError.message);

      const periodIds = new Map<string, string>();
      let unmatched = 0;

      const output: any[] = [];
      for (const row of rows) {
        const year = Math.trunc(numberValue(row["Ano"]));
        const month = monthFromCell(row["Mês"]);
        const registration = String(row["Matrícula"] ?? "").trim();
        const employeeName = String(row["Funcionário"] ?? "").trim();
        if (!year || month < 1 || month > 12 || !employeeName) continue;

        const { start, end } = competenceRange(year, month);
        const periodKey = `${start}|${end}`;
        let periodId = periodIds.get(periodKey);

        if (!periodId) {
          const { data: existing, error: findError } = await db
            .from("time_periods")
            .select("id")
            .eq("start_date", start)
            .eq("end_date", end)
            .maybeSingle();
          if (findError) throw new Error(findError.message);

          if (existing?.id) {
            periodId = existing.id;
          } else {
            const { data: created, error: createError } = await db
              .from("time_periods")
              .insert({
                reference_year: year,
                reference_month: month,
                start_date: start,
                end_date: end,
                status: "fechado",
                notes: "Competência histórica importada da BASE do Power BI.",
              })
              .select("id")
              .single();
            if (createError) throw new Error(createError.message);
            periodId = created.id;
          }
          periodIds.set(periodKey, periodId);
        }

        const employee = employeeByRegistration.get(registration);
        if (!employee) unmatched += 1;

        output.push({
          period_id: periodId,
          reference_year: year,
          reference_month: month,
          period_start: start,
          period_end: end,
          employee_id: employee?.id ?? null,
          registration: registration || null,
          employee_name: employeeName,
          department_name: String(row["Setor"] ?? "") || null,
          position_name: String(row["Cargo"] ?? "") || null,
          expected_minutes: decimalHoursToMinutes(row["Horas Previstas"]),
          worked_minutes: decimalHoursToMinutes(row["Horas Trabalhadas"]),
          absence_quantity: numberValue(row["Faltas"]),
          certificate_minutes: decimalHoursToMinutes(row["Atestados"]),
          declaration_minutes: decimalHoursToMinutes(row["Declaração de Horas"]),
          allowance_minutes: decimalHoursToMinutes(row["Abonos"]),
          debit_minutes: decimalHoursToMinutes(row["Débito"]),
          he_60_minutes: decimalHoursToMinutes(row["HE 60%"]),
          he_60_night_minutes: decimalHoursToMinutes(row["HE 60%20%"]),
          he_100_minutes: decimalHoursToMinutes(row["HE 100%"]),
          he_20_minutes: decimalHoursToMinutes(row["HE 20%"]),
          interjornada_minutes: decimalHoursToMinutes(row["INTERJORNADA"]),
          import_batch_id: batch.id,
        });
      }

      const { error: upsertError } = await db
        .from("historical_kpi_data")
        .upsert(output, { onConflict: "reference_year,reference_month,registration,employee_name" });
      if (upsertError) throw new Error(upsertError.message);

      const { error: batchUpdateError } = await db
        .from("historical_import_batches")
        .update({ status: "concluido", row_count: output.length })
        .eq("id", batch.id);
      if (batchUpdateError) throw new Error(batchUpdateError.message);

      setResult({ imported: output.length, unmatched });
      setMessage("Histórico importado com sucesso. Os dados da BASE foram preservados como histórico consolidado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between">
          <a href="/" className="text-sm text-muted-foreground"><ArrowLeft className="mr-1 inline h-4 w-4" />Voltar</a>
          <b>DP Success · Importação</b>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-7">
        <p className="text-sm text-primary">Configurações</p>
        <h1 className="text-3xl font-bold">Importar histórico</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Importe a aba BASE do Power BI para continuar os KPIs de 2026 sem transformar o histórico consolidado em lançamentos fictícios.
        </p>

        <Card className="mt-6 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-primary/10 p-3 text-primary"><FileSpreadsheet className="h-5 w-5" /></div>
              <div>
                <p className="font-semibold">Arquivo Excel</p>
                <p className="text-xs text-muted-foreground">O sistema procura exclusivamente a aba BASE.</p>
              </div>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && void readFile(e.target.files[0])} />
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted">
              <Upload className="h-4 w-4" /> Selecionar arquivo
            </button>
          </div>

          {fileName && <div className="mt-5 rounded-xl border bg-muted/30 p-4 text-sm"><b>{fileName}</b><span className="ml-2 text-muted-foreground">· {rows.length} linhas encontradas na BASE</span></div>}

          {rows.length > 0 && (
            <>
              <div className="mt-5 overflow-x-auto rounded-xl border">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/40"><tr>{headers.map(h => <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{rows.slice(0, 5).map((row, i) => <tr key={i} className="border-t">{headers.map(h => <td key={h} className="whitespace-nowrap px-3 py-2">{String(row[h] ?? "")}</td>)}</tr>)}</tbody>
                </table>
              </div>
              <div className="mt-5 flex flex-col gap-3 rounded-xl border p-4 text-sm md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-semibold">Competência histórica</p>
                  <p className="text-xs text-muted-foreground">Janeiro/2026 será gravado como 21/12/2025 até 20/01/2026. As horas da BASE são tratadas como horas decimais e convertidas para minutos.</p>
                </div>
                <button type="button" disabled={loading} onClick={() => void importData()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {loading ? "Importando..." : "Importar BASE"}
                </button>
              </div>
            </>
          )}

          {error && <div className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
          {message && <div className="mt-4 flex gap-2 rounded-lg border p-3 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />{message}</div>}
          {result && <div className="mt-4 rounded-lg border p-4 text-sm"><b>{result.imported}</b> registros importados/atualizados. <span className="text-muted-foreground">{result.unmatched} registros não encontraram matrícula correspondente no cadastro atual; o histórico foi preservado mesmo assim.</span></div>}
        </Card>
      </main>
    </div>
  );
}
