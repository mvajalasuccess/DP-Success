import type {
  CalculationSettings,
  DayCalculation,
  Punches,
  ScheduleDefinition,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

/**
 * Regras de cálculo de jornada — camada isolada e substituível.
 *
 * O cálculo atual é puramente aritmético (diferença entre marcações menos
 * intervalo) e NÃO aplica nenhuma regra trabalhista específica: tolerâncias,
 * adicionais, DSR, adicional noturno e escalas continuam pendentes de
 * definição e são lidos de `CalculationSettings`.
 */

export function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours)) return null;
  return hours * 60 + minutes;
}

export function minutesToTime(total: number | null | undefined): string | null {
  if (total === null || total === undefined) return null;
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function scheduleBreakMinutes(schedule: ScheduleDefinition): number {
  const start = timeToMinutes(schedule.breakStart);
  const end = timeToMinutes(schedule.breakEnd);
  if (start === null || end === null) return 0;
  return Math.max(end - start, 0);
}

/** Soma de minutos efetivamente trabalhados a partir das marcações. */
export function computeWorkedMinutes(punches: Punches, schedule: ScheduleDefinition): number | null {
  const entry = timeToMinutes(punches.entryAt);
  const exit = timeToMinutes(punches.exitAt);
  if (entry === null || exit === null) return null;

  const total = exit >= entry ? exit - entry : exit + 1440 - entry;
  const breakOut = timeToMinutes(punches.breakOutAt);
  const breakIn = timeToMinutes(punches.breakInAt);
  const breakTaken =
    breakOut !== null && breakIn !== null ? Math.max(breakIn - breakOut, 0) : scheduleBreakMinutes(schedule);

  return Math.max(total - breakTaken, 0);
}

/**
 * Cálculo do dia. `settings` permite plugar tolerâncias quando definidas;
 * enquanto forem `null`, nenhuma tolerância é aplicada.
 */
export function calculateDay(
  punches: Punches,
  schedule: ScheduleDefinition,
  settings: CalculationSettings = DEFAULT_SETTINGS,
): DayCalculation {
  const expectedMinutes = schedule.dailyMinutes;
  const worked = computeWorkedMinutes(punches, schedule);

  if (worked === null) {
    const hasAnyPunch = Boolean(
      punches.entryAt || punches.breakOutAt || punches.breakInAt || punches.exitAt,
    );
    return {
      expectedMinutes,
      workedMinutes: 0,
      balanceMinutes: hasAnyPunch ? 0 : -expectedMinutes,
      overtimeMinutes: 0,
      negativeMinutes: hasAnyPunch ? 0 : expectedMinutes,
      incomplete: true,
    };
  }

  const rawBalance = worked - expectedMinutes;
  const tolerance = settings.tolerances.dailyMinutes;
  const balance = tolerance !== null && Math.abs(rawBalance) <= tolerance ? 0 : rawBalance;

  return {
    expectedMinutes,
    workedMinutes: worked,
    balanceMinutes: balance,
    overtimeMinutes: Math.max(balance, 0),
    negativeMinutes: Math.max(-balance, 0),
    incomplete: false,
  };
}

/**
 * Valor estimado de horas extras. Retorna `null` enquanto o adicional e o
 * valor-hora não estiverem definidos nas configurações.
 */
export function estimateOvertimeValue(
  minutes: number,
  hourlyRate: number | null,
  percent: number | null,
): number | null {
  if (hourlyRate === null || percent === null) return null;
  return (minutes / 60) * hourlyRate * (1 + percent / 100);
}

/** Saldo acumulado de banco de horas a partir de lançamentos ordenados. */
export function accumulateBankHours(entries: { minutes: number }[]): number {
  return entries.reduce((total, entry) => total + entry.minutes, 0);
}
