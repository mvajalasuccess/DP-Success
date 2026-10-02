import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScreenShell, btnOutline, btnPrimary, inputCls } from "@/components/screen-shell";
import { supabase } from "@/integrations/supabase/client";
import { CREDIT_TYPES, fetchPeriods, minutesToHours, periodRangeLabel, type CreditType } from "@/lib/dp-model";

type Period = Awaited<ReturnType<typeof fetchPeriods>>[number];
type ExcelWorkbook = import("exceljs").Workbook;
type ExcelCell = import("exceljs").Cell;

type PreviewRow = {
  id: string;
  sheet: string;
  rowNumber: number;
  employeeName: string;
  employeeId: string | null;
  periodId: string | null;
  startDate: string;
  endDate: string;
  debit: number;
  he60: number;
  he60Night: number;
  he100: number;
  he100Night: number;
  night: number;
  interjornada: number;
  saldo: number;
  status: "ok" | "nao_encontrado" | "competencia_nao_encontrada";
  message: string;
};

type Employee = { id: string; full_name: string; status?: string };

type SyncChange = {
  id: string;
  kind: "nova_linha" | "atualizacao";
  sheet: string;
  employeeName: string;
  periodLabel: string;
  details: string;
};

const TARGET_PERIOD_START_DATES = new Set(["2026-07-21", "2026-08-21"]);
const TEMPLATE_DB = "dp-success-planilha-sync";
const TEMPLATE_STORE = "template";

async function saveTemplateLocally(buffer: ArrayBuffer, name: string) {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(TEMPLATE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(TEMPLATE_STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(TEMPLATE_STORE, "readwrite");
      tx.objectStore(TEMPLATE_STORE).put({ buffer, name }, "current");
      tx.oncomplete = () => { request.result.close(); resolve(); };
      tx.onerror = () => { request.result.close(); reject(tx.error); };
    };
  });
}

async function loadTemplateLocally(): Promise<{ buffer: ArrayBuffer; name: string } | null> {
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(TEMPLATE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(TEMPLATE_STORE);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(TEMPLATE_STORE, "readonly");
      const get = tx.objectStore(TEMPLATE_STORE).get("current");
      get.onsuccess = () => { request.result.close(); resolve(get.result ?? null); };
      get.onerror = () => { request.result.close(); reject(get.error); };
    };
  });
}


function normalizeName(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIsoDate(value: string) {
  const m = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${year}-${m[2]}-${m[1]}`;
}

function parseRange(value: unknown) {
  const text = String(value ?? "").trim();
  const m = text.match(/(\d{2}\/\d{2}\/\d{2,4})\s*-\s*(\d{2}\/\d{2}\/\d{2,4})/);
  if (!m) return null;
  const startDate = parseIsoDate(m[1]);
  const endDate = parseIsoDate(m[2]);
  return startDate && endDate ? { startDate, endDate } : null;
}

function excelCellText(cell: ExcelCell) {
  const value: any = cell.value;
  if (value && typeof value === "object" && "result" in value) return excelValueText(value.result);
  return excelValueText(value);
}

function excelValueText(value: any): string {
  if (value && typeof value === "object" && Array.isArray(value.richText)) {
    return value.richText.map((part: any) => String(part?.text ?? "")).join("").trim();
  }
  return String(value ?? "").trim();
}

function cellMinutes(cell: ExcelCell, date1904 = false) {
  // A planilha enviada usa o sistema de datas 1904. Quando o ExcelJS
  // materializa uma duração como Date, getHours()/getMinutes() aplica o fuso
  // histórico de São Paulo e transforma 00:00 em 20:53. Recuperamos o serial
  // usando o epoch correto do próprio arquivo.
  const value: any = cell.value;
  if (value && typeof value === "object" && "result" in value) {
    return cellMinutesFromValue(value.result, date1904);
  }
  return cellMinutesFromValue(value, date1904);
}

function cellMinutesFromText(text: string): number | null {
  const normalized = text.replace(/\u00a0/g, " ").trim();
  if (!normalized) return 0;
  const hm = normalized.match(/^(-)?(\d+):(\d{1,2})(?::\d{1,2})?$/);
  if (hm) {
    const sign = hm[1] ? -1 : 1;
    return sign * (Number(hm[2]) * 60 + Number(hm[3]));
  }
  const decimal = Number(normalized.replace(",", "."));
  return Number.isFinite(decimal) ? Math.round(decimal * 60) : null;
}

function cellMinutesFromValue(value: any, date1904 = false): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const excelEpochUtc = date1904
      ? Date.UTC(1904, 0, 1)
      : Date.UTC(1899, 11, 30);
    return Math.round((value.getTime() - excelEpochUtc) / 60000);
  }
  if (typeof value === "number") {
    return Math.round(value * 24 * 60);
  }
  const text = excelValueText(value);
  const parsed = cellMinutesFromText(text);
  return parsed ?? 0;
}

function setTimeCell(cell: ExcelCell, minutes: number) {
  cell.value = Math.max(0, Math.round(minutes)) / 1440;
}

function rowKey(sheet: string, employeeName: string, startDate: string, endDate: string) {
  return [sheet, normalizeName(employeeName), startDate, endDate].join("|");
}

function buildEmployeeIndex(employees: Employee[]) {
  const exact = new Map<string, Employee>();
  for (const employee of employees) exact.set(normalizeName(employee.full_name), employee);
  return exact;
}

function resolveEmployee(name: string, employees: Employee[], exact: Map<string, Employee>, aliases: Record<string, string>) {
  const normalized = normalizeName(name);
  const aliasId = aliases[normalized];
  if (aliasId) {
    const aliased = employees.find(e => e.id === aliasId);
    if (aliased) return { employee: aliased, ambiguous: false };
  }
  const direct = exact.get(normalized);
  if (direct) return { employee: direct, ambiguous: false };

  const candidates = employees.filter(employee => {
    const full = normalizeName(employee.full_name);
    return full === normalized || full.includes(normalized) || normalized.includes(full);
  });
  if (candidates.length === 1) return { employee: candidates[0], ambiguous: false };
  return { employee: null, ambiguous: candidates.length > 1 };
}

async function readWorkbookRows(
  workbook: ExcelWorkbook,
  employees: Employee[],
  periods: Period[],
  aliases: Record<string, string>,
) {
  const exact = buildEmployeeIndex(employees);
  const output: PreviewRow[] = [];
  for (const worksheet of workbook.worksheets) {
    let currentEmployee = "";
    for (let r = 1; r <= worksheet.rowCount; r += 1) {
      const row = worksheet.getRow(r);
      const b = excelCellText(row.getCell(2));
      const c = excelCellText(row.getCell(3));

      if (b.toUpperCase() === "EMPRESA" && c.toUpperCase() === "FUNCIONÁRIO") {
        currentEmployee = excelCellText(worksheet.getRow(r + 1).getCell(3));
        continue;
      }

      if (!currentEmployee) continue;
      const range = parseRange(b);
      // A planilha possui períodos parciais para desligamentos (ex.: 21/07–22/08).
      // A competência correta é determinada pela data de início; linhas de férias e outras
      // linhas auxiliares não entram na sincronização.
      if (!range || !TARGET_PERIOD_START_DATES.has(range.startDate)) continue;

      const resolved = resolveEmployee(currentEmployee, employees, exact, aliases);
      const period = periods.find(p => p.start_date === range.startDate);
      const date1904 = Boolean((workbook as any).properties?.date1904);
      const debit = cellMinutes(row.getCell(3), date1904);
      const he60 = cellMinutes(row.getCell(4), date1904);
      const he60Night = cellMinutes(row.getCell(5), date1904);
      const he100 = cellMinutes(row.getCell(6), date1904);
      const he100Night = cellMinutes(row.getCell(7), date1904);
      const night = cellMinutes(row.getCell(8), date1904);
      // O saldo oficial é o TOTAL SALDO da própria linha da planilha (coluna I).
      // Não recalcular, não incluir NOT e não misturar valores de outras linhas.
      const saldo = cellMinutes(row.getCell(9), date1904);
      const interjornadaColumn = worksheet.name === "SEV.EXC.EMP" ? 14 : 19;
      const interjornada = cellMinutes(row.getCell(interjornadaColumn), date1904);

      let status: PreviewRow["status"] = "ok";
      let message = "Pronto para importar";
      if (!resolved.employee) {
        status = "nao_encontrado";
        message = resolved.ambiguous ? "Nome abreviado corresponde a mais de um funcionário" : "Funcionário não encontrado";
      } else if (!period) {
        status = "competencia_nao_encontrada";
        message = "Crie esta competência no Fechamento antes de importar";
      }

      output.push({
        id: rowKey(worksheet.name, currentEmployee, range.startDate, range.endDate),
        sheet: worksheet.name,
        rowNumber: r,
        employeeName: currentEmployee,
        employeeId: resolved.employee?.id ?? null,
        periodId: period?.id ?? null,
        startDate: range.startDate,
        endDate: range.endDate,
        debit, he60, he60Night, he100, he100Night, night, interjornada, saldo,
        status, message,
      });
    }
  }
  return output;
}

export function SincronizarPlanilha() {
  const inputRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<ExcelWorkbook | null>(null);
  const templateBufferRef = useRef<ArrayBuffer | null>(null);
  const fileNameRef = useRef("planilha-atualizada.xlsx");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [syncChanges, setSyncChanges] = useState<SyncChange[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [aliases, setAliases] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("dp-success:xlsx-aliases") || "{}"); } catch { return {}; }
  });

  const counts = useMemo(() => ({
    ok: rows.filter(r => r.status === "ok").length,
    unmatched: rows.filter(r => r.status === "nao_encontrado").length,
    missingPeriod: rows.filter(r => r.status === "competencia_nao_encontrada").length,
  }), [rows]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const saved = await loadTemplateLocally();
        if (!saved || !active) return;
        const { default: ExcelJS } = await import("exceljs");
        const { employees: loadedEmployees, periods: loadedPeriods } = await ensureBase();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(saved.buffer);
        const parsed = await readWorkbookRows(workbook, loadedEmployees, loadedPeriods, aliases);
        if (!active) return;
        workbookRef.current = workbook;
        templateBufferRef.current = saved.buffer;
        fileNameRef.current = saved.name.replace(/\.xlsx$/i, "") + " - atualizada.xlsx";
        setFileName(saved.name);
        setRows(parsed);
        setSelectedIds(parsed.filter(r => r.status === "ok").map(r => r.id));
        setMessage("Modelo salvo neste navegador foi recuperado. Você pode importar, lançar manualmente e atualizar a planilha.");
      } catch {
        // Se não houver um modelo local válido, a tela continua normalmente.
      }
    })();
    return () => { active = false; };
  }, []);

  async function ensureBase() {
    const [employeesResult, periodResult] = await Promise.all([
      supabase.from("employees").select("id,full_name,status").order("full_name"),
      fetchPeriods(),
    ]);
    if (employeesResult.error) throw new Error(employeesResult.error.message);
    setEmployees(employeesResult.data ?? []);
    setPeriods(periodResult);
    return { employees: employeesResult.data ?? [], periods: periodResult };
  }

  async function readFile(file: File) {
    setLoading(true); setError(""); setMessage("");
    try {
      const { employees: loadedEmployees, periods: loadedPeriods } = await ensureBase();
      const { default: ExcelJS } = await import("exceljs");
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      await saveTemplateLocally(buffer, file.name);
      const parsed = await readWorkbookRows(workbook, loadedEmployees, loadedPeriods, aliases);
      if (!parsed.length) throw new Error("Não encontrei as competências 21/07/2026–20/08/2026 ou 21/08/2026–20/09/2026 na planilha.");
      workbookRef.current = workbook;
      templateBufferRef.current = buffer;
      fileNameRef.current = file.name.replace(/\.xlsx$/i, "") + " - atualizada.xlsx";
      setFileName(file.name);
      setRows(parsed);
      setSelectedIds(parsed.filter(r => r.status === "ok").map(r => r.id));
      setMessage("Planilha lida. Confira os funcionários antes de importar.");
    } catch (e) {
      workbookRef.current = null;
      setRows([]);
      setError(e instanceof Error ? e.message : "Não foi possível ler a planilha.");
    } finally {
      setLoading(false);
    }
  }

  function saveAlias(row: PreviewRow, employeeId: string) {
    const next = { ...aliases, [normalizeName(row.employeeName)]: employeeId };
    setAliases(next);
    window.localStorage.setItem("dp-success:xlsx-aliases", JSON.stringify(next));
    setRows(current => current.map(item => item.id === row.id ? { ...item, employeeId, status: "ok", message: "Funcionário associado" } : item));
    setSelectedIds(current => current.includes(row.id) ? current : [...current, row.id]);
  }

  async function importSelected() {
    if (!workbookRef.current) return;
    const selected = rows.filter(r => selectedIds.includes(r.id) && r.status === "ok" && r.employeeId && r.periodId);
    if (!selected.length) return setError("Selecione pelo menos uma linha válida para importar.");
    setLoading(true); setError(""); setMessage("");
    try {
      const db = supabase as any;
      const { data: auth } = await supabase.auth.getUser();
      let imported = 0;

      for (const row of selected) {
        const groupId = crypto.randomUUID();
        const sourceToken = `[XLSX_IMPORT:${row.sheet}|${normalizeName(row.employeeName)}|${row.startDate}|${row.endDate}]`;

        const existingCredits = await db.from("overtime_records")
          .select("id,launch_group_id,notes")
          .eq("employee_id", row.employeeId)
          .eq("period_id", row.periodId)
          .ilike("notes", `%${sourceToken}%`);
        if (existingCredits.error) throw new Error(existingCredits.error.message);

        const existingDebits = await db.from("bank_hours")
          .select("id,launch_group_id,justification")
          .eq("employee_id", row.employeeId)
          .eq("period_id", row.periodId)
          .eq("kind", "debito")
          .ilike("justification", `%${sourceToken}%`);
        if (existingDebits.error) throw new Error(existingDebits.error.message);

        const oldIds = [
          ...(existingCredits.data ?? []).map((x: any) => x.id),
          ...(existingDebits.data ?? []).map((x: any) => x.id),
        ];
        if (oldIds.length) {
          const oldCreditIds = (existingCredits.data ?? []).map((x: any) => x.id);
          const oldDebitIds = (existingDebits.data ?? []).map((x: any) => x.id);
          if (oldCreditIds.length) {
            const del = await db.from("overtime_records").delete().in("id", oldCreditIds);
            if (del.error) throw new Error(del.error.message);
          }
          if (oldDebitIds.length) {
            const del = await db.from("bank_hours").delete().in("id", oldDebitIds);
            if (del.error) throw new Error(del.error.message);
          }
        }

        const creditRows: any[] = [];
        const addCredit = (type: CreditType, minutes: number) => {
          if (minutes <= 0) return;
          creditRows.push({
            employee_id: row.employeeId,
            reference_date: row.endDate,
            period_id: row.periodId,
            minutes,
            launch_type: type,
            rate_percent: CREDIT_TYPES[type].ratePercent,
            launch_group_id: groupId,
            notes: `${sourceToken} ${CREDIT_TYPES[type].label}`,
          });
        };
        addCredit("HE_60", row.he60);
        addCredit("HE_60_NOTURNO", row.he60Night);
        addCredit("HE_100", row.he100);
        addCredit("HE_100_NOTURNO", row.he100Night);
        addCredit("ADICIONAL_NOTURNO", row.night);
        addCredit("INTERJORNADA_50", row.interjornada);

        if (creditRows.length) {
          const result = await db.from("overtime_records").insert(creditRows);
          if (result.error) throw new Error(result.error.message);
        }
        if (row.debit > 0) {
          const result = await db.from("bank_hours").insert({
            employee_id: row.employeeId,
            entry_date: row.endDate,
            period_id: row.periodId,
            kind: "debito",
            minutes: row.debit,
            previous_balance_minutes: 0,
            balance_minutes: 0,
            justification: `${sourceToken} Débito / atraso importado da planilha`,
            launch_group_id: groupId,
            created_by: auth.user?.id ?? null,
          });
          if (result.error) throw new Error(result.error.message);
        }
        imported += 1;
      }

      setMessage(`${imported} competência(s)/funcionário(s) importada(s). Saldo do mês não foi lançado separadamente: o DP Success calcula o saldo a partir da composição.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao importar os lançamentos.");
    } finally {
      setLoading(false);
    }
  }

  async function discardSpreadsheet() {
    if (!window.confirm("Desconsiderar a planilha atual? Isso apenas remove a planilha carregada desta tela e do navegador. Nenhum dado já importado para o DP Success será excluído.")) return;
    try {
      if (typeof indexedDB !== "undefined") {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open(TEMPLATE_DB, 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction(TEMPLATE_STORE, "readwrite");
            tx.objectStore(TEMPLATE_STORE).delete("current");
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
          };
        });
      }
      workbookRef.current = null;
      templateBufferRef.current = null;
      fileNameRef.current = "planilha-atualizada.xlsx";
      setFileName("");
      setRows([]);
      setSelectedIds([]);
      setMessage("Planilha desconsiderada. Nenhum lançamento do DP Success foi excluído.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível desconsiderar a planilha.");
    }
  }


  function formatExcelDate(date: string) {
    const [year, month, day] = date.split("-");
    return `${day}/${month}/${year.slice(-2)}`;
  }

  function formatExcelPeriod(startDate: string, endDate: string) {
    return `${formatExcelDate(startDate)} - ${formatExcelDate(endDate)}`;
  }

  function translateFormulaRows(formula: string, sourceRow: number, targetRow: number) {
    return formula.replace(/(\$?[A-Z]{1,3})(\$?)(\d+)/g, (_match, col, absRow, rowNumber) => {
      if (absRow === "$") return `${col}${absRow}${rowNumber}`;
      return `${col}${targetRow}`;
    });
  }

  function copyInsertedRowStyle(sourceRow: any, targetRow: any, maxColumn = 19) {
    targetRow.height = sourceRow.height;
    targetRow.hidden = sourceRow.hidden;
    targetRow.outlineLevel = sourceRow.outlineLevel;
    for (let col = 1; col <= maxColumn; col += 1) {
      const sourceCell = sourceRow.getCell(col);
      const targetCell = targetRow.getCell(col);
      targetCell.style = sourceCell.style;
      targetCell.numFmt = sourceCell.numFmt;
      targetCell.alignment = sourceCell.alignment;
      targetCell.border = sourceCell.border;
      targetCell.fill = sourceCell.fill;
      targetCell.font = sourceCell.font;
      targetCell.protection = sourceCell.protection;
      if (typeof sourceCell.value === "string" && sourceCell.value.startsWith("=")) {
        targetCell.value = { formula: translateFormulaRows(sourceCell.value.slice(1), sourceRow.number, targetRow.number) };
      } else if (sourceCell.value !== null && sourceCell.value !== undefined) {
        targetCell.value = sourceCell.value;
      }
    }
  }

  function cloneRowContent(sourceRow: any, targetRow: any, maxColumn = 19) {
  targetRow.height = sourceRow.height;
  targetRow.hidden = sourceRow.hidden;
  targetRow.outlineLevel = sourceRow.outlineLevel;
  for (let col = 1; col <= maxColumn; col += 1) {
    const sourceCell = sourceRow.getCell(col);
    const targetCell = targetRow.getCell(col);
    targetCell.style = sourceCell.style;
    targetCell.numFmt = sourceCell.numFmt;
    targetCell.alignment = sourceCell.alignment;
    targetCell.border = sourceCell.border;
    targetCell.fill = sourceCell.fill;
    targetCell.font = sourceCell.font;
    targetCell.protection = sourceCell.protection;
    const value: any = sourceCell.value;
    if (value && typeof value === "object" && "formula" in value) {
      targetCell.value = {
        formula: translateFormulaRows(String(value.formula), sourceRow.number, targetRow.number),
        result: value.result,
      };
    } else if (typeof value === "string" && value.startsWith("=")) {
      targetCell.value = { formula: translateFormulaRows(value.slice(1), sourceRow.number, targetRow.number) };
    } else {
      targetCell.value = value;
    }
  }
}

function insertDataRowWithoutSplice(worksheet: any, totalRowNumber: number, templateRowNumber: number) {
  // O modelo possui linhas vazias entre os blocos. Aproveitamos a primeira linha
  // vazia logo abaixo do TOTAL, evitando qualquer insert/splice no ExcelJS.
  const nextRow = worksheet.getRow(totalRowNumber + 1);
  const hasContent = Array.from({ length: 19 }, (_, index) => excelCellText(nextRow.getCell(index + 1))).some(Boolean);
  if (hasContent) {
    throw new Error(
      `Não foi possível criar a nova competência porque não há uma linha vazia após o TOTAL do funcionário na aba "${worksheet.name}".`
    );
  }

  const sourceTotal = worksheet.getRow(totalRowNumber);
  cloneRowContent(sourceTotal, nextRow, 19);

  const insertedRow = worksheet.getRow(totalRowNumber);
  const templateRow = worksheet.getRow(templateRowNumber);
  cloneRowContent(templateRow, insertedRow, 19);

  return insertedRow;
}
function setFormulaCell(cell: ExcelCell, formula: string) {
    cell.value = { formula };
  }

  function writeExcelComposition(
    excelRow: any,
    composition: Record<string, number>,
    debit: number,
    sheetName: string,
  ) {
    setTimeCell(excelRow.getCell(3), debit);
    setTimeCell(excelRow.getCell(4), composition.HE_60 ?? 0);
    setTimeCell(excelRow.getCell(5), composition.HE_60_NOTURNO ?? 0);
    setTimeCell(excelRow.getCell(6), composition.HE_100 ?? 0);
    setTimeCell(excelRow.getCell(7), composition.HE_100_NOTURNO ?? 0);
    setTimeCell(excelRow.getCell(8), composition.ADICIONAL_NOTURNO ?? 0);
    setFormulaCell(excelRow.getCell(9), `SUM(D${excelRow.number}:H${excelRow.number})-C${excelRow.number}`);
    setTimeCell(excelRow.getCell(sheetName === "SEV.EXC.EMP" ? 14 : 19), composition.INTERJORNADA_50 ?? 0);
  }

  function isNonZeroComposition(composition: Record<string, number>, debit: number) {
    return debit > 0 || Object.values(composition).some(value => Number(value) > 0);
  }

  function updateEmployeeTotalFormulas(worksheet: any, firstDataRow: number, lastDataRow: number, totalRowNumber: number) {
    if (lastDataRow < firstDataRow) return;
    setFormulaCell(worksheet.getRow(totalRowNumber).getCell(9), `SUM(I${firstDataRow}:I${lastDataRow})`);
    setFormulaCell(worksheet.getRow(totalRowNumber).getCell(14), `SUM(N${firstDataRow}:N${lastDataRow})`);
    const kFormula = worksheet.getRow(totalRowNumber).getCell(11).value;
    if (typeof kFormula === "string" && kFormula.startsWith("=")) {
      setFormulaCell(worksheet.getRow(totalRowNumber).getCell(11), translateFormulaRows(kFormula.slice(1), totalRowNumber, totalRowNumber));
    }
  }

  function findEmployeeBlocks(workbook: ExcelWorkbook) {
    const blocks: Array<{ worksheet: any; employeeName: string; startRow: number; endRow: number; totalRow: number; }> = [];
    for (const worksheet of workbook.worksheets) {
      let current: { employeeName: string; startRow: number; lastPeriodRow: number } | null = null;
      for (let r = 1; r <= worksheet.rowCount + 1; r += 1) {
        const row = worksheet.getRow(r);
        const b = excelCellText(row.getCell(2));
        const c = excelCellText(row.getCell(3));
        const isHeader = b.toUpperCase() === "EMPRESA" && c.toUpperCase() === "FUNCIONÁRIO";

        if (isHeader) {
          if (current) {
            const totalRow = current.lastPeriodRow + 1;
            blocks.push({
              worksheet,
              employeeName: current.employeeName,
              startRow: current.startRow,
              endRow: current.lastPeriodRow,
              totalRow,
            });
          }
          const employeeName = excelCellText(worksheet.getRow(r + 1).getCell(3));
          current = employeeName ? { employeeName, startRow: r + 2, lastPeriodRow: r + 1 } : null;
          continue;
        }

        if (!current) continue;
        const range = parseRange(b);
        if (range) current.lastPeriodRow = r;
      }
      if (current) {
        blocks.push({
          worksheet,
          employeeName: current.employeeName,
          startRow: current.startRow,
          endRow: current.lastPeriodRow,
          totalRow: current.lastPeriodRow + 1,
        });
      }
    }
    return blocks;
  }


  async function getCurrentSyncData(periodIdsOverride?: string[]) {
    const db = supabase as any;
    const allPeriods = await fetchPeriods();
    setPeriods(allPeriods);
    const periodIds = periodIdsOverride?.length ? periodIdsOverride : allPeriods.map(p => p.id);

    const [creditResult, debitResult] = await Promise.all([
      periodIds.length
        ? db.from("overtime_records").select("employee_id,minutes,launch_type,period_id").in("period_id", periodIds)
        : Promise.resolve({ data: [], error: null }),
      periodIds.length
        ? db.from("bank_hours").select("employee_id,minutes,period_id,kind").eq("kind", "debito").in("period_id", periodIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (creditResult.error) throw new Error(creditResult.error.message);
    if (debitResult.error) throw new Error(debitResult.error.message);

    const creditMap = new Map<string, Record<string, number>>();
    for (const row of creditResult.data ?? []) {
      const key = `${row.employee_id}|${row.period_id ?? ""}`;
      const item = creditMap.get(key) ?? {};
      item[row.launch_type] = (item[row.launch_type] ?? 0) + Math.abs(Number(row.minutes) || 0);
      creditMap.set(key, item);
    }

    const debitMap = new Map<string, number>();
    for (const row of debitResult.data ?? []) {
      const key = `${row.employee_id}|${row.period_id ?? ""}`;
      debitMap.set(key, (debitMap.get(key) ?? 0) + Math.abs(Number(row.minutes) || 0));
    }
    return { allPeriods, creditMap, debitMap };
  }

  function compositionLabel(composition: Record<string, number>, debit: number) {
    const parts: string[] = [];
    if (debit > 0) parts.push(`Débito ${minutesToHours(debit)}`);
    if ((composition.HE_60 ?? 0) > 0) parts.push(`HE 60% ${minutesToHours(composition.HE_60)}`);
    if ((composition.HE_60_NOTURNO ?? 0) > 0) parts.push(`60%+20% ${minutesToHours(composition.HE_60_NOTURNO)}`);
    if ((composition.HE_100 ?? 0) > 0) parts.push(`HE 100% ${minutesToHours(composition.HE_100)}`);
    if ((composition.HE_100_NOTURNO ?? 0) > 0) parts.push(`100%+20% ${minutesToHours(composition.HE_100_NOTURNO)}`);
    if ((composition.ADICIONAL_NOTURNO ?? 0) > 0) parts.push(`Noturno ${minutesToHours(composition.ADICIONAL_NOTURNO)}`);
    if ((composition.INTERJORNADA_50 ?? 0) > 0) parts.push(`Interj. ${minutesToHours(composition.INTERJORNADA_50)}`);
    return parts.join(" · ") || "Sem movimentação";
  }

  function sameComposition(row: PreviewRow, composition: Record<string, number>, debit: number) {
    return row.debit === debit
      && row.he60 === (composition.HE_60 ?? 0)
      && row.he60Night === (composition.HE_60_NOTURNO ?? 0)
      && row.he100 === (composition.HE_100 ?? 0)
      && row.he100Night === (composition.HE_100_NOTURNO ?? 0)
      && row.night === (composition.ADICIONAL_NOTURNO ?? 0)
      && row.interjornada === (composition.INTERJORNADA_50 ?? 0);
  }

  async function buildSyncPreview() {
    if (!workbookRef.current) {
      setError("Importe uma planilha antes de pré-visualizar a atualização.");
      return;
    }

    setPreviewLoading(true);
    setError("");
    setMessage("");

    try {
      // A pré-visualização não depende das fórmulas do Excel nem tenta alterar o arquivo.
      // Ela compara somente os lançamentos salvos no DP Success com as competências
      // existentes no modelo e também identifica competências novas para funcionários
      // que já aparecem no modelo.
      const { data: periodData, error: periodError } = await supabase
        .from("time_periods")
        .select("id,reference_year,reference_month,start_date,end_date,status")
        .order("start_date", { ascending: true });

      if (periodError) throw new Error(`Competências: ${periodError.message}`);

      const currentPeriods = (periodData ?? []) as Period[];
      if (!currentPeriods.length) {
        throw new Error("Nenhuma competência foi encontrada no DP Success.");
      }

      const periodIds = currentPeriods.map(period => period.id);
      const { creditMap, debitMap } = await getCurrentSyncData(periodIds);
      const changes: SyncChange[] = [];

      // A pré-visualização deve mostrar somente competências novas.
      // Alterações em linhas que já existem não entram nesta etapa.
      const employeeSheets = new Map<string, string>();

      for (const worksheet of workbookRef.current.worksheets) {
        for (let r = 1; r <= worksheet.rowCount; r += 1) {
          const row = worksheet.getRow(r);
          const b = excelCellText(row.getCell(2));
          const c = excelCellText(row.getCell(3));
          if (b.toUpperCase() !== "EMPRESA" || c.toUpperCase() !== "FUNCIONÁRIO") continue;

          const nextRow = worksheet.getRow(r + 1);
          const employeeName = excelCellText(nextRow.getCell(3));
          if (employeeName) {
            employeeSheets.set(`${worksheet.name}|${normalizeName(employeeName)}`, employeeName);
          }
        }
      }

      const exact = buildEmployeeIndex(employees);

      for (const [sheetEmployeeKey, employeeName] of employeeSheets) {
        const separator = sheetEmployeeKey.indexOf("|");
        const sheetName = sheetEmployeeKey.slice(0, separator);
        const resolved = resolveEmployee(employeeName, employees, exact, aliases).employee;
        if (!resolved) continue;

        const existingRowsForEmployee = rows
          .filter(item => item.employeeId === resolved.id && item.sheet === sheetName)
          .sort((a, b) => a.startDate.localeCompare(b.startDate));

        if (!existingRowsForEmployee.length) continue;

        const existingStarts = new Set(existingRowsForEmployee.map(item => item.startDate));
        const maxExistingStart = existingRowsForEmployee[existingRowsForEmployee.length - 1].startDate;

        for (const period of currentPeriods) {
          if (period.start_date <= maxExistingStart || existingStarts.has(period.start_date)) continue;

          const composition = creditMap.get(`${resolved.id}|${period.id}`) ?? {};
          const debit = debitMap.get(`${resolved.id}|${period.id}`) ?? 0;

          if (!isNonZeroComposition(composition, debit)) continue;

          changes.push({
            id: `new|${sheetName}|${resolved.id}|${period.id}`,
            kind: "nova_linha",
            sheet: sheetName,
            employeeName,
            periodLabel: periodRangeLabel({
              start_date: period.start_date,
              end_date: period.end_date,
            }),
            details: compositionLabel(composition, debit),
          });

          existingStarts.add(period.start_date);
        }
      }

      setPeriods(currentPeriods);
      setSyncChanges(changes);
      setPreviewOpen(true);

      const novas = changes.filter(change => change.kind === "nova_linha").length;
      const atualizacoes = changes.filter(change => change.kind === "atualizacao").length;

      if (!changes.length) {
        setMessage("Nenhuma alteração foi identificada.");
      } else {
        setMessage(`Pré-visualização concluída: ${novas} nova(s) competência(s) e ${atualizacoes} atualização(ões).`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível calcular a pré-visualização.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function exportUpdated() {
    if (!templateBufferRef.current) {
      setError("Importe novamente a planilha para gerar a cópia atualizada.");
      return;
    }
    setExporting(true); setError(""); setMessage("");
    try {
      const { default: ExcelJS } = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateBufferRef.current);
      const periodIds = [...new Set(rows.map(r => r.periodId).filter((id): id is string => Boolean(id)))];
      const { allPeriods, creditMap, debitMap } = await getCurrentSyncData(periodIds);
      let updated = 0;

      // Mantém a estrutura original do arquivo: somente as linhas já existentes
      // são preenchidas. Não usamos spliceRows nem criamos novas linhas.
      for (const row of rows) {
        const worksheet = workbook.getWorksheet(row.sheet);
        if (!worksheet || row.status !== "ok" || !row.employeeId || !row.periodId) continue;
        const period = allPeriods.find(p => p.id === row.periodId);
        if (!period) continue;
        writeExcelComposition(
          worksheet.getRow(row.rowNumber),
          creditMap.get(`${row.employeeId}|${period.id}`) ?? {},
          debitMap.get(`${row.employeeId}|${period.id}`) ?? 0,
          row.sheet,
        );
        updated += 1;
      }

      setMessage("Gerando o arquivo Excel atualizado…");
      await new Promise(resolve => setTimeout(resolve, 50));
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileNameRef.current || "planilha-atualizada.xlsx";
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 1500);
      setMessage(`Download iniciado. ${updated} linha(s) existente(s) atualizada(s). Somente as horas foram preenchidas; saldo e totais permanecem por conta do Excel.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar/baixar a planilha.");
    } finally {
      setExporting(false);
    }
  }

  const actionAllowed = typeof document === "undefined" || !document.body.classList.contains("role-consulta");

  return (
    <ScreenShell
      section="Fechamento de Ponto"
      title="Sincronizar planilha"
      name="Sincronizar Planilha"
      subtitle="Leia as competências de agosto e setembro, importe os lançamentos e depois gere uma cópia atualizada a partir dos lançamentos atuais do DP Success."
      error={error}
      actions={actionAllowed ? <>
        <button data-role-sensitive className={btnOutline} onClick={() => inputRef.current?.click()} disabled={loading}><Upload className="h-4 w-4" /> Importar planilha</button>
        <button data-role-sensitive className={btnPrimary} onClick={() => void buildSyncPreview()} disabled={!workbookRef.current || loading || previewLoading || exporting}><RefreshCw className="h-4 w-4" /> {previewLoading ? "Analisando..." : "Pré-visualizar atualização"}</button>
        <button data-role-sensitive className={btnOutline} onClick={() => void discardSpreadsheet()} disabled={loading || !rows.length}><AlertTriangle className="h-4 w-4" /> Desconsiderar planilha</button>
      </> : undefined}
    >
      <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void readFile(file); e.currentTarget.value = ""; }} />

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card className="p-5"><FileSpreadsheet className="h-5 w-5 text-primary" /><p className="mt-3 text-sm text-muted-foreground">Linhas encontradas</p><p className="mt-1 text-2xl font-bold">{rows.length}</p></Card>
        <Card className="p-5"><CheckCircle2 className="h-5 w-5 text-primary" /><p className="mt-3 text-sm text-muted-foreground">Prontas</p><p className="mt-1 text-2xl font-bold">{counts.ok}</p></Card>
        <Card className="p-5"><AlertTriangle className="h-5 w-5 text-warning" /><p className="mt-3 text-sm text-muted-foreground">Precisam de conferência</p><p className="mt-1 text-2xl font-bold">{counts.unmatched + counts.missingPeriod}</p></Card>
      </div>

      <Card className="mt-6 p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold">Fluxo de teste</h2>
            <p className="mt-1 text-sm text-muted-foreground">1) importe a planilha · 2) confira os nomes · 3) importe os lançamentos · 4) faça alterações manuais · 5) pré-visualize as alterações · 6) baixe a planilha atualizada; saldo e totais continuam por conta do Excel.</p>
          </div>
          {actionAllowed && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                className={btnOutline}
                disabled={loading || !selectedIds.length}
                onClick={() => setSelectedIds([])}
              >
                Desmarcar todas
              </button>
              <button className={btnPrimary} disabled={loading || !selectedIds.length} onClick={() => void importSelected()}>
                <RefreshCw className="h-4 w-4" /> {loading ? "Importando..." : `Importar ${selectedIds.length} selecionada(s)`}
              </button>
            </div>
          )}
        </div>
        {fileName && <p className="mt-3 text-xs text-muted-foreground">Arquivo: {fileName}</p>}
      </Card>

      {message && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary">{message}</div>}

      {previewOpen && (
        <Card className="mt-6 overflow-hidden border-primary/20">
          <div className="border-b bg-primary/5 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold">Pré-visualização da atualização</h2>
                <p className="mt-1 text-sm text-muted-foreground">O sistema comparou os lançamentos atuais do DP Success com a planilha salva neste navegador.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="rounded-lg border bg-background px-4 py-2 text-center"><p className="text-xs text-muted-foreground">Novas linhas</p><p className="text-xl font-bold text-primary">{syncChanges.filter(c => c.kind === "nova_linha").length}</p></div>
                <div className="rounded-lg border bg-background px-4 py-2 text-center"><p className="text-xs text-muted-foreground">Atualizações</p><p className="text-xl font-bold">{syncChanges.filter(c => c.kind === "atualizacao").length}</p></div>
                <div className="rounded-lg border bg-background px-4 py-2 text-center"><p className="text-xs text-muted-foreground">Total de alterações</p><p className="text-xl font-bold">{syncChanges.length}</p></div>
              </div>
            </div>
            <p className="mt-4 text-sm font-semibold">
              {syncChanges.filter(c => c.kind === "nova_linha").length === 0 ? "Nenhuma linha nova foi identificada." : `${syncChanges.filter(c => c.kind === "nova_linha").length} nova(s) linha(s) identificada(s) para adicionar à planilha.`}
            </p>
          </div>
          {syncChanges.length > 0 ? (
            <>
              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background text-left text-xs"><tr><th className="px-4 py-3">Status</th><th className="px-4 py-3">Funcionário</th><th className="px-4 py-3">Competência</th><th className="px-4 py-3">Detalhes</th></tr></thead>
                  <tbody>{syncChanges.map(change => (
                    <tr key={change.id} className="border-t align-top">
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">{change.kind === "nova_linha" ? <span className="text-primary">Nova linha</span> : <span>Atualização</span>}</td>
                      <td className="px-4 py-3 font-medium">{change.employeeName}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{change.periodLabel}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{change.details}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="flex flex-col gap-3 border-t p-5 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-muted-foreground">Serão preenchidas somente as horas. Saldo, totais e fórmulas não serão alterados pelo sistema.</p>
                <button data-role-sensitive className={btnPrimary} onClick={() => void exportUpdated()} disabled={exporting || loading}><Download className="h-4 w-4" /> {exporting ? "Gerando Excel..." : "Baixar planilha atualizada"}</button>
              </div>
            </>
          ) : <div className="p-5"><p className="text-sm text-muted-foreground">Não há alterações para exportar.</p></div>}
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs">
                <tr>
                  <th className="px-4 py-3">Importar</th><th className="px-4 py-3">Funcionário</th><th className="px-4 py-3">Competência</th>
                  <th className="px-4 py-3">Débito</th><th className="px-4 py-3">HE 60%</th><th className="px-4 py-3">60%+20%</th>
                  <th className="px-4 py-3">HE 100%</th><th className="px-4 py-3">100%+20%</th><th className="px-4 py-3">Noturno</th><th className="px-4 py-3">Interj.</th><th className="px-4 py-3">Saldo (informativo)</th><th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} className="border-t align-top">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selectedIds.includes(row.id)} disabled={row.status !== "ok"} onChange={e => setSelectedIds(current => e.target.checked ? [...current, row.id] : current.filter(id => id !== row.id))} />
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {row.employeeName}
                      {row.status === "nao_encontrado" && (
                        <select className={`${inputCls} mt-2 min-w-[220px]`} value="" onChange={e => saveAlias(row, e.target.value)}>
                          <option value="">Associar a funcionário...</option>
                          {employees.map(employee => <option key={employee.id} value={employee.id}>{employee.full_name}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{periodRangeLabel({ start_date: row.startDate, end_date: row.endDate })}</td>
                    <td className="px-4 py-3">{minutesToHours(row.debit)}</td><td className="px-4 py-3">{minutesToHours(row.he60)}</td><td className="px-4 py-3">{minutesToHours(row.he60Night)}</td>
                    <td className="px-4 py-3">{minutesToHours(row.he100)}</td><td className="px-4 py-3">{minutesToHours(row.he100Night)}</td><td className="px-4 py-3">{minutesToHours(row.night)}</td>
                    <td className="px-4 py-3">{minutesToHours(row.interjornada)}</td><td className="px-4 py-3 font-semibold">{minutesToHours(row.saldo, true)}</td>
                    <td className="px-4 py-3 text-xs">{row.status === "ok" ? <span className="text-primary">{row.message}</span> : <span className="text-warning">{row.message}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!rows.length && !loading && <Card className="mt-6 p-8 text-center text-sm text-muted-foreground">Envie a planilha de horas para começar. A leitura considera as linhas AGO-SET e JUL-AGO de 2026 e não altera nada até você confirmar a importação.</Card>}
    </ScreenShell>
  );
}