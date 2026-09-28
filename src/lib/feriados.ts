/**
 * Feriados nacionais do Brasil usados no cálculo das horas previstas.
 *
 * A função recebe uma data ISO (YYYY-MM-DD) e retorna o feriado nacional,
 * quando existir. Feriados estaduais/municipais e dias facultativos não são
 * descontados automaticamente porque dependem da localidade da empresa.
 */

function easterSunday(year: number): Date {
  // Algoritmo de Meeus/Jones/Butcher para calendário gregoriano.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function iso(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Retorna o nome do feriado nacional para a data informada.
 * Inclui feriados nacionais, estaduais de São Paulo e municipais da cidade de São Paulo.
 */
export function brazilNationalHoliday(date: string): string | null {
  const [yearText] = date.slice(0, 10).split("-");
  const year = Number(yearText);
  if (!Number.isFinite(year)) return null;

  const fixed: Record<string, string> = {
    `${year}-01-01`: "Confraternização Universal",
    `${year}-01-25`: "Aniversário da Cidade de São Paulo",
    `${year}-04-21`: "Tiradentes",
    `${year}-05-01`: "Dia Mundial do Trabalho",
    `${year}-06-04`: "Corpus Christi",
    `${year}-07-09`: "Data Magna do Estado de São Paulo",
    `${year}-09-07`: "Independência do Brasil",
    `${year}-10-12`: "Nossa Senhora Aparecida",
    `${year}-11-02`: "Finados",
    `${year}-11-15`: "Proclamação da República",
    `${year}-11-20`: "Dia Nacional de Zumbi e da Consciência Negra",
    `${year}-12-25`: "Natal",
  };

  if (fixed[date.slice(0, 10)]) return fixed[date.slice(0, 10)];

  const goodFriday = iso(addDays(easterSunday(year), -2));
  if (date.slice(0, 10) === goodFriday) return "Paixão de Cristo";

  return null;
}

export function isBrazilNationalHoliday(date: string) {
  return brazilNationalHoliday(date) !== null;
}

export function isWeekday(date: string) {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday !== 0 && weekday !== 6;
}

export function countWorkingWeekdays(start: string, end: string) {
  const [sy, sm, sd] = start.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = end.slice(0, 10).split("-").map(Number);
  const current = new Date(sy, sm - 1, sd);
  const last = new Date(ey, em - 1, ed);
  let total = 0;

  while (current <= last) {
    const currentIso = iso(current);
    if (isWeekday(currentIso) && !isBrazilNationalHoliday(currentIso)) total += 1;
    current.setDate(current.getDate() + 1);
  }

  return total;
}
