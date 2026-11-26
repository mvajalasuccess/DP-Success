import { parseISODate, toISODate } from "@/lib/format";

export const weekDays = [
  { index: 1, label: "Seg" }, { index: 2, label: "Ter" },
  { index: 3, label: "Qua" }, { index: 4, label: "Qui" },
  { index: 5, label: "Sex" }, { index: 6, label: "Sáb" },
  { index: 0, label: "Dom" },
];

export const cardKinds = {
  freelancer: "Freelancer",
  sold_vacation: "Férias",
  other: "Outro",
};

export type CardKind = keyof typeof cardKinds;
export type EntryMode = "normal" | "overnight" | "absence" | "excused" | "waived";
export type DayEntry = { punches: string[]; mode: EntryMode };
export type ManualCard = {
  id: string;
  person_name: string;
  kind: CardKind;
  start_date: string;
  end_date: string;
  weekday_minutes: number[];
  entries: Record<string, DayEntry>;
  revision: number;
};
export const emptyEntry: DayEntry = { punches: [], mode: "normal" };

export function datesInRange(start: string, end: string): string[] {
  if (!start || !end || start > end) return [];
  const date = parseISODate(start);
  const dates: string[] = [];
  while (Number.isFinite(date.getTime()) && dates.length < 367) {
    const iso = toISODate(date);
    if (iso > end) break;
    dates.push(iso);
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return dates;
}

function clockMinutes(value: string) {
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours! * 60 + minutes!;
}

type DayResult = {
  expected: number;
  worked: number | null;
  excused: number | null;
  balance: number | null;
  status: "empty" | "reviewed" | "incomplete" | "invalid";
};

export function evaluateDay(entry: DayEntry, scheduled: number): DayResult {
  const expected = entry.mode === "waived" ? 0 : scheduled;
  const result = (status: DayResult["status"], worked: number | null = null): DayResult => {
    const excused = worked === null ? null : entry.mode === "excused" ? Math.max(0, expected - worked) : 0;
    const balance = worked === null ? null : worked + (excused ?? 0) - expected;
    return { expected, status, worked, excused, balance };
  };
  if (entry.punches.length > 8) return result("invalid");

  const last = entry.punches.map(Boolean).lastIndexOf(true);
  if (entry.mode === "absence") return last < 0 ? result("reviewed", 0) : result("invalid");
  if (last < 0) return entry.mode === "waived" || entry.mode === "excused" ? result("reviewed", 0) : result("empty");
  if (last % 2 === 0) return result("incomplete");

  const times: number[] = [];
  let offset = 0;
  for (let index = 0; index <= last; index++) {
    const value = entry.punches[index];
    if (!value) return result("incomplete");
    const minutes = clockMinutes(value);
    if (minutes === null) return result("invalid");

    const previous = times.at(-1);
    if (previous !== undefined && minutes + offset < previous) {
      if (entry.mode !== "overnight" || offset !== 0) return result("invalid");
      offset = 1440;
    }
    if (index % 2 === 1 && minutes + offset === previous) return result("invalid");
    times.push(minutes + offset);
  }

  if (times.at(-1)! - times[0]! > 1440) return result("invalid");
  let worked = 0;
  for (let index = 0; index < times.length; index += 2) {
    worked += times[index + 1]! - times[index]!;
  }
  return result("reviewed", worked);
}

export function summarizeDays(days: DayResult[]) {
  const totals = { expected: 0, worked: 0, credit: 0, debit: 0, pending: 0, reviewed: 0 };
  for (const day of days) {
    if (day.worked === null || day.balance === null) {
      if (day.status !== "empty" || day.expected > 0) totals.pending++;
      continue;
    }
    totals.reviewed++;
    totals.expected += day.expected;
    totals.worked += day.worked;
    totals.credit += Math.max(0, day.balance);
    totals.debit += Math.max(0, -day.balance);
  }
  return { ...totals, balance: totals.credit - totals.debit };
}
