import { ArrowLeft, Download, FileBarChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import * as ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { countWorkingWeekdays } from "@/lib/feriados";

type Period = {
  id: string;
  reference_year: number;
  reference_month: number;
  start_date: string;
  end_date: string;
  status: string;
  closed_at?: string | null;
};

const HISTORICAL_CUTOFF = "2026-07-20";

const reports = [
  ["fechamento", "Fechamento de ponto"],
  ["banco", "Banco de horas"],
  ["extras", "Horas extras por funcionário"],
  ["absenteismo", "Absenteísmo por departamento"],
  ["atestados", "Declarações e atestados"],
  ["ocorrencias", "Faltas"],
] as const;

type ClosingColumn = { header: string; key: string; width: number; duration?: boolean };

const closingColumns: ClosingColumn[] = [
  { header: "Matrícula", key: "registration", width: 13 },
  { header: "Funcionário", key: "employee_name", width: 34 },
  { header: "Departamento", key: "department_name", width: 22 },
  { header: "Cargo", key: "position_name", width: 36 },
  { header: "Horas previstas", key: "expected_minutes", width: 17, duration: true },
  { header: "Horas trabalhadas", key: "worked_minutes", width: 19, duration: true },
  { header: "Faltas (dias)", key: "absence_quantity", width: 14 },
  { header: "Atestados", key: "certificate_minutes", width: 14, duration: true },
  { header: "Declarações de horas", key: "declaration_minutes", width: 23, duration: true },
  { header: "Abonos", key: "allowance_minutes", width: 14, duration: true },
  { header: "Débito", key: "debit_minutes", width: 14, duration: true },
  { header: "HE 60%", key: "he_60_minutes", width: 13, duration: true },
  { header: "HE 60% + 20%", key: "he_60_night_minutes", width: 17, duration: true },
  { header: "HE 100%", key: "he_100_minutes", width: 13, duration: true },
  { header: "HE 20%", key: "he_20_minutes", width: 13, duration: true },
  { header: "Interjornada", key: "interjornada_minutes", width: 16, duration: true },
  { header: "Origem do ajuste", key: "adjustment_status", width: 18 },
];

export function csv(rows: any[]) {
  if (!rows.length) return "";
  const keys = Object.keys(rows[0]);
  const esc = (v: any) => {
    let s = String(v ?? "");
    if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [keys.join(";"), ...rows.map(r => keys.map(k => esc(r[k])).join(";"))].join("\n");
}

async function fetchAll(build: (from: number, to: number) => any) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  return rows;
}

function downloadCsv(name: string, rows: any[]) {
  const blob = new Blob(["\ufeff" + csv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function minutesToExcelDuration(value: unknown) {
  return Math.round(Number(value || 0)) / 1440;
}

async function loadClosingRows(db: any, period: Period) {
  const { data: historical, error: historicalError } = await db
    .from("historical_kpi_data")
    .select("id,employee_id,registration,employee_name,department_name,position_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
    .eq("period_id", period.id)
    .order("employee_name", { ascending: true });
  if (historicalError) throw historicalError;

  const { data: overrideRows, error: overrideError } = await db
    .from("point_closing_overrides")
    .select("period_id,employee_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
    .eq("period_id", period.id);

  if (overrideError && !String(overrideError.message ?? "").toLowerCase().includes("point_closing_overrides")) {
    throw overrideError;
  }

  const overrides = (overrideRows ?? []) as any[];
  const overrideByEmployee = new Map(overrides.map((row: any) => [String(row.employee_id), row]));
  const applyOverride = (row: any) => {
    const override = overrideByEmployee.get(String(row.employee_id));
    return override
      ? { ...row, ...override, has_manual_override: true }
      : { ...row, has_manual_override: false };
  };

  // Para competências históricas, exporta a mesma visão que o Fechamento de Ponto:
  // valores BASE preservados e ajustes manuais aplicados por funcionário/competência.
  if (period.end_date <= HISTORICAL_CUTOFF && (historical ?? []).length > 0) {
    return (historical ?? []).map(applyOverride);
  }

  const [
    { data: employeeRows, error: employeeError },
    { data: overtimeRows, error: overtimeError },
    { data: occurrenceRows, error: occurrenceError },
    { data: debitRows, error: debitError },
    { data: certificateRows, error: certificateError },
  ] = await Promise.all([
    db.from("employees")
      .select("id,full_name,registration,department_id,position_id,hire_date,termination_date,status,work_schedule_id,departments(name),positions(name)")
      .order("full_name"),
    db.from("overtime_records")
      .select("employee_id,period_id,minutes,launch_type")
      .eq("period_id", period.id),
    db.from("occurrences")
      .select("employee_id,period_id,quantity,unit,occurrence_types(code)")
      .eq("period_id", period.id),
    db.from("bank_hours")
      .select("employee_id,period_id,minutes,kind")
      .eq("period_id", period.id)
      .eq("kind", "debito"),
    db.from("medical_certificates")
      .select("employee_id,start_date,end_date,days")
      .lte("start_date", period.end_date)
      .gte("end_date", period.start_date),
  ]);

  const queryError = employeeError ?? overtimeError ?? occurrenceError ?? debitError ?? certificateError;
  if (queryError) throw queryError;

  const employeesInPeriod = (employeeRows ?? []).filter((employee: any) =>
    (!employee.hire_date || employee.hire_date <= period.end_date) &&
    (!employee.termination_date || employee.termination_date >= period.start_date)
  );

  const groupByEmployee = (items: any[]) => {
    const map = new Map<string, any[]>();
    for (const item of items) {
      const key = String(item.employee_id);
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
    return map;
  };

  const occurrencesByEmployee = groupByEmployee(occurrenceRows ?? []);
  const certificatesByEmployee = groupByEmployee(certificateRows ?? []);
  const debitsByEmployee = groupByEmployee(debitRows ?? []);
  const overtimeByEmployee = groupByEmployee(overtimeRows ?? []);

  const rows = employeesInPeriod.map((employee: any) => {
    const id = employee.id;
    const effectiveStart = employee.hire_date && employee.hire_date > period.start_date ? employee.hire_date : period.start_date;
    const effectiveEnd = employee.termination_date && employee.termination_date < period.end_date ? employee.termination_date : period.end_date;
    const expected = effectiveStart > effectiveEnd ? 0 : countWorkingWeekdays(effectiveStart, effectiveEnd) * 528;
    let absenceQuantity = 0;
    let certificateMinutes = 0;
    let declarationMinutes = 0;
    let extraAllowanceMinutes = 0;
    let debitMinutes = 0;
    let he60 = 0;
    let he60Night = 0;
    let he100 = 0;
    let he20 = 0;
    let interjornada = 0;

    for (const occurrence of occurrencesByEmployee.get(String(id)) ?? []) {
      if (occurrence.employee_id !== id) continue;
      const code = String(occurrence.occurrence_types?.code ?? "").toLowerCase();
      const quantity = Number(occurrence.quantity || 0);
      const unit = String(occurrence.unit ?? "dias").toLowerCase();
      const minutes = unit.startsWith("dia")
        ? Math.round(quantity * 528)
        : unit.startsWith("hor")
          ? Math.round(quantity * 60)
          : Math.round(quantity);

      // Mantém a regra da tela Fechamento de Ponto: folga descontada é visual.
      if (code === "folga_descontada") continue;
      if (code === "folga_abonada" || code === "abono") extraAllowanceMinutes += minutes;
      else if (["falta", "falta_justificada", "falta_injustificada"].includes(code)) absenceQuantity += quantity;
      else if (code === "declaracao_horas" || code === "declaracao") declarationMinutes += minutes;
    }

    for (const certificate of certificatesByEmployee.get(String(id)) ?? []) {
      if (certificate.employee_id !== id) continue;
      const overlapStart = certificate.start_date > period.start_date ? certificate.start_date : period.start_date;
      const overlapEnd = certificate.end_date < period.end_date ? certificate.end_date : period.end_date;
      if (overlapStart > overlapEnd) continue;
      const overlapDays = Math.floor(
        (new Date(overlapEnd + "T00:00:00").getTime() - new Date(overlapStart + "T00:00:00").getTime()) / 86400000
      ) + 1;
      const days = Math.max(0, Math.min(Number(certificate.days || 0), overlapDays));
      certificateMinutes += Math.round(days * 528);
    }

    for (const debit of debitsByEmployee.get(String(id)) ?? []) {
      if (debit.employee_id === id) debitMinutes += Math.abs(Number(debit.minutes || 0));
    }

    for (const overtime of overtimeByEmployee.get(String(id)) ?? []) {
      if (overtime.employee_id !== id) continue;
      const minutes = Math.abs(Number(overtime.minutes || 0));
      const type = String(overtime.launch_type ?? "").toUpperCase();
      if (type === "HE_60") he60 += minutes;
      else if (type === "HE_60_NOTURNO") he60Night += minutes;
      else if (type === "HE_100" || type === "HE_100_NOTURNO") he100 += minutes;
      else if (type === "ADICIONAL_NOTURNO") he20 += minutes;
      else if (type === "INTERJORNADA_50") interjornada += minutes;
    }

    // Reproduz exatamente os campos derivados exibidos na tela atual.
    const allowanceTotal = certificateMinutes + declarationMinutes;
    const lostMinutes = Math.round(absenceQuantity * 528) + allowanceTotal + debitMinutes;
    return {
      employee_id: id,
      registration: employee.registration ?? "",
      employee_name: employee.full_name ?? "",
      department_name: employee.departments?.name ?? "",
      position_name: employee.positions?.name ?? "",
      expected_minutes: expected,
      worked_minutes: Math.max(0, expected - lostMinutes),
      absence_quantity: absenceQuantity,
      certificate_minutes: certificateMinutes,
      declaration_minutes: declarationMinutes,
      allowance_minutes: allowanceTotal,
      debit_minutes: debitMinutes,
      he_60_minutes: he60,
      he_60_night_minutes: he60Night,
      he_100_minutes: he100,
      he_20_minutes: he20,
      interjornada_minutes: interjornada,
      has_manual_override: false,
      extra_allowance_minutes: extraAllowanceMinutes,
    };
  });

  // Quando existir um ajuste manual na competência atual, ele substitui a linha
  // calculada da fonte operacional, exatamente como ocorre nos KPIs.
  const currentOverridesByEmployee = new Map(overrides.map((row: any) => [String(row.employee_id), row]));
  return rows.map((row: any) => {
    const override = currentOverridesByEmployee.get(String(row.employee_id));
    return override ? { ...row, ...override, has_manual_override: true } : row;
  }).sort((a: any, b: any) => String(a.employee_name).localeCompare(String(b.employee_name), "pt-BR"));
}

async function downloadClosingExcel(period: Period, rows: any[]) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DP SUCCESS";
  workbook.subject = "Fechamento de Ponto";
  workbook.title = `Fechamento de Ponto - ${formatDate(period.start_date)} a ${formatDate(period.end_date)}`;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Fechamento", {
    views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
  });
  const lastColumn = closingColumns.length;
  sheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "DP SUCCESS | FECHAMENTO DE PONTO";
  titleCell.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B3A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.getCell(2, 1).value = `Competência: ${formatDate(period.start_date)} a ${formatDate(period.end_date)}  |  Referência: ${String(period.reference_month).padStart(2, "0")}/${period.reference_year}  |  Status: ${period.status}`;
  sheet.getCell(2, 1).font = { size: 11, bold: true, color: { argb: "FF123B3A" } };
  sheet.getCell(2, 1).alignment = { vertical: "middle" };
  sheet.getRow(2).height = 23;

  sheet.addRow([]);
  sheet.addRow([]);
  const headerRow = sheet.addRow(closingColumns.map(column => column.header));
  headerRow.height = 32;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FF123B3A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDF7F0" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF06CAA0" } } };
  });

  for (const source of rows) {
    const data: Record<string, unknown> = {};
    for (const column of closingColumns) {
      if (column.key === "adjustment_status") data[column.key] = source.has_manual_override ? "Ajuste manual" : "Dados originais";
      else if (column.duration) data[column.key] = minutesToExcelDuration(source[column.key]);
      else if (column.key === "absence_quantity") data[column.key] = Number(source[column.key] || 0);
      else data[column.key] = source[column.key] ?? "";
    }
    const row = sheet.addRow(closingColumns.map(column => data[column.key]));
    row.eachCell((cell, columnNumber) => {
      cell.alignment = { vertical: "middle", horizontal: columnNumber >= 5 && columnNumber <= 16 ? "center" : "left" };
      if (row.number % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5FAF8" } };
    });
    for (let index = 0; index < closingColumns.length; index++) {
      if (closingColumns[index].duration) row.getCell(index + 1).numFmt = "[h]:mm;-[h]:mm";
    }
    row.getCell(7).numFmt = "0.##";
  }

  closingColumns.forEach((column, index) => {
    sheet.getColumn(index + 1).width = column.width;
  });
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, sheet.rowCount), column: lastColumn } };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.properties.defaultRowHeight = 20;

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dp-success-fechamento-${period.start_date}-a-${period.end_date}.xlsx`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Relatorios() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("time_periods")
        .select("id,reference_year,reference_month,start_date,end_date,status,closed_at")
        .order("end_date", { ascending: false });
      if (error) setError(error.message);
      const available = (data ?? []) as Period[];
      setPeriods(available);
      setSelectedPeriodId(available[0]?.id ?? "");
      setLoading(false);
    })();
  }, []);

  const competence = periods.find(period => period.id === selectedPeriodId) ?? periods[0] ?? null;

  async function exportReport(kind: string) {
    setBusy(kind);
    setError("");
    const db = supabase as any;

    try {
      if (kind === "fechamento") {
        if (!competence) throw new Error("Selecione uma competência para exportar.");
        const rows = await loadClosingRows(db, competence);
        if (!rows.length) throw new Error("Não há funcionários ou lançamentos para exportar nessa competência.");
        await downloadClosingExcel(competence, rows);
        return;
      }

      let rows: any[] = [];
      if (kind === "banco") {
        const data = await fetchAll((from, to) => db.from("bank_hours").select("entry_date,kind,minutes,previous_balance_minutes,balance_minutes,justification,employees(full_name),time_periods(reference_year,reference_month,start_date,end_date)").order("entry_date", { ascending: false }).range(from, to));
        rows = data.map((x: any) => ({
          date: x.entry_date,
          competencia: x.time_periods ? String(x.time_periods.reference_month).padStart(2, "0") + "/" + x.time_periods.reference_year : "",
          employee: x.employees?.full_name ?? "",
          kind: x.kind,
          minutes: x.minutes,
          previous_balance_minutes: x.previous_balance_minutes,
          balance_minutes: x.balance_minutes,
          justification: x.justification ?? "",
        }));
      }

      if (kind === "extras") {
        const data = await fetchAll((from, to) => db.from("overtime_records").select("reference_date,launch_type,minutes,rate_percent,estimated_value,notes,employees(full_name)").order("reference_date", { ascending: false }).range(from, to));
        rows = data.map((x: any) => ({
          date: x.reference_date,
          type: x.launch_type,
          minutes: x.minutes,
          rate_percent: x.rate_percent,
          estimated_value: x.estimated_value,
          description: x.notes ?? "",
          employee: x.employees?.full_name ?? "",
        }));
      }

      if (kind === "absenteismo") {
        const data = await fetchAll((from, to) => db.from("occurrences").select("occurrence_date,end_date,quantity,unit,notes,employees(full_name,departments(name)),occurrence_types!inner(code,name)").in("occurrence_types.code", ["folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"]).order("occurrence_date", { ascending: false }).range(from, to));
        rows = data.map((x: any) => ({
          date: x.occurrence_date,
          end_date: x.end_date ?? "",
          type: x.occurrence_types?.name ?? "",
          quantity: x.quantity,
          unit: x.unit,
          employee: x.employees?.full_name ?? "",
          department: x.employees?.departments?.name ?? "",
          description: x.notes ?? "",
        }));
      }

      if (kind === "atestados") {
        const [certificates, leaves, declarations] = await Promise.all([
          fetchAll((from, to) => db.from("medical_certificates").select("start_date,end_date,days,certificate_type,cid,notes,employees(full_name)").order("start_date", { ascending: false }).range(from, to)),
          fetchAll((from, to) => db.from("occurrences").select("occurrence_date,end_date,quantity,unit,notes,employees(full_name),occurrence_types!inner(code,name)").eq("occurrence_types.code", "afastamento").order("occurrence_date", { ascending: false }).range(from, to)),
          fetchAll((from, to) => db.from("occurrences").select("occurrence_date,quantity,unit,notes,employees(full_name),occurrence_types!inner(code)").eq("occurrence_types.code", "declaracao_horas").order("occurrence_date", { ascending: false }).range(from, to)),
        ]);
        rows = [
          ...(certificates ?? []).map((x: any) => ({
            tipo: "Atestado", employee: x.employees?.full_name ?? "", start_date: x.start_date,
            end_date: x.end_date, days: x.days, horas_abonadas: "", motivo: "",
            certificate_type: x.certificate_type, cid: x.cid, notes: x.notes ?? "",
          })),
          ...(leaves ?? []).map((x: any) => ({
            tipo: "Afastamento", employee: x.employees?.full_name ?? "", start_date: x.occurrence_date,
            end_date: x.end_date ?? x.occurrence_date, days: x.quantity, horas_abonadas: "", motivo: "",
            certificate_type: "", cid: "", notes: x.notes ?? "",
          })),
          ...(declarations ?? []).map((x: any) => {
            const parts = String(x.notes ?? "").split(" — ");
            const minutes = Math.round(Number(x.quantity ?? 0) * 60);
            return {
              tipo: "Declaração de horas", employee: x.employees?.full_name ?? "", start_date: x.occurrence_date,
              end_date: x.occurrence_date, days: "",
              horas_abonadas: String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0"),
              motivo: parts[0] ?? "", certificate_type: "", cid: "", notes: parts.slice(1).join(" — "),
            };
          }),
        ];
      }

      if (kind === "ocorrencias") {
        const data = await fetchAll((from, to) => db.from("occurrences").select("occurrence_date,end_date,quantity,unit,notes,employees(full_name),occurrence_types!inner(code,name)").in("occurrence_types.code", ["folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"]).order("occurrence_date", { ascending: false }).range(from, to));
        rows = data.map((x: any) => ({
          date: x.occurrence_date,
          end_date: x.end_date ?? "",
          type: x.occurrence_types?.name ?? "",
          quantity: x.quantity,
          unit: x.unit,
          employee: x.employees?.full_name ?? "",
          description: x.notes ?? "",
        }));
      }

      downloadCsv("dp-success-" + kind + ".csv", rows);
    } catch (e: any) {
      setError(e.message ?? "Não foi possível gerar o relatório.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </a>
          <span className="font-semibold">DP Success · Relatórios</span>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <p className="text-sm font-medium text-primary">Gestão</p>
        <h1 className="mt-1 text-3xl font-bold">Relatórios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Carregando competências…"
            : competence
              ? `Competência selecionada: ${String(competence.reference_month).padStart(2, "0")}/${competence.reference_year} (${formatDate(competence.start_date)} a ${formatDate(competence.end_date)})`
              : "Nenhuma competência cadastrada."}
        </p>

        <div className="mt-5 max-w-xl">
          <label htmlFor="report-period" className="mb-1.5 block text-sm font-medium">Competência do Fechamento de Ponto</label>
          <select
            id="report-period"
            value={competence?.id ?? ""}
            onChange={event => setSelectedPeriodId(event.target.value)}
            disabled={loading || !periods.length || !!busy}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
          >
            {periods.map(period => (
              <option key={period.id} value={period.id}>
                {formatDate(period.start_date)} a {formatDate(period.end_date)} · Ref. {String(period.reference_month).padStart(2, "0")}/{period.reference_year} · {period.status}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            A planilha do Fechamento exporta todos os funcionários e os campos exibidos na tabela da competência selecionada.
          </p>
        </div>

        {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map(([key, title]) => (
            <Card key={key} className="p-5">
              <FileBarChart className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-bold">{title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {key === "fechamento"
                  ? "Excel com funcionários, horas previstas e trabalhadas, faltas, atestados, declarações, abonos, débitos e horas extras."
                  : "Exporte os dados desse relatório em formato CSV."}
              </p>
              <button
                onClick={() => void exportReport(key)}
                disabled={!!busy || loading || (key === "fechamento" && !competence)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {busy === key ? "Gerando…" : key === "fechamento" ? "Exportar Excel" : "Exportar CSV"}
              </button>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
