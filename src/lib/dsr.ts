export function calculateDsr(
  variablePayCents: number,
  startDate: string,
  endDate: string,
  holidayDates: ReadonlySet<string>,
) {
  const date = new Date(`${startDate}T00:00:00Z`);
  const lastDate = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(lastDate.getTime()) || date > lastDate) return null;
  if (date.toISOString().slice(0, 10) !== startDate || lastDate.toISOString().slice(0, 10) !== endDate) return null;

  let workingDays = 0;
  let restDays = 0;

  while (date <= lastDate) {
    const day = date.toISOString().slice(0, 10);
    if (date.getUTCDay() === 0 || holidayDates.has(day)) {
      restDays += 1;
    } else {
      workingDays += 1;
    }
    date.setUTCDate(date.getUTCDate() + 1);
  }

  if (!workingDays) return null;
  return { workingDays, restDays, amountCents: Math.round(variablePayCents * restDays / workingDays) };
}
