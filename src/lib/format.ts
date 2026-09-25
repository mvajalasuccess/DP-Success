/**
 * Formatação brasileira: datas DD/MM/YYYY, horários 24h, moeda em R$.
 * Camada única de apresentação — não duplicar formatação em componentes.
 */

export function formatDate(value?: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISODate(value) : value;
  if (!date || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "08:00:00" -> "08:00" */
export function formatTime(value?: string | null): string {
  if (!value) return "—";
  const [hours, minutes] = value.split(":");
  if (hours === undefined || minutes === undefined) return "—";
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

/** 495 -> "8h15" */
export function formatMinutes(total?: number | null): string {
  if (total === null || total === undefined) return "—";
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(Math.round(total));
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return `${sign}${hours}h${String(minutes).padStart(2, "0")}`;
}

/** 495 -> "+8h15" / -30 -> "-0h30" */
export function formatBalance(total?: number | null): string {
  if (total === null || total === undefined) return "—";
  if (total === 0) return "0h00";
  const prefix = total > 0 ? "+" : "";
  return `${prefix}${formatMinutes(total)}`;
}

/** 495 -> "8,25" (horas decimais) */
export function formatDecimalHours(total?: number | null): string {
  if (total === null || total === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total / 60);
}

export function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function formatNumber(value?: number | null, fractionDigits = 0): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatCpf(value?: string | null): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const MONTH_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export function monthLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1] ?? ""}/${year}`;
}

export function parseISODate(value: string): Date {
  const [datePart] = value.split("T");
  const parts = (datePart ?? "").split("-").map(Number);
  const [year, month, day] = parts;
  if (!year || !month || !day) return new Date(value);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Primeiro e último dia (ISO) de um mês de referência. */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: toISODate(start), end: toISODate(end) };
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekdayShort(value: string): string {
  const date = parseISODate(value);
  return ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][date.getUTCDay()] ?? "";
}

export function isWeekend(value: string): boolean {
  const day = parseISODate(value).getUTCDay();
  return day === 0 || day === 6;
}
