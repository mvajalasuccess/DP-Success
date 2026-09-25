/**
 * Contratos da camada de regras de cálculo.
 *
 * IMPORTANTE: nenhuma regra trabalhista definitiva está implementada aqui.
 * Esta camada existe para que jornada, horas extras, tolerâncias, banco de
 * horas, faltas, atrasos, feriados, DSR, adicional noturno e escalas possam
 * ser implementados e alterados sem reescrever a aplicação.
 */

export type ScheduleDefinition = {
  dailyMinutes: number;
  weeklyMinutes: number;
  entryTime: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  exitTime: string | null;
  scheduleType: string;
};

export type Punches = {
  entryAt: string | null;
  breakOutAt: string | null;
  breakInAt: string | null;
  exitAt: string | null;
};

export type ToleranceSettings = {
  /** Tolerância na marcação de entrada, em minutos. `null` = a definir. */
  entryMinutes: number | null;
  /** Tolerância na marcação de saída, em minutos. `null` = a definir. */
  exitMinutes: number | null;
  /** Tolerância total no dia, em minutos. `null` = a definir. */
  dailyMinutes: number | null;
};

export type OvertimeSettings = {
  /** Adicional em dia útil, em %. `null` = a definir. */
  weekdayPercent: number | null;
  /** Adicional em domingo/feriado, em %. `null` = a definir. */
  holidayPercent: number | null;
  /** Adicional noturno, em %. `null` = a definir. */
  nightPercent: number | null;
};

export type BankHoursSettings = {
  compensationDeadlineDays: number | null;
  creditFactor: number | null;
  debitFactor: number | null;
};

export type CalculationSettings = {
  tolerances: ToleranceSettings;
  overtime: OvertimeSettings;
  bankHours: BankHoursSettings;
};

export type DayCalculation = {
  expectedMinutes: number;
  workedMinutes: number;
  balanceMinutes: number;
  overtimeMinutes: number;
  negativeMinutes: number;
  incomplete: boolean;
};

export const DEFAULT_SETTINGS: CalculationSettings = {
  tolerances: { entryMinutes: null, exitMinutes: null, dailyMinutes: null },
  overtime: { weekdayPercent: null, holidayPercent: null, nightPercent: null },
  bankHours: { compensationDeadlineDays: null, creditFactor: null, debitFactor: null },
};
