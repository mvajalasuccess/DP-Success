import { isBrazilNationalHoliday } from "./feriados";

export function calculateDsr(
  variablePayCents: number,
  referenceYear: number,
  referenceMonth: number,
  additionalHolidayDates: ReadonlySet<string>,
) {
  if (!Number.isInteger(referenceYear) || referenceYear < 1900 ||
      !Number.isInteger(referenceMonth) || referenceMonth < 1 || referenceMonth > 12) return null;

  const date = new Date(Date.UTC(referenceYear, referenceMonth - 1, 1));
  let workingDays = 0;
  let restDays = 0;

  while (date.getUTCMonth() === referenceMonth - 1) {
    const day = date.toISOString().slice(0, 10);
    if (date.getUTCDay() === 0 || additionalHolidayDates.has(day) || isBrazilNationalHoliday(day)) {
      restDays += 1;
    } else {
      workingDays += 1;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }

  if (!workingDays) return null;
  return { workingDays, restDays, amountCents: Math.round(variablePayCents * restDays / workingDays) };
}
