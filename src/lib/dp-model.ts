export type LaunchDirection = "CREDITO" | "DEBITO";
export type LaunchType = "HE_60" | "HE_NOTURNA" | "ADICIONAL_NOTURNO" | "DOMINGO_FERIADO" | "INTERJORNADA" | "CREDITO" | "DEBITO" | "COMPENSACAO" | "AJUSTE";

export const calculationRules: Record<LaunchType, { label: string; rateFactor: number; direction: LaunchDirection }> = {
  HE_60: { label: "Hora extra 60%", rateFactor: 1.6, direction: "CREDITO" },
  HE_NOTURNA: { label: "Hora extra noturna", rateFactor: 1.8, direction: "CREDITO" },
  ADICIONAL_NOTURNO: { label: "Adicional noturno 20%", rateFactor: 0.2, direction: "CREDITO" },
  DOMINGO_FERIADO: { label: "Domingo / feriado 100%", rateFactor: 2, direction: "CREDITO" },
  INTERJORNADA: { label: "Interjornada 50%", rateFactor: 1.5, direction: "CREDITO" },
  CREDITO: { label: "Crédito", rateFactor: 1, direction: "CREDITO" },
  DEBITO: { label: "Débito", rateFactor: 1, direction: "DEBITO" },
  COMPENSACAO: { label: "Compensação", rateFactor: 1, direction: "DEBITO" },
  AJUSTE: { label: "Ajuste", rateFactor: 1, direction: "CREDITO" },
};

export function hoursToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

export function minutesToHours(total: number) {
  const sign = total < 0 ? "-" : "";
  const absolute = Math.abs(total);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

export function calculateHourValue(salary: number, divisor = 220) {
  return salary / divisor;
}

export function calculateLaunchValue(salary: number, hours: string, type: LaunchType, divisor = 220) {
  const rule = calculationRules[type];
  return (hoursToMinutes(hours) / 60) * calculateHourValue(salary, divisor) * rule.rateFactor;
}
