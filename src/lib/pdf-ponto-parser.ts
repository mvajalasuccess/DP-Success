import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url,
).toString();

export type PointImportEntry = {
  date: string;
  minutes: number;
  kind: "credito" | "debito";
};

export type PointImportEmployee = {
  page: number;
  employeeName: string;
  registration: string | null;
  periodStart: string;
  periodEnd: string;
  entries: PointImportEntry[];
  atestados: string[];
  afastamentos: string[];
  interjornadaMinutes: number;
  additionalNightMinutes: number;
};

export type PointImportDocument = {
  fileName: string;
  fingerprint: string;
  employees: PointImportEmployee[];
};

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function toISODate(value: string) {
  const [day, month, year] = value.split("/");
  const fullYear = year.length === 2 ? `20${year}` : year;
  return `${fullYear}-${month}-${day}`;
}

function hhmmToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes >= 60) return 0;
  return hours * 60 + minutes;
}

function parsePage(text: string, page: number): PointImportEmployee | null {
  // PDF.js pode separar os campos do cabeçalho em vários itens de texto.
  // Por isso, não dependemos de espaços/linhas exatos no PDF.
  const period = text.match(/Per[ií]odo\s+de\s*(\d{2}\/\d{2}\/\d{4})\s*[àa]\s*(\d{2}\/\d{2}\/\d{4})/i);
  const employee = text.match(/Funcion[aá]rio\s*:\s*(?:\d+\s*-\s*)?(.+?)(?=\s+Matr[ií]cula\s*:|\n|$)/i)
    || text.match(/Funcion[aá]rio\s*:\s*(?:\d+\s*-\s*)?([^\n\r]+)/i);
  if (!period || !employee) return null;

  const registration = text.match(/Matr[ií]cula\s*:\s*([^\n\r]+)/i)?.[1]?.trim() || null;
  const tableStart = text.search(/Observa[cç][aã]o/i);
  const summaryStart = text.search(/Saldo Anterior\s*:/i);
  const table = text.slice(tableStart >= 0 ? tableStart : 0, summaryStart >= 0 ? summaryStart : text.length);

  const dateRegex = /(\d{2}\/\d{2}\/\d{2})/g;
  const dates = [...table.matchAll(dateRegex)];
  const entries: PointImportEntry[] = [];
  const atestados: string[] = [];
  const afastamentos: string[] = [];

  for (let i = 0; i < dates.length; i++) {
    const start = dates[i].index ?? 0;
    const end = i + 1 < dates.length ? (dates[i + 1].index ?? table.length) : table.length;
    const segment = table.slice(start, end);
    const date = toISODate(dates[i][1]);

    const event = segment.match(/(\d{3}:\d{2})\s*-\s*(Crédito|Débito)\s+no\s+BH/i);
    if (event) {
      entries.push({
        date,
        minutes: hhmmToMinutes(event[1]),
        kind: event[2].toLowerCase().startsWith("cr") ? "credito" : "debito",
      });
    }

    if (/Atestado Médico/i.test(segment)) atestados.push(date);
    if (/Outros Afastamentos/i.test(segment)) afastamentos.push(date);
  }

  const interjornada = text.match(/Interjornada\s+(\d{2,3}:\d{2})/i);
  const adNot = text.match(/Ad\.Not\.\s*\n?\s*\d+\s+\n?\s*(\d{2,3}:\d{2})/i);

  return {
    page,
    employeeName: normalizeText(employee[1]),
    registration,
    periodStart: toISODate(period[1]),
    periodEnd: toISODate(period[2]),
    entries,
    atestados,
    afastamentos,
    interjornadaMinutes: interjornada ? hhmmToMinutes(interjornada[1]) : 0,
    additionalNightMinutes: adNot ? hhmmToMinutes(adNot[1]) : 0,
  };
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, "0")).join("");
}

export async function parsePointCardPdf(file: File): Promise<PointImportDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fingerprint = await sha256(bytes);
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const employees: PointImportEmployee[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map(item => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const parsed = parsePage(text, pageNumber);
    if (parsed) employees.push(parsed);
  }

  return { fileName: file.name, fingerprint, employees };
}
