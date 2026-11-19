// @ts-nocheck -- compact legacy code; strict index-signature checks disabled until refactor
import {pjRecordCategory} from "@/lib/pj-document-categories";
import * as XLSX from "xlsx";

export type AuditEmployee = {
  id: string;
  link?: "CLT" | "PJ";
  full_name: string;
  status?: string | null;
  hire_date?: string | null;
  termination_date?: string | null;
};

export type AuditRow = {
  key: string;
  fileName: string;
  sheetName: string;
  employeeName: string;
  hireDate: string | null;
  employeeId: string | null;
  link?: "CLT" | "PJ";
  employeeStatus: "matched" | "missing-hire-date" | "inactive" | "not-found" | "ambiguous";
  category: string;
  documentName: string;
  isStandard: boolean | null;
  completedOn: string | null;
  dueDate: string | null;
  notes: string | null;
  originalComment: string;
  issue: string | null;
  destination: "documents" | "certificates" | "declarations" | "absences";
  referenceDate: string | null;
  referenceDateLabel: string | null;
  durationDays: number | null;
  durationHours: number | null;
  cid: string | null;
  certificateType: "medico" | "odontologico" | "acompanhamento" | "outro" | null;
};

export type AuditParseResult = {
  rows: AuditRow[];
  blocks: { fileName: string; sheetName: string; employeeName: string; hireDate: string | null; employeeStatus: AuditRow["employeeStatus"]; link?: "CLT" | "PJ"; rowCount: number }[];
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

function parseDeliveredDate(comment: string): string | null {
  const match = comment.match(/entregue\s*m?\s*(?:em)?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  return match ? parseDate(match[1]) : null;
}

function parseHoursFromTitle(title: string): number | null {
  const match = title.match(/(\d{1,2})h(\d{2})?\s*(?:às|as|a)\s*(\d{1,2})h(\d{2})?/i);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2] || 0);
  const end = Number(match[3]) * 60 + Number(match[4] || 0);
  const minutes = end - start;
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : null;
}

export function auditTrainingKey(name: string): string | null {
  const key = normalize(name);
  const nr = key.match(/^nr0?(1|6|12|18|35)(?!\d)/);
  if (nr) return "nr" + nr[1].padStart(2, "0");
  if (/^(pta|plataformadetrabalhoaereo|plataformaelevatoria)/.test(key)) return "pta";
  return null;
}

function parseComment(comment: string) {
  const dateMatch = comment.match(/(?:assinad[oa]|realizad[oa]|conclu[ií]d[oa]|emitid[oa]|feit[oa]|data)\s*(?:em\s*|:\s*)?(\d{1,2}\/\d{1,2}\/(?:\d{4}|\d{2}))(?!\d)/i);
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
  "atestados": "Atestados",
  "faltas injustificadas descontadas em folha": "Faltas e Folgas",
};

function parseStandard(value: unknown): boolean | null {
  const normalized = text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (normalized === "sim" || normalized === "s" || normalized === "true") return true;
  if (normalized === "nao" || normalized === "n" || normalized === "false") return false;
  return null;
}

export function isAuditEmployeeActive(employee: AuditEmployee): boolean {
  const status = normalize(String(employee.status ?? ""));
  const termination = parseExcelDate(employee.termination_date);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return ["ativo", "active"].includes(status) && (!termination || termination > today);
}

function resolveEmployee(name: string, hireDate: string | null, employees: AuditEmployee[], link?: "CLT"|"PJ") {
  const named=employees.filter(e=>normalize(e.full_name)===normalize(name)&&(!link||(e.link??"CLT")===link));
  const matches=hireDate?named.filter(e=>parseExcelDate(e.hire_date)===hireDate):named;
  if(!hireDate&&(!matches.length||matches.some(e=>(e.link??"CLT")!=="PJ")))return {id:null,status:"missing-hire-date" as const,link};
  if(matches.length>1)return {id:null,status:"ambiguous" as const,link};
  if(!matches.length)return {id:null,status:"not-found" as const,link};
  const resolved=matches[0].link??"CLT";
  if(!isAuditEmployeeActive(matches[0]))return {id:null,status:"inactive" as const,link:resolved};
  return {id:matches[0].id,status:"matched" as const,link:resolved};
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
            if(candidate&&/(?:admiss[aã]o|in[ií]cio(?:\s+(?:do\s+)?contrato)?|contrata[cç][aã]o|presta[cç][aã]o\s+de\s+servi[cç]os)\s*:/i.test(candidate)){employeeHeader=candidate;break;}
            if(candidate&&(/(?:\s*[-–]\s*|\s*\()(?:PJ|CLT)\)?\s*$/i.test(candidate)||employees.some(e=>e.link==="PJ"&&normalize(e.full_name)===normalize(candidate)))){employeeHeader=candidate;break;}
          }
          const admission=employeeHeader.match(/^(.*?)\s*[-–]?\s*(?:Admiss[aã]o|In[ií]cio(?:\s+(?:do\s+)?contrato)?|Contrata[cç][aã]o|Presta[cç][aã]o\s+de\s+servi[cç]os)\s*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
          const rawName=(admission?.[1]||employeeHeader).trim();
          const marker=rawName.match(/(?:\s*[-–]\s*|\s*\()(PJ|CLT)\)?\s*$/i)||employeeHeader.match(/\s*[-–]\s*(PJ|CLT)\s*$/i);
          const link=marker?.[1]?.toUpperCase() as "CLT"|"PJ"|undefined;
          const employeeName=rawName.replace(/(?:\s*[-–]\s*|\s*\()(?:PJ|CLT)\)?\s*$/i,"").trim();
          const hireDate=admission?parseDate(admission[2]):null;
          const match=resolveEmployee(employeeName,hireDate,employees,link);
          if (match.status === "inactive") continue;
          let category = "";
          let blockRows = 0;
          for (let rowIndex = firstHeader; rowIndex < matrix.length; rowIndex++) {
            const row = matrix[rowIndex] ?? [];
            const rawDocumentValue = row[startCol];
            const sourceDate = parseExcelDate(rawDocumentValue);
            const documentName = rawDocumentValue instanceof Date && sourceDate ? sourceDate.split("-").reverse().join("/") : text(rawDocumentValue);
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
            const invoice=match.link==="PJ"&&pjRecordCategory(category,documentName)==="NFs";
            const standard = invoice?false:parseStandard(standardCell);
            if (auditTrainingKey(documentName) && !["Atestados", "Faltas e Folgas"].includes(category)) category = "Medicina e Segurança do Trabalho";
            const parsedComment = parseComment(comment);
            const categoryKey = normalize(category);
            const titleKey = normalize(documentName);
            const destination: AuditRow["destination"] = categoryKey === normalize("Atestados")
              ? (titleKey.startsWith("declaracao") ? "declarations" : "certificates")
              : categoryKey === normalize("Faltas e Folgas") ? "absences" : "documents";
            const deliveredDate = parseDeliveredDate(comment);
            const referenceDate = destination === "absences" ? sourceDate : deliveredDate;
            const durationDaysMatch = documentName.match(/(\d+)\s*dias?/i);
            const durationDays = durationDaysMatch ? Number(durationDaysMatch[1]) : null;
            const durationHours = destination === "declarations" ? parseHoursFromTitle(documentName) : null;
            const cidMatch = documentName.match(/\bCID\s*([A-Z0-9.]+)/i);
            const cid = cidMatch?.[1] ?? null;
            const certificateType: AuditRow["certificateType"] = /odont|dentist/i.test(documentName)
              ? "odontologico" : /acompanhante/i.test(documentName) ? "acompanhamento" : /^atestado/i.test(documentName) ? "medico" : "outro";
            const issues: string[] = [];
            if (parsedComment.issue && destination === "documents") issues.push(parsedComment.issue);
            if (!match.id || match.status !== "matched") {
              if (match.status === "missing-hire-date") issues.push("Bloco sem data de admissão válida.");
              else if (match.status === "inactive") issues.push("Funcionário inativo/desligado; bloco bloqueado.");
              else if (match.status === "ambiguous") issues.push("Mais de um funcionário corresponde ao nome e à admissão.");
              else {
                const sameName = employees.filter(employee => normalize(employee.full_name) === normalize(employeeName));
                const knownDates = [...new Set(sameName.map(employee => parseExcelDate(employee.hire_date)).filter(Boolean))];
                issues.push(sameName.length
                  ? "Nome encontrado, mas a admissão da planilha (" + hireDate?.split("-").reverse().join("/") + ") não coincide com a admissão cadastrada (" + (knownDates.map(date => date!.split("-").reverse().join("/")).join(", ") || "não informada") + ")."
                  : "Funcionário não encontrado pelo nome completo. Confira o nome no cadastro.");
              }
            }
            if (destination === "documents") {
              if (standard === null) issues.push("Valor de Padrão? ausente ou não reconhecido; revisar manualmente.");
              if (match.link !== "PJ" && !canonicalCategories.has(category)) issues.push("Categoria fora da lista padrão do DP Success; precisa ser classificada antes da importação.");
            } else if (destination === "absences" && !referenceDate) {
              issues.push("Data da falta não identificada na linha.");
            } else if (destination === "certificates") {
              if (!durationDays) issues.push("Quantidade de dias do atestado não identificada.");
              if (!referenceDate) issues.push("A planilha não informa data de início do afastamento; há somente a data de entrega.");
              else issues.push("A data disponível é de entrega do documento, não necessariamente o início do afastamento. Revisar antes de lançar.");
            } else if (destination === "declarations") {
              if (!durationHours) issues.push("Horário ou duração da declaração não identificado.");
              if (!referenceDate) issues.push("Data da declaração não identificada; a planilha pode informar somente a entrega.");
              else issues.push("A data disponível é de entrega do documento, não necessariamente a data do comparecimento. Revisar antes de lançar.");
            }
            const issue = issues.length ? issues.join(" ") : null;
            const key = [file.name, sheetName, startCol, rowIndex + 1].join("::");
            rows.push({
              key, fileName: file.name, sheetName, employeeName, hireDate, employeeId: match.id,
              employeeStatus: match.status, link:match.link, category:match.link==="PJ"?pjRecordCategory(category,documentName):category, documentName, isStandard: standard,
              completedOn: parsedComment.completedOn, dueDate: parsedComment.dueDate,
              notes: parsedComment.notes, originalComment: comment, issue, destination,
              referenceDate, referenceDateLabel: destination === "absences" ? "Data da falta" : "Data de entrega (conferir)",
              durationDays, durationHours, cid, certificateType,
            });
            blockRows++;
          }
          blocks.push({ fileName: file.name, sheetName, employeeName: employeeName || "Nome não identificado", hireDate,
            employeeStatus: match.status, link:match.link, rowCount: blockRows });
        }
      }
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : "não foi possível ler a planilha"}`);
    }
  }
  const identity = (name: string, date: string | null, link?:string) => normalize(name) + "|" + (link==="PJ"?"PJ":date??"");
  const counts = new Map<string, number>();
  for (const block of blocks) {
    if (!block.hireDate && block.link!=="PJ") continue;
    const key = identity(block.employeeName, block.hireDate,block.link);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const duplicateKeys = new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  for (const key of duplicateKeys) {
    const block = blocks.find(b => identity(b.employeeName, b.hireDate,b.link) === key);
    if (block) errors.push("Auditorias duplicadas ignoradas: " + block.employeeName + " (" + block.hireDate + ").");
  }
  return {
    rows: rows.filter(row => !duplicateKeys.has(identity(row.employeeName, row.hireDate,row.link))),
    blocks: blocks.filter(block => !duplicateKeys.has(identity(block.employeeName, block.hireDate,block.link))),
    errors,
  };
}
