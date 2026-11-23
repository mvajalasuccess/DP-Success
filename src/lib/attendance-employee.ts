type Employment = { status?: string | null; hire_date?: string | null; termination_date?: string | null };

export function canSelectNewAttendanceEmployee(
  employee: Employment,
  openPeriod: { start_date: string; end_date: string } | undefined,
): boolean {
  return Boolean(openPeriod && employee.status?.trim().toLowerCase() === "ativo" &&
    (!employee.hire_date || employee.hire_date <= openPeriod.end_date) &&
    (!employee.termination_date || employee.termination_date >= openPeriod.start_date));
}
