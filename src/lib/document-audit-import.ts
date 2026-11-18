import * as XLSX from "xlsx";

export type AuditEmployee = {
  id: string;
  full_name: string;
  status?: string | null;
  hire_date?: string | null;
};

export type AuditRow = {
  key: string;
  fileName: string;
  sheetName: string;
  employeeName: string;
  hireDate: string | null;
  employeeId: string | null;
  employeeStatus: "matched" | "missing-hire-date" | "inactive" | "not-found" | "ambiguous";
  category: string;
  documentName: string;
  isStandard: boolean | null;
  completedOn: string | null;
  dueDate: string | null;
  notes: string | null;
  originalComment: string;
  issue: string | null;
};

export type AuditParseResult = {
  rows: AuditRow[];
  blocks: { fileName: string; sheetName: string; employeeName: string; hireDate: string | null; employeeStatus: AuditRow["employeeStatus"]; rowCount: number }[];
  errors: string[];
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9]/g, "");

const text = (value: unknown) => value == null ? "" : String(value).trim();

function parseDate(value: string): string | null {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += year >= 50 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function parseExcelDate(value: unknown): string | null {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return parseDate(`${String(parsed.d).padStart(2, "0")}/${String(parsed.m).padStart(2, "0")}/${parsed.y}`);
  }
  return parseDate(text(value));
}

function addValidity(dateIso: string, amount: number, unit: "year" | "month" | "day"): string {
  const [year, month, day] = dateIso.split("-").map(Number);
  if (unit === "day") return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
  const totalMonths = year * 12 + month - 1 + amount * (unit === "year" ? 12 : 1);
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = totalMonths % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function parseComment(comment: string) {
  const dateMatch = comment.match(/(?:assinado|realizado|conclu[ií]do|emitido|feito|data)\s*(?:em|:)?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  const completedOn = dateMatch ? parseDate(dateMatch[1]) : null;
  const validityMatch = comment.match(/(?:validade|vig[eê]ncia)\s*(?:de)?\s*(\d+)\s*(anos?|a|meses?|m[eê]s|dias?)/i);
  let dueDate: string | null = null;
  let issue: string | null = null;
  if (validityMatch && completedOn) {
    const amount = Number(validityMatch[1]);
    const rawUnit = validityMatch[2].toLocaleLowerCase("pt-BR");
    const unit = rawUnit.startsWith("ano") || rawUnit === "a" ? "year" : rawUnit.startsWith("mes") || rawUnit.startsWith("m") ? "month" : "day";
    dueDate = addValidity(completedOn, amount, unit);
  } else if (validityMatch && !completedOn) {
    issue = "Validade informada sem data de realização; vencimento não calculado.";
  }
  let notes = comment || null;
  if (completedOn && validityMatch) {
    notes = comment.replace(dateMatch?.[0] ?? "", "").replace(validityMatch[0], "").replace(/[|;\s]+/g, " ").trim() || null;
  }
  return { completedOn, dueDate, notes, issue };
}

const canonicalCategories = new Set(["Pessoais", "Contratação", "Responsabilidades anuais", "Medicina e Segurança do Trabalho", "Recibos", "Cartão de Ponto", "Advertências", "Vales avulsos, acordos diversos", "Diversos"]);

const categoryMap: Record<string, string> = {
  "documentos pessoais": "Pessoais",
  "contrato": "Contratação",
  "contrato admissão": "Contratação",
  "responsabilidades anuais": "Responsabilidades anuais",
  "medicina e segurança do trabalho": "Medicina e Segurança do Trabalho",
  "recibos": "Recibos",
  "recibos (férias e holerites)": "Recibos",
  "cartão de ponto": "Cartão de Ponto",
  "advertências": "Advertências",
  "advertências recebidas": "Advertências",
  "vales avulsos, acordos diversos": "Vales avulsos, acordos diversos",
  "contratos de vales avulsos, acordos diversos": "Vales avulsos, acordos diversos",
  "diversos": "Diversos",
};

function parseStandard(value: unknown): boolean | null {
  const normalized = text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (normalized === "sim" || normalized === "s" || normalized === "true") return true;
  if (normalized === "nao" || normalized === "n" || normalized === "false") return false;
  return null;
}

function resolveEmployee(name: string, hireDate: string | null, employees: AuditEmployee[]) {
  if (!hireDate) return { id: null, status: "missing-hire-date" as const };
  const matches = employees.filter(employee =>
    normalize(employee.full_name) === normalize(name) &&
    parseExcelDate(employee.hire_date) === hireDate
  );
  if (matches.length > 1) return { id: null, status: "ambiguous" as const };
  if (matches.length === 0) return { id: null, status: "not-found" as const };
  if ((matches[0].status || "").toLocaleLowerCase("pt-BR") !== "ativo") return { id: matches[0].id, status: "inactive" as const };
  return { id: matches[0].id, status: "matched" as const };
}

export async function parseDocumentAuditFiles(files: File[], employees: AuditEmployee[]): Promise<AuditParseResult> {
  const rows: AuditRow[] = [];
  const blocks: AuditParseResult["blocks"] = [];
  const errors: string[] = [];
  for (const file of files) {
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
        const blockColumns = new Set<number>();
        for (const row of matrix) {
          for (let col = 0; col < row.length - 2; col++) {
            if (text(row[col + 1]).toLocaleLowerCase("pt-BR") === "padrão?" &&
                text(row[col + 2]).toLocaleLowerCase("pt-BR") === "comentário") blockColumns.add(col);
          }
        }
        for (const startCol of blockColumns) {
          let firstHeader = -1;
          for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
            if (text(matrix[rowIndex]?.[startCol + 1]).toLocaleLowerCase("pt-BR") === "padrão?" &&
                text(matrix[rowIndex]?.[startCol + 2]).toLocaleLowerCase("pt-BR") === "comentário") {
              firstHeader = rowIndex;
              break;
            }
          }
          if (firstHeader < 0) continue;
          let employeeHeader = "";
          for (let rowIndex = firstHeader - 1; rowIndex >= 0; rowIndex--) {
            const candidate = text(matrix[rowIndex]?.[startCol]);
            if (candidate && /admiss[aã]o\s*:/i.test(candidate)) { employeeHeader = candidate; break; }
            if (candidate && !/auditoria dp/i.test(candidate) && !/admiss[aã]o\s*:/i.test(candidate)) {
              // A PJ-only block may have a name but no admission date; keep it for the explicit warning.
              if (/\s-\s(?:PJ|CLT)$/i.test(candidate)) { employeeHeader = candidate; break; }
            }
          }
          const admission = employeeHeader.match(/^(.*?)\s*-\s*Admiss[aã]o\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
          const employeeName = admission?.[1]?.trim() || employeeHeader.replace(/\s*-\s*(?:PJ|CLT)$/i, "").trim();
          const hireDate = admission ? parseDate(admission[2]) : null;
          const match = resolveEmployee(employeeName, hireDate, employees);
          let category = "";
          let blockRows = 0;
          for (let rowIndex = firstHeader; rowIndex < matrix.length; rowIndex++) {
            const row = matrix[rowIndex] ?? [];
            const documentName = text(row[startCol]);
            if (!documentName) continue;
            const standardCell = row[startCol + 1];
            const comment = text(row[startCol + 2]);
            const isCategory = text(standardCell).toLocaleLowerCase("pt-BR") === "padrão?" &&
              text(comment).toLocaleLowerCase("pt-BR") === "comentário";
            if (isCategory) {
              category = categoryMap[documentName.toLocaleLowerCase("pt-BR")] || documentName;
              continue;
            }
            if (!category || documentName.toLocaleLowerCase("pt-BR") === "padrão?") continue;
            const standard = parseStandard(standardCell);
            const parsedComment = parseComment(comment);
            const issues: string[] = [];
            if (parsedComment.issue) issues.push(parsedComment.issue);
            if (!match.id || match.status !== "matched") {
              issues.push(match.status === "missing-hire-date" ? "Bloco sem data de admissão válida." :
                match.status === "inactive" ? "Funcionário inativo/desligado; bloco bloqueado." :
                match.status === "ambiguous" ? "Mais de um funcionário corresponde ao nome e à admissão." :
                "Funcionário não encontrado com nome completo e admissão exatos.");
            }
            if (standard === null) issues.push("Valor de Padrão? ausente ou não reconhecido; revisar manualmente.");
            if (!canonicalCategories.has(category)) issues.push("Categoria fora da lista padrão do DP Success; precisa ser classificada antes da importação.");
            const issue = issues.length ? issues.join(" ") : null;
            const key = [file.name, sheetName, startCol, rowIndex + 1].join("::");
            rows.push({
              key, fileName: file.name, sheetName, employeeName, hireDate, employeeId: match.id,
              employeeStatus: match.status, category, documentName, isStandard: standard,
              completedOn: parsedComment.completedOn, dueDate: parsedComment.dueDate,
              notes: parsedComment.notes, originalComment: comment, issue,
            });
            blockRows++;
          }
          blocks.push({ fileName: file.name, sheetName, employeeName: employeeName || "Nome não identificado", hireDate,
            employeeStatus: match.status, rowCount: blockRows });
        }
      }
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "não foi possível ler a planilha"}`);
    }
  }
  return { rows, blocks, errors };
}
