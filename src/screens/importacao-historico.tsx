import { useRef, useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";

type Row = Record<string, unknown>;

const MAX_HISTORICAL_YEAR = 2026;
const MAX_HISTORICAL_MONTH = 7;

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

/** Campos de jornada/ausência da BASE usam horas decimais (ex.: 2,5 = 2h30). */
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

function employeeKey(year: number, month: number, name: string) {
  return `${year}-${month}-${name.trim().toLowerCase()}`;
}

export function ImportacaoHistorico() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; unmatched: number; createdEmployees: number } | null>(null);

  async function readFile(file: File) {
    setError("");
    setMessage("");
    setResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets["BASE"];
      if (!sheet) throw new Error('A planilha precisa ter uma aba chamada "BASE".');
      const data = XLSX.utils.sheet_to_json<Row>(sheet, { defval: 0, raw: true });
      if (!data.length) throw new Error("A aba BASE está vazia.");
      const foundHeaders = Object.keys(data[0] ?? {});
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

      const employeeByRegistration = new Map<string, any>();
      const employeeByName = new Map<string, any>();
      for (const employee of employees ?? []) {
        const registration = String(employee.registration ?? "").trim();
        const name = String(employee.full_name ?? "").trim().toLowerCase();
        if (registration && name) employeeByRegistration.set(registration + "|" + name, employee);
        if (name) employeeByName.set(name, employee);
      }

      const { data: departments, error: departmentsError } = await db
        .from("departments")
        .select("id,name");
      if (departmentsError) throw new Error(departmentsError.message);

      const { data: positions, error: positionsError } = await db
        .from("positions")
        .select("id,name,department_id");
      if (positionsError) throw new Error(positionsError.message);

      const departmentByName = new Map<string, any>(
        (departments ?? []).map((item: any) => [String(item.name ?? "").trim().toLowerCase(), item]),
      );
      const positionByKey = new Map<string, any>(
        (positions ?? []).map((item: any) => [
          String(item.name ?? "").trim().toLowerCase() + "|" + String(item.department_id ?? ""),
          item,
        ]),
      );

      const { data: batch, error: batchError } = await db
        .from("historical_import_batches")
        .insert({ file_name: fileName, source_sheet: "BASE", row_count: rows.length, status: "em_andamento" })
        .select("id")
        .single();
      if (batchError) throw new Error(batchError.message);

      const periodIds = new Map<string, string>();
      let unmatched = 0;
      let createdEmployees = 0;

      const output: any[] = [];
      for (const row of rows) {
        const year = Math.trunc(numberValue(row["Ano"]));
        const month = monthFromCell(row["Mês"]);
        const registration = String(row["Matrícula"] ?? "").trim();
        const employeeName = String(row["Funcionário"] ?? "").trim();
        if (!year || month < 1 || month > 12 || !employeeName) continue;
        if (year > MAX_HISTORICAL_YEAR || (year === MAX_HISTORICAL_YEAR && month > MAX_HISTORICAL_MONTH)) {
          throw new Error("A BASE histórica deve ser importada somente até a competência de julho/2026. Agosto e setembro serão lançados manualmente no DP-Success.");
        }

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
          if (!periodId) throw new Error("Não foi possível criar a competência histórica.");
          periodIds.set(periodKey, periodId);
        }

        let departmentId: string | null = null;
        const departmentName = String(row["Setor"] ?? "").trim();
        if (departmentName) {
          const departmentKey = departmentName.toLowerCase();
          let department = departmentByName.get(departmentKey);
          if (!department) {
            const { data: createdDepartment, error: departmentCreateError } = await db
              .from("departments")
              .insert({ name: departmentName, active: true, is_demo: false })
              .select("id,name")
              .single();
            if (departmentCreateError) throw new Error(`Não foi possível criar o setor ${departmentName}: ${departmentCreateError.message}`);
            department = createdDepartment;
            departmentByName.set(departmentKey, department);
          }
          departmentId = department.id;
        }

        let positionId: string | null = null;
        const positionName = String(row["Cargo"] ?? "").trim();
        if (positionName) {
          const positionKey = positionName.toLowerCase() + "|" + String(departmentId ?? "");
          let position = positionByKey.get(positionKey);
          if (!position) {
            const { data: createdPosition, error: positionCreateError } = await db
              .from("positions")
              .insert({ name: positionName, department_id: departmentId, active: true, is_demo: false })
              .select("id,name,department_id")
              .single();
            if (positionCreateError) throw new Error(`Não foi possível criar o cargo ${positionName}: ${positionCreateError.message}`);
            position = createdPosition;
            positionByKey.set(positionKey, position);
          }
          positionId = position.id;
        }

        const employeeNameKey = employeeName.toLowerCase();
        let employee = employeeByRegistration.get((registration || "") + "|" + employeeNameKey);
        if (!employee) employee = employeeByName.get(employeeNameKey);

        if (!employee) {
          const { data: createdEmployee, error: employeeCreateError } = await db
            .from("employees")
            .insert({
              registration: registration || null,
              full_name: employeeName,
              department_id: departmentId,
              position_id: positionId,
              status: "ativo",
              notes: "Cadastro criado automaticamente a partir do histórico da BASE do Power BI. Dados cadastrais atuais devem ser completados pelo RH.",
            })
            .select("id,registration,full_name")
            .single();
          if (employeeCreateError) throw new Error(`Não foi possível criar o cadastro de ${employeeName}: ${employeeCreateError.message}`);
          employee = createdEmployee;
          createdEmployees += 1;
          employeeByRegistration.set((registration || "") + "|" + employeeNameKey, employee);
          employeeByName.set(employeeNameKey, employee);
        } else if (departmentId || positionId) {
          const updatePayload: Record<string, unknown> = {
            department_id: departmentId,
            position_id: positionId,
          };

          // A importação histórica não altera situação nem data de desligamento.
          // Essas informações são decisões cadastrais do RH e alimentam o Turnover.
          const { error: employeeUpdateError } = await db
            .from("employees")
            .update(updatePayload)
            .eq("id", employee.id);
          if (employeeUpdateError) throw new Error(`Não foi possível completar o cadastro de ${employeeName}: ${employeeUpdateError.message}`);
        }

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

      // Atualiza o histórico existente por competência + funcionário, sem apagar
      // outras competências nem registros lançados manualmente no sistema.
      // A matrícula pode ter sido corrigida na nova BASE, então ela não é usada
      // como chave de reconciliação.
      const existingByKey = new Map<string, any>();
      const years = [...new Set(output.map(row => row.reference_year))];
      const months = [...new Set(output.map(row => row.reference_month))];

      for (const year of years) {
        const selectedMonths = months.filter(month => output.some(row => row.reference_year === year && row.reference_month === month));
        for (const month of selectedMonths) {
          const { data: existingRows, error: existingError } = await db
            .from("historical_kpi_data")
            .select("id,reference_year,reference_month,employee_name,registration,import_batch_id")
            .eq("reference_year", year)
            .eq("reference_month", month);
          if (existingError) throw new Error(existingError.message);

          for (const existing of existingRows ?? []) {
            const key = employeeKey(existing.reference_year, existing.reference_month, String(existing.employee_name ?? ""));
            existingByKey.set(key, existing);
          }
        }
      }

      const toUpdate: any[] = [];
      const toInsert: any[] = [];

      for (const row of output) {
        const key = employeeKey(row.reference_year, row.reference_month, row.employee_name);
        const existing = existingByKey.get(key);
        if (existing?.id) {
          toUpdate.push({ ...row, id: existing.id });
        } else {
          toInsert.push(row);
        }
      }

      if (toUpdate.length) {
        for (const row of toUpdate) {
          const { id, ...payload } = row;
          const { error: updateError } = await db
            .from("historical_kpi_data")
            .update(payload)
            .eq("id", id);
          if (updateError) throw new Error(updateError.message);
        }
      }

      if (toInsert.length) {
        const { error: insertError } = await db
          .from("historical_kpi_data")
          .insert(toInsert);
        if (insertError) throw new Error(insertError.message);
      }

      const { error: batchUpdateError } = await db
        .from("historical_import_batches")
        .update({ status: "concluido", row_count: output.length })
        .eq("id", batch.id);
      if (batchUpdateError) throw new Error(batchUpdateError.message);

      setResult({ imported: output.length, unmatched, createdEmployees });
      setMessage(`Histórico importado com segurança. ${createdEmployees} cadastro(s) de funcionário foram criados automaticamente como ativos para preservar o histórico. Os registros históricos existentes foram atualizados pela competência + funcionário, permitindo corrigir matrículas sem apagar outras competências ou lançamentos atuais. A importação não altera situação nem data de desligamento dos funcionários.`);
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
        <p className="text-sm text-primary">Importação</p>
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
                <p className="text-xs text-muted-foreground">O sistema procura exclusivamente a aba BASE e cria automaticamente os funcionários históricos que ainda não estiverem cadastrados.</p>
              </div>
            </div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && void readFile(e.target.files[0])} />
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
                  <p className="text-xs text-muted-foreground">Janeiro/2026 será gravado como 21/12/2025 até 20/01/2026. A BASE será importada somente até julho/2026. Janeiro corresponde a 21/12/2025 → 20/01/2026. Os valores de horas da BASE são horas decimais (ex.: 0,93 = 0h55m48s), e o sistema converte esses valores para minutos.</p>
                </div>
                <button type="button" disabled={loading} onClick={() => void importData()} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                  {loading ? "Importando..." : "Importar histórico"}
                </button>
              </div>
            </>
          )}

          {error && <div className="mt-4 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
          {message && <div className="mt-4 flex gap-2 rounded-lg border p-3 text-sm"><CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />{message}</div>}
          {result && <div className="mt-4 rounded-lg border p-4 text-sm"><b>{result.imported}</b> registros importados/atualizados. <span className="text-muted-foreground">{result.createdEmployees} cadastro(s) de funcionário criado(s)/completado(s) automaticamente. Setores e cargos da BASE também foram vinculados aos cadastros.</span></div>}
        </Card>
      </main>
    </div>
  );
}
