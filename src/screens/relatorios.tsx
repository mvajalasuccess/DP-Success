import { ArrowLeft, Download, FileBarChart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CompanyFilter } from "@/components/company-filter";
import { countWorkingWeekdays } from "@/lib/feriados";
import { balancesByEmployees, minutesToHours } from "@/lib/dp-model";

import { ScreenBrand } from "@/components/screen-brand";
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
  ["interjornada", "Interjornada por funcionário"],
  ["horas_pagar", "Horas a Pagar"],
  ["atestados", "Declarações e atestados"],
  ["ocorrencias", "Faltas e Folgas"],
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

function escapeReportHtml(value: unknown) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function downloadReportPdf(title: string, rows: any[], subtitle: string) {
  if (!rows.length) throw new Error("Não há dados para gerar o PDF.");
  // Matrícula não deve aparecer nos PDFs; os dados de origem e os arquivos Excel permanecem intactos.
  const columns = Object.keys(rows[0]).filter(key => !/^(registration|matr[ií]cula)$/i.test(key.trim()));
  const headers: Record<string, string> = {
    employee: "Funcionário", employee_name: "Funcionário", competence: "Competência", horario: "Horário (hh:mm)", date: "Data", end_date: "Data final",
    start_date: "Data inicial", type: "Tipo", quantity: "Quantidade", unit: "Unidade",
    description: "Observações", registration: "Matrícula", department: "Departamento",
    department_name: "Departamento", days: "Dias", tipo: "Tipo", horas_abonadas: "Horas abonadas",
    motivo: "Motivo", certificate_type: "Tipo de atestado", cid: "CID",
  };
  const showValue = (key: string, value: unknown) => {
    if (value == null || value === "") return "—";
    const raw = String(value);
    if (/(date|_date|start_date|end_date)/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(raw)) return formatDate(raw.slice(0, 10));
    if (typeof value === "number" && /value|valor|\(R\$\)/i.test(key)) return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    if (typeof value === "number" && /min\)/i.test(key)) {
      const minutes = Math.round(Math.abs(value));
      return (value < 0 ? "-" : "") + Math.floor(minutes / 60).toString().padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
    }
    return raw;
  };
  // Todos os relatórios exportados em PDF devem usar orientação horizontal.
  const wideTable = true;
  const pointClosing = /fechamento de ponto/i.test(title);
  const isEmployeeColumn = (key: string) => /employee|funcion.rio|employee_name/i.test(key);
  const columnWeight = (key: string) => {
    const name = key.toLowerCase();
    if (!pointClosing) {
      if (isEmployeeColumn(name)) return 2.15;
      if (/position|cargo/.test(name)) return 1.65;
      if (/department|departamento/.test(name)) return 1.35;
      if (/registration|matr.cula/.test(name)) return 0.8;
      if (/date|data|status|situa..o/.test(name)) return 0.85;
      if (/min\)|saldo|horas|he_|interjornada|d.bit|pagamento|ajuste/.test(name)) return 0.9;
      return 1;
    }
    if (/employee|funcion.rio/.test(name)) return 2.45;
    if (/registration|matr.cula/.test(name)) return 0.9;
    if (/department|departamento/.test(name)) return 1.45;
    if (/position|cargo/.test(name)) return 2.05;
    if (/expected|previstas/.test(name)) return 1.25;
    if (/worked|trabalhadas/.test(name)) return 1.35;
    if (/absence|falta/.test(name)) return 1.05;
    if (/certificate|atestado/.test(name)) return 1;
    if (/declaration|declara..o/.test(name)) return 1.7;
    if (/allowance|abono/.test(name)) return 0.85;
    if (/debit|d.bito/.test(name)) return 0.85;
    if (/he_60_night/.test(name)) return 1.4;
    if (/he_60|he_100|he_20/.test(name)) return 0.85;
    if (/interjornada/.test(name)) return 1.15;
    if (/adjustment|ajuste/.test(name)) return 1.35;
    return 1;
  };
  const totalWeight = columns.reduce((sum, key) => sum + columnWeight(key), 0);
  const colgroup = '<colgroup>' + columns.map(key => '<col style="width:' + (columnWeight(key) / totalWeight * 100).toFixed(3) + '%">').join("") + '</colgroup>';
  const pageStyle = wideTable
    ? '@page{size:A2 landscape;margin:8mm}body{font-size:9px}.brand{padding:10px 14px}h1{font-size:18px;margin:4px 0}.subtitle,.meta,.footer{font-size:9px}.meta{padding:6px 8px}table{margin-top:8px}th{font-size:10px;padding:4px 4px;line-height:1.2}td{font-size:9px;padding:5px 4px;line-height:1.35}'
    : '@page{size:A4 landscape;margin:7mm}body{font-size:7px}.brand{padding:10px 14px}h1{font-size:16px;margin:4px 0}.subtitle{font-size:8px}.meta{font-size:7px;padding:6px 8px}table{margin-top:8px}th{font-size:6.5px}th,td{padding:3px 3px;line-height:1.2}';
  const html = '<html lang="pt-BR"><head><meta charset="utf-8"><title>' + escapeReportHtml(title) + '</title><style>' +
    '*{box-sizing:border-box}html,body{width:100%;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#183735;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
    pageStyle +
    '.brand{background:#123b3a;color:#fff;break-inside:avoid}.wide-table td{padding:5px 4px!important;line-height:1.35!important}.wide-table th{padding:4px!important;line-height:1.2!important}.point-closing table{table-layout:fixed}.point-closing th{text-align:center!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important;hyphens:auto;font-size:8px!important;padding:5px 3px!important;line-height:1.25!important;letter-spacing:0;vertical-align:middle}.point-closing td{padding:5px 4px!important;line-height:1.3!important;font-size:9px!important;white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important}.point-closing th.employee-col,.point-closing td.employee-col{white-space:normal!important;overflow-wrap:anywhere!important;word-break:normal!important}.wide-table thead{display:table-header-group}.wide-table tbody{page-break-inside:auto;break-inside:auto}.eyebrow{font-size:7px;letter-spacing:1.2px;color:#9debd8;font-weight:bold}' +
    '.subtitle{color:#d9f4ed;overflow-wrap:anywhere}.meta{display:flex;justify-content:space-between;gap:8px;background:#f0faf7;border:1px solid #d8eee7;color:#365b56}table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}' +
    'th{background:#dff7f0;color:#123b3a;text-align:left;text-transform:uppercase}th,td{border-bottom:1px solid #e1ece8;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;white-space:normal}tbody tr:nth-child(even){background:#f6faf9}.footer{margin-top:5px;padding-top:3px;border-top:1px solid #d8e8e3;color:#64817b}@media print{html,body{width:100%;height:auto}table{width:100%}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>' +
    '<body class="' + (wideTable ? 'wide-table' : '') + (pointClosing ? ' point-closing' : '') + '"><header class="brand"><div class="eyebrow">DP SUCCESS · GESTÃO DE PESSOAS</div><h1>' + escapeReportHtml(title) + '</h1><div class="subtitle">' + escapeReportHtml(subtitle) + '</div></header>' +
    '<div class="meta"><strong>Registros: ' + rows.length + '</strong><span>Gerado em ' + new Date().toLocaleString("pt-BR") + '</span></div><table>' + colgroup + '<thead><tr>' +
    columns.map(key => '<th class="' + (isEmployeeColumn(key) ? 'employee-col' : '') + '">' + escapeReportHtml(headers[key] || key.replace(/_/g, " ")) + '</th>').join("") + '</tr></thead><tbody>' +
    rows.map(row => '<tr>' + columns.map(key => '<td class="' + (isEmployeeColumn(key) ? 'employee-col' : '') + '">' + escapeReportHtml(showValue(key, row[key])) + '</td>').join("") + '</tr>').join("") +
    '</tbody></table><div class="footer">DP SUCCESS · Relatório gerencial · Documento para conferência interna</div></body></html>';
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:0;top:0;width:100vw;height:100vh;border:0;opacity:0;z-index:-1";
  document.body.appendChild(frame);
  if (!frame.contentDocument) { frame.remove(); throw new Error("Não foi possível preparar o PDF."); }
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60000);
  };
  frame.contentDocument.open();
  frame.contentDocument.write(html);
  frame.contentDocument.close();
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function displayPeriodStart(start: string, end: string) {
  return end === "2026-01-20" ? "2025-12-11" : start;
}

function formatPeriodRange(period: Pick<Period, "start_date" | "end_date">) {
  return `${formatDate(displayPeriodStart(period.start_date, period.end_date))} a ${formatDate(period.end_date)}`;
}

function minutesToExcelDuration(value: unknown) {
  return Math.round(Number(value || 0)) / 1440;
}

async function loadClosingRows(db: any, period: Period, companyId = "") {
  const { data: companyEmployees, error: companyEmployeesError } = await db.from("employees").select("id,company_id,full_name,registration");
  if (companyEmployeesError) throw companyEmployeesError;
  const allowedEmployeeIds = new Set((companyEmployees ?? []).filter((employee: any) => !companyId || employee.company_id === companyId).map((employee: any) => String(employee.id)));
  const employeeByName = new Map((companyEmployees ?? []).map((employee: any) => [String(employee.full_name ?? "").trim().toLowerCase(), String(employee.id)]));
  const employeeByRegistration = new Map((companyEmployees ?? []).filter((employee: any) => employee.registration).map((employee: any) => [String(employee.registration).trim(), String(employee.id)]));
  const belongsToCompany = (row: any) => !companyId || (row.employee_id ? allowedEmployeeIds.has(String(row.employee_id)) : allowedEmployeeIds.has(employeeByRegistration.get(String(row.registration ?? "").trim()) ?? employeeByName.get(String(row.employee_name ?? "").trim().toLowerCase()) ?? ""));
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
    return (historical ?? []).filter(belongsToCompany).map(applyOverride);
  }

  const [
    { data: employeeRows, error: employeeError },
    { data: overtimeRows, error: overtimeError },
    { data: occurrenceRows, error: occurrenceError },
    { data: debitRows, error: debitError },
    { data: certificateRows, error: certificateError },
    { data: holidayRows, error: holidayError },
  ] = await Promise.all([
    db.from("employees")
      .select("id,full_name,registration,department_id,position_id,hire_date,termination_date,status,work_schedule_id,company_id,work_schedules(weekly_minutes),departments(name),positions(name)")
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
    db.from("holidays").select("holiday_date").eq("is_demo", false),
  ]);

  const queryError = employeeError ?? overtimeError ?? occurrenceError ?? debitError ?? certificateError ?? holidayError;
  if (queryError) throw queryError;

  const additionalHolidayDates = new Set(
    (holidayRows ?? []).map((row: any) => String(row.holiday_date).slice(0, 10)),
  );

  const employeesInPeriod = (employeeRows ?? []).filter((employee: any) =>
    (!companyId || employee.company_id === companyId) &&
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
    const weeklyMinutes = Number(employee.work_schedules?.weekly_minutes || 0);
    const dailyMinutes = weeklyMinutes > 0 ? weeklyMinutes / 5 : 528;
    const expected = effectiveStart > effectiveEnd ? 0 : Math.round(countWorkingWeekdays(effectiveStart, effectiveEnd, additionalHolidayDates as Set<string>) * dailyMinutes);
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
        ? Math.round(quantity * dailyMinutes)
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
      certificateMinutes += Math.round(days * dailyMinutes);
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

    // Abonos refletem as ocorrências folga_abonada/abono; atestados e declarações
    // permanecem em campos próprios. A folga descontada segue somente informativa.
    const allowanceTotal = extraAllowanceMinutes;
    const lostMinutes = Math.round(absenceQuantity * dailyMinutes)
      + certificateMinutes + declarationMinutes + allowanceTotal + debitMinutes;
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
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DP SUCCESS";
  workbook.subject = "Fechamento de Ponto";
  workbook.title = `Fechamento de Ponto - ${formatDate(displayPeriodStart(period.start_date, period.end_date))} a ${formatDate(period.end_date)}`;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Fechamento", {
    views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
  });
  const lastColumn = closingColumns.length;
  sheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "DP Success • FECHAMENTO DE PONTO";
  titleCell.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B3A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.getCell(2, 1).value = `Competência: ${formatDate(displayPeriodStart(period.start_date, period.end_date))} a ${formatDate(period.end_date)}  |  Referência: ${String(period.reference_month).padStart(2, "0")}/${period.reference_year}  |  Status: ${period.status}`;
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
      if (closingColumns[index]?.duration) row.getCell(index + 1).numFmt = "[h]:mm;-[h]:mm";
    }
    row.getCell(7).numFmt = "0";
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


type BankColumn = {
  header: string;
  key: string;
  width: number;
  duration?: boolean;
  signedText?: boolean;
};

const bankColumns: BankColumn[] = [
  { header: "Matrícula", key: "registration", width: 13 },
  { header: "Funcionário", key: "employee_name", width: 34 },
  { header: "Status", key: "status_label", width: 14 },
  { header: "Departamento", key: "department_name", width: 22 },
  { header: "Saldo do mês", key: "month_balance", width: 17, signedText: true },
  { header: "Saldo disponível acumulado", key: "accumulated_balance", width: 27, signedText: true },
  { header: "HE 60%", key: "he60", width: 13, duration: true },
  { header: "HE 60% + 20% noturno", key: "he60Night", width: 23, duration: true },
  { header: "HE 100%", key: "he100", width: 13, duration: true },
  { header: "HE 100% + 20% noturno", key: "he100Night", width: 24, duration: true },
  { header: "Adicional noturno 20%", key: "night20", width: 23, duration: true },
  { header: "Débito / atrasos", key: "debit", width: 18, duration: true },
  { header: "Ajustes (+/-)", key: "adjustment", width: 16, signedText: true },
  { header: "Pagamentos de HE", key: "payment_minutes", width: 18, duration: true },
  { header: "Interjornada (informativo)", key: "interjornada", width: 25, duration: true },
];

async function downloadBankHoursExcel(period: Period, rows: any[]) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DP SUCCESS";
  workbook.subject = "Banco de Horas";
  workbook.title = `Banco de Horas - ${formatDate(displayPeriodStart(period.start_date, period.end_date))} a ${formatDate(period.end_date)}`;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Banco de Horas", {
    views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
  });
  const lastColumn = bankColumns.length;
  sheet.mergeCells(1, 1, 1, lastColumn);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "DP Success • BANCO DE HORAS";
  titleCell.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B3A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;

  sheet.mergeCells(2, 1, 2, lastColumn);
  sheet.getCell(2, 1).value = `Competência: ${formatDate(displayPeriodStart(period.start_date, period.end_date))} a ${formatDate(period.end_date)}  |  Referência: ${String(period.reference_month).padStart(2, "0")}/${period.reference_year}  |  Status: ${period.status}`;
  sheet.getCell(2, 1).font = { size: 11, bold: true, color: { argb: "FF123B3A" } };
  sheet.getCell(2, 1).alignment = { vertical: "middle" };
  sheet.getRow(2).height = 23;

  sheet.addRow([]);
  sheet.addRow([]);
  const headerRow = sheet.addRow(bankColumns.map(column => column.header));
  headerRow.height = 34;
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FF123B3A" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDF7F0" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FF06CAA0" } } };
  });

  for (const source of rows) {
    const rowData: Record<string, unknown> = {};
    for (const column of bankColumns) {
      const value = source[column.key];
      if (column.signedText) rowData[column.key] = minutesToHours(Number(value || 0), true);
      else if (column.duration) rowData[column.key] = minutesToExcelDuration(value);
      else rowData[column.key] = value ?? "";
    }
    const row = sheet.addRow(bankColumns.map(column => rowData[column.key]));
    row.eachCell((cell, columnNumber) => {
      cell.alignment = {
        vertical: "middle",
        horizontal: columnNumber >= 5 ? "center" : "left",
      };
      if (row.number % 2 === 0) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5FAF8" } };
      }
    });
    for (let index = 0; index < bankColumns.length; index++) {
      if (bankColumns[index]?.duration) row.getCell(index + 1).numFmt = "[h]:mm;-[h]:mm";
    }
  }

  bankColumns.forEach((column, index) => {
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
  anchor.download = `dp-success-banco-de-horas-${period.start_date}-a-${period.end_date}.xlsx`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}


type StandardReportColumn = {
  header: string;
  key: string;
  width: number;
  format?: "date" | "duration" | "currency" | "number";
};

const standardReportColumns: Record<string, StandardReportColumn[]> = {
  interjornada: [
    { header: "Matrícula", key: "registration", width: 14 },
    { header: "Funcionário", key: "employee", width: 32 },
    { header: "Departamento", key: "department", width: 24 },
    { header: "Data", key: "date", width: 14, format: "date" },
    { header: "Interjornada", key: "minutes", width: 16, format: "duration" },
    { header: "Observações", key: "description", width: 42 },
  ],
  horas_pagar: [
    { header: "Nome do funcionário", key: "employee", width: 34 },
    { header: "HE 60% — Quantidade", key: "he60_minutes", width: 20, format: "duration" },
    { header: "HE 60% — Valor", key: "he60_value", width: 18, format: "currency" },
    { header: "HE 60% + 20% noturno — Quantidade", key: "he60night_minutes", width: 29, format: "duration" },
    { header: "HE 60% + 20% noturno — Valor", key: "he60night_value", width: 27, format: "currency" },
    { header: "HE 100% — Quantidade", key: "he100_minutes", width: 20, format: "duration" },
    { header: "HE 100% — Valor", key: "he100_value", width: 18, format: "currency" },
    { header: "Adicional noturno 20% — Quantidade", key: "night20_minutes", width: 29, format: "duration" },
    { header: "Adicional noturno 20% — Valor", key: "night20_value", width: 27, format: "currency" },
    { header: "Total de horas", key: "total_minutes", width: 17, format: "duration" },
    { header: "Total a pagar", key: "total_value", width: 19, format: "currency" },
  ],
  atestados: [
    { header: "Tipo de registro", key: "tipo", width: 23 },
    { header: "Funcionário", key: "employee", width: 32 },
    { header: "Data inicial", key: "start_date", width: 15, format: "date" },
    { header: "Data final", key: "end_date", width: 15, format: "date" },
    { header: "Dias", key: "days", width: 12, format: "number" },
    { header: "Horas abonadas", key: "horas_abonadas", width: 17, format: "duration" },
    { header: "Motivo", key: "motivo", width: 20 },
    { header: "Tipo de atestado", key: "certificate_type", width: 21 },
    { header: "CID", key: "cid", width: 14 },
    { header: "Observações", key: "notes", width: 42 },
  ],
  ocorrencias: [
    { header: "Funcionário", key: "employee", width: 32 },
    { header: "Data inicial", key: "date", width: 15, format: "date" },
    { header: "Data final", key: "end_date", width: 15, format: "date" },
    { header: "Ocorrência", key: "type", width: 28 },
    { header: "Quantidade", key: "quantity", width: 15, format: "number" },
    { header: "Unidade", key: "unit", width: 15 },
    { header: "Observações", key: "description", width: 42 },
  ],
};

const standardReportTitles: Record<string, { title: string; subject: string; sheet: string; filename: string }> = {
  interjornada: {
    title: "DP Success • INTERJORNADA POR FUNCIONÁRIO",
    subject: "Interjornada por funcionário",
    sheet: "Resumo por funcionário",
    filename: "dp-success-interjornada-por-funcionario.xlsx",
  },
  horas_pagar: {
    title: "DP Success • HORAS A PAGAR",
    subject: "Horas a pagar",
    sheet: "Horas a Pagar",
    filename: "dp-success-horas-a-pagar.xlsx",
  },
  atestados: {
    title: "DP Success • DECLARAÇÕES E ATESTADOS",
    subject: "Declarações e atestados",
    sheet: "Declarações e Atestados",
    filename: "dp-success-declaracoes-e-atestados.xlsx",
  },
  ocorrencias: {
    title: "DP Success • FALTAS E FOLGAS",
    subject: "Faltas e folgas",
    sheet: "Faltas e Folgas",
    filename: "dp-success-faltas-e-folgas.xlsx",
  },
};

function dateToExcelValue(value: unknown) {
  const raw = String(value ?? "");
  const parts = raw.split("-");
  if (parts.length !== 3 || !parts.every(part => /^\d+$/.test(part))) return raw;
  const [year, month, day] = parts.map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!));
}

function durationToExcelValue(value: unknown) {
  if (typeof value === "string" && value.includes(":")) {
    const trimmed = value.trim();
    const negative = trimmed.startsWith("-");
    const parts = trimmed.replace(/^-/, "").split(":");
    if (parts.length === 2 && parts.every(part => /^\d+$/.test(part))) {
      const minutes = Number(parts[0]) * 60 + Number(parts[1]);
      return (negative ? -minutes : minutes) / 1440;
    }
  }
  return Math.round(Number(value || 0)) / 1440;
}

async function downloadStandardReportExcel(kind: string, rows: any[], subtitle?: string) {
  const ExcelJS = await import("exceljs");
  const definition = standardReportTitles[kind];
  const detailColumns = standardReportColumns[kind];
  if (!definition || !detailColumns) throw new Error("Tipo de relatório não reconhecido.");

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DP SUCCESS";
  workbook.subject = definition.subject;
  workbook.title = definition.subject;
  workbook.created = new Date();

  const writeStyledSheet = (
    sheetName: string,
    title: string,
    subtitle: string,
    columns: StandardReportColumn[],
    sourceRows: any[],
  ) => {
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
    });
    const lastColumn = columns.length;

    sheet.mergeCells(1, 1, 1, lastColumn);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = title;
    titleCell.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B3A" } };
    titleCell.alignment = { vertical: "middle", horizontal: "left" };
    sheet.getRow(1).height = 30;

    sheet.mergeCells(2, 1, 2, lastColumn);
    sheet.getCell(2, 1).value = subtitle;
    sheet.getCell(2, 1).font = { size: 11, bold: true, color: { argb: "FF123B3A" } };
    sheet.getCell(2, 1).alignment = { vertical: "middle", wrapText: true };
    sheet.getRow(2).height = 23;

    sheet.addRow([]);
    sheet.addRow([]);
    const headerRow = sheet.addRow(columns.map(column => column.header));
    headerRow.height = 34;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FF123B3A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDF7F0" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = { bottom: { style: "thin", color: { argb: "FF06CAA0" } } };
    });

    for (const source of sourceRows) {
      const values = columns.map(column => {
        const value = source[column.key];
        if (value == null || value === "") return "";
        if (column.format === "date") return dateToExcelValue(value);
        if (column.format === "duration") return durationToExcelValue(value);
        if (column.format === "currency" || column.format === "number") {
          const numeric = Number(value);
          return Number.isFinite(numeric) ? numeric : "";
        }
        return value;
      });

      const row = sheet.addRow(values);
      row.eachCell((cell, columnNumber) => {
        cell.alignment = {
          vertical: "middle",
          horizontal: columnNumber >= 3 ? "center" : "left",
          wrapText: columnNumber === lastColumn,
        };
        if (row.number % 2 === 0) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5FAF8" } };
        }
      });

      columns.forEach((column, index) => {
        const cell = row.getCell(index + 1);
        if (column.format === "date") cell.numFmt = "dd/mm/yyyy";
        else if (column.format === "duration") cell.numFmt = "[h]:mm;-[h]:mm";
        else if (column.format === "currency") cell.numFmt = '"R$" #,##0.00';
        else if (column.format === "number") cell.numFmt = "0";
      });
    }

    columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.width;
    });
    sheet.autoFilter = {
      from: { row: 5, column: 1 },
      to: { row: Math.max(5, sheet.rowCount), column: lastColumn },
    };
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    sheet.properties.defaultRowHeight = 20;
  };

  const exportDate = new Date().toLocaleDateString("pt-BR");
  if (kind === "interjornada") {
    const grouped = new Map<string, any>();
    for (const row of rows) {
      const key = String(row.employee_id ?? row.registration ?? row.employee);
      const existing = grouped.get(key);
      if (existing) {
        existing.total_minutes += Math.abs(Number(row.minutes || 0));
        existing.launch_count += 1;
      } else {
        grouped.set(key, {
          registration: row.registration ?? "",
          employee: row.employee ?? "",
          department: row.department ?? "",
          total_minutes: Math.abs(Number(row.minutes || 0)),
          launch_count: 1,
        });
      }
    }
    const summaryRows = [...grouped.values()].sort((a, b) =>
      String(a.employee).localeCompare(String(b.employee), "pt-BR")
    );
    const summaryColumns: StandardReportColumn[] = [
      { header: "Matrícula", key: "registration", width: 14 },
      { header: "Funcionário", key: "employee", width: 34 },
      { header: "Departamento", key: "department", width: 25 },
      { header: "Total de interjornada", key: "total_minutes", width: 22, format: "duration" },
      { header: "Quantidade de lançamentos", key: "launch_count", width: 25, format: "number" },
    ];
    writeStyledSheet(
      "Resumo por funcionário",
      definition.title,
      "Total por funcionário  |  Exportado em: " + exportDate + "  |  Interjornada é informativa e não compõe o saldo do banco de horas.",
      summaryColumns,
      summaryRows,
    );

    const detailRows = [...rows].sort((a, b) =>
      String(a.employee).localeCompare(String(b.employee), "pt-BR") ||
      String(a.date).localeCompare(String(b.date))
    );
    writeStyledSheet(
      "Detalhamento",
      "DP Success • DETALHAMENTO DE INTERJORNADA",
      "Lançamentos de interjornada  |  Exportado em: " + exportDate + "  |  Informativo; não altera o saldo do banco de horas.",
      detailColumns,
      detailRows,
    );
  } else {
    writeStyledSheet(
      definition.sheet,
      definition.title,
      subtitle ?? ("Registros disponíveis: " + rows.length + "  |  Exportado em: " + exportDate),
      detailColumns,
      rows,
    );
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = definition.filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Relatorios() {
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
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

  const allCompetencies = selectedPeriodId === "todos";
  const competence = allCompetencies ? null : periods.find(period => period.id === selectedPeriodId) ?? periods[0] ?? null;

  async function exportReport(kind: string, format: "excel" | "pdf" = "excel") {
    setBusy(kind);
    setError("");
    const db = supabase as any;

    try {
      const { data: companyEmployeeRows, error: companyEmployeeError } = await db.from("employees").select("id,company_id,full_name,registration");
      if (companyEmployeeError) throw companyEmployeeError;
      const allowedEmployeeIds = new Set((companyEmployeeRows ?? []).filter((employee: any) => !companyFilter || employee.company_id === companyFilter).map((employee: any) => String(employee.id)));
      if (kind === "fechamento") {
        const targetPeriods = allCompetencies ? periods : competence ? [competence] : [];
        if (!targetPeriods.length) throw new Error("Não há competências para exportar.");
        const pdfRows: any[] = [];
        for (const targetPeriod of targetPeriods) {
          const rows = await loadClosingRows(db, targetPeriod, companyFilter);
          if (!rows.length) continue;
          const ref = String(targetPeriod.reference_month).padStart(2, "0") + "/" + targetPeriod.reference_year;
          pdfRows.push(...rows.map((row: any) => ({ Competência: ref, Funcionário: row.employee_name, Matrícula: row.registration, Departamento: row.department_name, Cargo: row.position_name, "Horas previstas": minutesToHours(row.expected_minutes), "Horas trabalhadas": minutesToHours(row.worked_minutes), "Faltas (dias)": row.absence_quantity, "Atestados (min)": row.certificate_minutes, "Declarações (min)": row.declaration_minutes, "Abonos (min)": row.allowance_minutes, "Débito (min)": row.debit_minutes, "HE 60% (min)": row.he_60_minutes, "HE 60% + 20% (min)": row.he_60_night_minutes, "HE 100% (min)": row.he_100_minutes, "HE 20% (min)": row.he_20_minutes, "Interjornada (min)": row.interjornada_minutes })));
          if (format === "excel") await downloadClosingExcel(targetPeriod, rows);
        }
        if (!pdfRows.length) throw new Error("Não há funcionários ou lançamentos para exportar nas competências selecionadas.");
        if (format === "pdf") downloadReportPdf("Fechamento de ponto", pdfRows, allCompetencies ? "Todas as competências" : "Competência: " + formatDate(displayPeriodStart(competence!.start_date, competence!.end_date)) + " a " + formatDate(competence!.end_date));
        return;
      }

      if (kind === "banco") {
        const targetPeriods = allCompetencies ? periods : competence ? [competence] : [];
        if (!targetPeriods.length) throw new Error("Não há competências para exportar.");
        const { data: employeeRows, error: employeeError } = await db
          .from("employees")
          .select("id,full_name,registration,status,hire_date,termination_date,company_id,departments(name)")
          .order("full_name");
        if (employeeError) throw employeeError;
        const pdfRows: any[] = [];
        for (const targetPeriod of targetPeriods) {
          const employeesInPeriod = (employeeRows ?? []).filter((employee: any) =>
            (!companyFilter || employee.company_id === companyFilter) &&
            (!employee.hire_date || employee.hire_date <= targetPeriod.end_date) &&
            (!employee.termination_date || employee.termination_date >= targetPeriod.start_date)
          );
          if (!employeesInPeriod.length) continue;
          const balancesById = await balancesByEmployees(employeesInPeriod.map((employee: any) => String(employee.id)));
          const bankRows = employeesInPeriod.map((employee: any) => {
            const balance = (balancesById[String(employee.id)] ?? []).find((item: any) => item.period.id === targetPeriod.id);
            if (!balance) return null;
            return {
              registration: employee.registration ?? "",
              employee_name: employee.full_name ?? "",
              status_label: String(employee.status ?? "ativo").toLowerCase() === "inativo" ? "Inativo" : "Ativo",
              department_name: employee.departments?.name ?? "",
              month_balance: balance.monthBalance,
              accumulated_balance: balance.accumulated,
              he60: balance.composition.HE_60,
              he60Night: balance.composition.HE_60_NOTURNO,
              he100: balance.composition.HE_100,
              he100Night: balance.composition.HE_100_NOTURNO,
              night20: balance.composition.ADICIONAL_NOTURNO,
              debit: balance.composition.debit,
              adjustment: balance.adjustment,
              payment_minutes: balance.paymentMinutes,
              interjornada: balance.composition.INTERJORNADA_50,
            };
          }).filter(Boolean);
          const ref = String(targetPeriod.reference_month).padStart(2, "0") + "/" + targetPeriod.reference_year;
          pdfRows.push(...bankRows.map((row: any) => ({ Competência: ref, Matrícula: row.registration, Funcionário: row.employee_name, Situação: row.status_label, Departamento: row.department_name, "Saldo do mês (min)": row.month_balance, "Saldo acumulado (min)": row.accumulated_balance, "HE 60% (min)": row.he60, "HE 60% + 20% (min)": row.he60Night, "HE 100% (min)": row.he100, "HE 100% + 20% (min)": row.he100Night, "Adicional noturno (min)": row.night20, "Débito (min)": row.debit, "Ajustes (min)": row.adjustment, "Pagamentos (min)": row.payment_minutes, "Interjornada (min)": row.interjornada })));
          if (format === "excel" && bankRows.length) await downloadBankHoursExcel(targetPeriod, bankRows);
        }
        if (!pdfRows.length) throw new Error("Não há saldos calculados para exportar.");
        if (format === "pdf") downloadReportPdf("Banco de horas", pdfRows, allCompetencies ? "Todas as competências" : "Competência: " + formatDate(displayPeriodStart(competence!.start_date, competence!.end_date)) + " a " + formatDate(competence!.end_date));
        return;
      }

      if (kind === "horas_pagar") {
        if (!competence) throw new Error("Para Horas a Pagar, selecione uma competência específica; o saldo acumulado não deve ser somado entre períodos.");

        const { data: employeeRows, error: employeeError } = await db
          .from("employees")
          .select("id,full_name,salary,registration,status,hire_date,termination_date,company_id,work_schedules(weekly_minutes)")
          .order("full_name");
        if (employeeError) throw employeeError;

        const employeesInPeriod = (employeeRows ?? []).filter((employee: any) =>
          (!companyFilter || employee.company_id === companyFilter) &&
          (!employee.hire_date || employee.hire_date <= competence.end_date) &&
          (!employee.termination_date || employee.termination_date >= competence.start_date)
        );
        if (!employeesInPeriod.length) {
          throw new Error("Não há funcionários vinculados a essa competência.");
        }

        // O saldo continua vindo do cálculo central, preservando BASE, overrides,
        // ajustes, pagamentos existentes e saldos manuais já validados.
        const balancesById = await balancesByEmployees(
          employeesInPeriod.map((employee: any) => String(employee.id))
        );
        const payableRows: any[] = [];

        for (const employee of employeesInPeriod) {
          const employeeBalances = balancesById[String(employee.id)] ?? [];
          const periodBalance = employeeBalances.find((item: any) => item.period.id === competence.id);
          const generalBalance = employeeBalances.length
            ? Number(employeeBalances[employeeBalances.length - 1]!.accumulated ?? 0)
            : 0;

          // A tela Pagamentos não cria composição quando o saldo geral acumulado não é positivo.
          if (!periodBalance || generalBalance <= 0) continue;

          const composition = periodBalance.composition;
          const nightMinutes = Math.max(0, Number(composition?.ADICIONAL_NOTURNO ?? 0));
          const gross60Night = Math.max(0, Number(composition?.HE_60_NOTURNO ?? 0));
          const gross100 = Math.max(0, Number(composition?.HE_100 ?? 0));
          const targetPayable = Math.max(0, Number(periodBalance.monthBalance ?? 0));

          // Mesma distribuição de categorias e precedência da tela Pagamentos.
          const has60Night = gross60Night > 0;
          const payable60Night = has60Night ? Math.min(gross60Night, targetPayable) : 0;
          const payable100 = Math.min(
            gross100,
            Math.max(0, targetPayable - payable60Night - (has60Night ? 0 : Math.min(nightMinutes, targetPayable)))
          );
          const payableNight = has60Night
            ? 0
            : Math.min(nightMinutes, Math.max(0, targetPayable - payable100));
          const payable60 = Math.max(0, targetPayable - payable60Night - payable100 - payableNight);

          const weeklyMinutes = Number(employee.work_schedules?.weekly_minutes || 0);
          const divisor = weeklyMinutes ? (weeklyMinutes / 60) * 5 : 220;
          // Arredonda a hora normal a quatro casas antes de aplicar os adicionais.
          const normalHourlyRate = Number((Number(employee.salary || 0) / divisor).toFixed(4));
          const he60Value = (payable60 / 60) * normalHourlyRate * 1.6;
          const he60NightValue = (payable60Night / 60) * normalHourlyRate * 1.92;
          const he100Value = (payable100 / 60) * normalHourlyRate * 2;
          const night20Value = (payableNight / 60) * normalHourlyRate * 0.2;
          const totalMinutes = payable60 + payable60Night + payable100 + payableNight;
          // Soma valores sem arredondar cada parcela em centavos, igual à tela Pagamentos.
          const totalValue = he60Value + he60NightValue + he100Value + night20Value;

          if (totalMinutes <= 0) continue;

          payableRows.push({
            employee: employee.full_name ?? "",
            he60_minutes: Math.round(payable60),
            he60_value: he60Value,
            he60night_minutes: Math.round(payable60Night),
            he60night_value: he60NightValue,
            he100_minutes: Math.round(payable100),
            he100_value: he100Value,
            night20_minutes: Math.round(payableNight),
            night20_value: night20Value,
            total_minutes: Math.round(totalMinutes),
            total_value: totalValue,
          });
        }

        if (!payableRows.length) {
          throw new Error("Não há horas elegíveis para pagamento na competência selecionada.");
        }

        payableRows.sort((a, b) =>
          String(a.employee).localeCompare(String(b.employee), "pt-BR")
        );
        const subtitle = "Competência: " + formatDate(competence.start_date) + " a " +
          formatDate(competence.end_date) + "  |  Referência: " +
          String(competence.reference_month).padStart(2, "0") + "/" + competence.reference_year +
          "  |  Valores por categoria e total a pagar seguem a composição da tela Pagamentos.";
        if (format === "pdf") {
          const pdfRows = payableRows.map(row => ({
            Funcionário: row.employee,
            "HE 60%": Math.floor(row.he60_minutes / 60) + ":" + String(row.he60_minutes % 60).padStart(2, "0"),
            "Valor HE 60%": row.he60_value,
            "HE 60% + 20%": Math.floor(row.he60night_minutes / 60) + ":" + String(row.he60night_minutes % 60).padStart(2, "0"),
            "Valor HE 60% + 20%": row.he60night_value,
            "HE 100%": Math.floor(row.he100_minutes / 60) + ":" + String(row.he100_minutes % 60).padStart(2, "0"),
            "Valor HE 100%": row.he100_value,
            "Adicional noturno 20%": Math.floor(row.night20_minutes / 60) + ":" + String(row.night20_minutes % 60).padStart(2, "0"),
            "Valor adicional noturno": row.night20_value,
            "Total (R$)": row.total_value,
          }));
          downloadReportPdf("Horas a pagar", pdfRows, subtitle);
        } else await downloadStandardReportExcel("horas_pagar", payableRows, subtitle);
        return;
      }

      let rows: any[] = [];

      if (kind === "interjornada") {
        const data = await fetchAll((from, to) => db
          .from("overtime_records")
          .select("employee_id,reference_date,minutes,notes,launch_type,employees(full_name,registration,company_id,departments(name))")
          .eq("launch_type", "INTERJORNADA_50")
          .order("reference_date", { ascending: false })
          .range(from, to));
        rows = data.filter((x: any) => allowedEmployeeIds.has(String(x.employee_id)) && (allCompetencies || !competence || (x.reference_date >= competence.start_date && x.reference_date <= competence.end_date))).map((x: any) => ({
          employee_id: x.employee_id,
          registration: x.employees?.registration ?? "",
          employee: x.employees?.full_name ?? "",
          department: x.employees?.departments?.name ?? "",
          date: x.reference_date,
          minutes: Math.abs(Number(x.minutes || 0)),
          description: x.notes ?? "",
        }));
      }

      if (kind === "atestados") {
        const [certificates, leaves, declarations, historicalRows] = await Promise.all([
          fetchAll((from, to) => db.from("medical_certificates").select("employee_id,start_date,end_date,days,certificate_type,cid,notes,employees(full_name)").order("start_date", { ascending: false }).range(from, to)),
          fetchAll((from, to) => db.from("occurrences").select("employee_id,occurrence_date,end_date,quantity,unit,notes,employees(full_name),occurrence_types!inner(code,name)").eq("occurrence_types.code", "afastamento").order("occurrence_date", { ascending: false }).range(from, to)),
          fetchAll((from, to) => db.from("occurrences").select("employee_id,occurrence_date,quantity,unit,notes,employees(full_name),occurrence_types!inner(code)").eq("occurrence_types.code", "declaracao_horas").order("occurrence_date", { ascending: false }).range(from, to)),
          fetchAll((from, to) => db.from("historical_kpi_data").select("id,employee_id,registration,employee_name,period_id,reference_year,reference_month,certificate_minutes,declaration_minutes").or("certificate_minutes.gt.0,declaration_minutes.gt.0").order("reference_year", { ascending: false }).range(from, to)),
        ]);

        // O relatório também precisa incluir os totais históricos da BASE que aparecem
        // na tela Declarações e Atestados. Esses totais são apenas informativos e não
        // criam lançamentos operacionais nem alteram cálculos históricos.
        const historicalIds = historicalRows.map((row: any) => row.id);
        let historicalAnnotations: any[] = [];
        if (historicalIds.length) {
          const annotationResult = await db.from("historical_kpi_annotations")
            .select("historical_kpi_data_id,certificate_type,certificate_cid,declaration_observation")
            .in("historical_kpi_data_id", historicalIds);
          if (!annotationResult.error) historicalAnnotations = annotationResult.data ?? [];
        }
        const annotationById = new Map(historicalAnnotations.map((row: any) => [String(row.historical_kpi_data_id), row]));
        const periodById = new Map(periods.map((period: Period) => [String(period.id), period]));
        const employeeByRegistration = new Map((companyEmployeeRows ?? [])
          .filter((employee: any) => employee.registration)
          .map((employee: any) => [String(employee.registration).trim().toLowerCase(), String(employee.id)]));
        const employeeByName = new Map((companyEmployeeRows ?? [])
          .map((employee: any) => [String(employee.full_name ?? "").trim().toLowerCase(), String(employee.id)]));
        const resolveHistoricalEmployeeId = (row: any) => row.employee_id
          ? String(row.employee_id)
          : employeeByRegistration.get(String(row.registration ?? "").trim().toLowerCase()) ??
            employeeByName.get(String(row.employee_name ?? "").trim().toLowerCase()) ?? "";
        const matchesCompetence = (row: any) => {
          if (allCompetencies || !competence) return true;
          if (row.period_id && String(row.period_id) === String(competence.id)) return true;
          const rowPeriod = periodById.get(String(row.period_id ?? ""));
          return !!rowPeriod && rowPeriod.start_date <= competence.end_date && rowPeriod.end_date >= competence.start_date;
        };
        const toClock = (value: unknown) => {
          const minutes = Math.max(0, Math.round(Number(value) || 0));
          return String(Math.floor(minutes / 60)).padStart(2, "0") + ":" + String(minutes % 60).padStart(2, "0");
        };

        rows = [
          ...(certificates ?? []).filter((x: any) => allowedEmployeeIds.has(String(x.employee_id)) && (allCompetencies || !competence || (x.start_date <= competence.end_date && x.end_date >= competence.start_date))).map((x: any) => ({
            tipo: "Atestado", employee: x.employees?.full_name ?? "", start_date: x.start_date,
            end_date: x.end_date, days: x.days, horas_abonadas: "", motivo: "",
            certificate_type: x.certificate_type, cid: x.cid, notes: x.notes ?? "",
          })),
          ...(leaves ?? []).filter((x: any) => allowedEmployeeIds.has(String(x.employee_id)) && (allCompetencies || !competence || ((x.occurrence_date ?? "") <= competence.end_date && (x.end_date ?? x.occurrence_date ?? "") >= competence.start_date))).map((x: any) => ({
            tipo: "Afastamento", employee: x.employees?.full_name ?? "", start_date: x.occurrence_date,
            end_date: x.end_date ?? x.occurrence_date, days: x.quantity, horas_abonadas: "", motivo: "",
            certificate_type: "", cid: "", notes: x.notes ?? "",
          })),
          ...(declarations ?? []).filter((x: any) => allowedEmployeeIds.has(String(x.employee_id)) && (allCompetencies || !competence || (x.occurrence_date >= competence.start_date && x.occurrence_date <= competence.end_date))).map((x: any) => {
            const parts = String(x.notes ?? "").split(" — ");
            const minutes = Math.round(Number(x.quantity ?? 0) * 60);
            return {
              tipo: "Declaração de horas", employee: x.employees?.full_name ?? "", start_date: x.occurrence_date,
              end_date: x.occurrence_date, days: "",
              horas_abonadas: toClock(minutes), motivo: parts[0] ?? "", certificate_type: "", cid: "", notes: parts.slice(1).join(" — "),
            };
          }),
          ...historicalRows.filter((row: any) => {
            const employeeId = resolveHistoricalEmployeeId(row);
            return (!companyFilter || allowedEmployeeIds.has(employeeId)) && matchesCompetence(row);
          }).flatMap((row: any) => {
            const annotation: any = annotationById.get(String(row.id)) ?? {};
            const period = periodById.get(String(row.period_id ?? ""));
            const isExceptionalJan2026 = Number(row.reference_year) === 2026 && Number(row.reference_month) === 1;
            const fallbackStart = period?.start_date ?? (isExceptionalJan2026 ? "2025-12-11" : "");
            const startDate = isExceptionalJan2026 ? "2025-12-11" : fallbackStart;
            const endDate = period?.end_date ?? (isExceptionalJan2026 ? "2026-01-20" : "");
            const employee = row.employee_name ?? (companyEmployeeRows ?? []).find((item: any) => String(item.id) === resolveHistoricalEmployeeId(row))?.full_name ?? "";
            const output: any[] = [];
            const certificateMinutes = Math.max(0, Number(row.certificate_minutes) || 0);
            const declarationMinutes = Math.max(0, Number(row.declaration_minutes) || 0);
            if (certificateMinutes > 0) output.push({
              tipo: "Atestado", employee, start_date: startDate, end_date: endDate, days: "",
              horas_abonadas: toClock(certificateMinutes), motivo: "", certificate_type: annotation.certificate_type ?? "",
              cid: annotation.certificate_cid ?? "", notes: "",
            });
            if (declarationMinutes > 0) output.push({
              tipo: "Declaração de horas", employee, start_date: startDate, end_date: endDate, days: "",
              horas_abonadas: toClock(declarationMinutes), motivo: annotation.declaration_observation ?? "",
              certificate_type: "", cid: "", notes: "",
            });
            return output;
          }),
        ];
      }

      if (kind === "ocorrencias") {
        const data = await fetchAll((from, to) => db.from("occurrences").select("employee_id,occurrence_date,end_date,quantity,unit,notes,employees(full_name),occurrence_types!inner(code,name)").in("occurrence_types.code", ["folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"]).order("occurrence_date", { ascending: false }).range(from, to));
        const currentRows = data
          .filter((x: any) => allowedEmployeeIds.has(String(x.employee_id)) && (allCompetencies || !competence || ((x.occurrence_date ?? "") <= competence.end_date && (x.end_date ?? x.occurrence_date ?? "") >= competence.start_date)))
          .map((x: any) => ({
            date: x.occurrence_date,
            end_date: x.end_date ?? "",
            type: x.occurrence_types?.name ?? "",
            quantity: x.quantity,
            unit: x.unit,
            employee: x.employees?.full_name ?? "",
            description: x.notes ?? "",
          }));

        // Inclui faltas históricas importadas da BASE na exportação, sem alterar
        // a fonte histórica nem seus cálculos. As anotações são apenas visuais.
        const historicalRows = await fetchAll((from, to) => db
          .from("historical_kpi_data")
          .select("id,employee_id,registration,employee_name,period_start,period_end,absence_quantity")
          .gt("absence_quantity", 0)
          .order("period_start", { ascending: false })
          .range(from, to));
        const historicalIds = historicalRows.map((row: any) => row.id);
        let annotations: any[] = [];
        if (historicalIds.length) {
          const annotationResult = await db
            .from("historical_kpi_annotations")
            .select("historical_kpi_data_id,absence_display_date,absence_display_end_date,absence_display_type,absence_display_quantity,absence_display_justification,absence_display_notes")
            .in("historical_kpi_data_id", historicalIds);
          if (!annotationResult.error) annotations = annotationResult.data ?? [];
        }
        const annotationById = new Map(annotations.map((row: any) => [String(row.historical_kpi_data_id), row]));
        const employeeByRegistration = new Map((companyEmployeeRows ?? [])
          .filter((employee: any) => employee.registration)
          .map((employee: any) => [String(employee.registration).trim().toLowerCase(), String(employee.id)]));
        const employeeByName = new Map((companyEmployeeRows ?? [])
          .map((employee: any) => [String(employee.full_name ?? "").trim().toLowerCase(), String(employee.id)]));
        const resolvedHistoricalEmployeeId = (row: any) =>
          row.employee_id
            ? String(row.employee_id)
            : employeeByRegistration.get(String(row.registration ?? "").trim().toLowerCase()) ??
              employeeByName.get(String(row.employee_name ?? "").trim().toLowerCase()) ??
              "";
        const historicalExportRows = historicalRows
          .filter((row: any) => {
            const resolvedId = resolvedHistoricalEmployeeId(row);
            const belongsToSelectedCompany = !companyFilter || allowedEmployeeIds.has(resolvedId);
            const overlapsCompetence = allCompetencies || !competence ||
              (String(row.period_start ?? "") <= competence.end_date && String(row.period_end ?? "") >= competence.start_date);
            return belongsToSelectedCompany && overlapsCompetence;
          })
          .map((row: any) => {
            const annotation: any = annotationById.get(String(row.id)) ?? {};
            const startDate = annotation.absence_display_date ||
              displayPeriodStart(String(row.period_start ?? ""), String(row.period_end ?? ""));
            const endDate = annotation.absence_display_end_date || row.period_end || "";
            const notes = [annotation.absence_display_justification, annotation.absence_display_notes]
              .filter(Boolean)
              .join(" — ");
            return {
              date: startDate,
              end_date: endDate,
              type: annotation.absence_display_type || "Falta importada da BASE",
              quantity: annotation.absence_display_quantity ?? row.absence_quantity,
              unit: "dias",
              employee: row.employee_name ?? "",
              description: notes,
            };
          });
        rows = [...currentRows, ...historicalExportRows];
      }

      if (!rows.length) throw new Error("Não há dados para exportar nesse relatório para os filtros selecionados.");
      if (format === "pdf") {
        const reportTitle = reports.find(([key]) => key === kind)?.[1] ?? "Relatório";
        const subtitle = (allCompetencies ? "Todas as competências" : competence ? "Competência: " + formatDate(displayPeriodStart(competence.start_date, competence.end_date)) + " a " + formatDate(competence.end_date) : "Todas as competências") + (companyFilter ? " · Empresa selecionada" : " · Todas as empresas");
        if (kind === "interjornada") {
          const grouped = new Map<string, { employee_name: string; competence: string; total_minutes: number }>();
          for (const row of rows) {
            const referenceDate = String(row.date ?? "");
            const rowPeriod = periods.find((period: Period) => period.start_date <= referenceDate && period.end_date >= referenceDate);
            const competenceLabel = rowPeriod
              ? formatDate(displayPeriodStart(rowPeriod.start_date, rowPeriod.end_date)) + " a " + formatDate(rowPeriod.end_date)
              : competence
                ? formatDate(displayPeriodStart(competence.start_date, competence.end_date)) + " a " + formatDate(competence.end_date)
                : "Competência não identificada";
            const employeeName = String(row.employee || "Nome não identificado");
            const groupKey = String(row.employee_id ?? employeeName) + "|" + competenceLabel;
            const current = grouped.get(groupKey);
            if (current) current.total_minutes += Math.abs(Math.round(Number(row.minutes) || 0));
            else grouped.set(groupKey, { employee_name: employeeName, competence: competenceLabel, total_minutes: Math.abs(Math.round(Number(row.minutes) || 0)) });
          }
          const interjornadaPdfRows = [...grouped.values()]
            .sort((a, b) => a.employee_name.localeCompare(b.employee_name, "pt-BR") || a.competence.localeCompare(b.competence, "pt-BR"))
            .map(row => ({
              employee_name: row.employee_name,
              competence: row.competence,
              horario: String(Math.floor(row.total_minutes / 60)).padStart(2, "0") + ":" + String(row.total_minutes % 60).padStart(2, "0"),
            }));
          downloadReportPdf("Interjornada por funcionário", interjornadaPdfRows, subtitle + " · Total de interjornada por funcionário e competência (hh:mm).");
        } else {
          downloadReportPdf(reportTitle, rows, subtitle);
        }
      } else {
        await downloadStandardReportExcel(kind, rows);
      }
    } catch (e: any) {
      setError(e.message ?? "Não foi possível gerar o relatório.");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="dp-screen min-h-screen bg-background">
      <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </a>
          <ScreenBrand name="Relatórios" />
        </div>
      </header>
      <main className="dp-screen-content mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
        <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7">
          <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-56 w-56 rounded-full bg-[#06CAA0]/20 blur-3xl" />
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7cebd0]">ANÁLISE • DP SUCCESS</p>
          <h1 style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} className="!text-white text-3xl font-semibold tracking-tight">Relatórios</h1>
          <p className="mt-2 text-sm text-slate-200">
            {loading
              ? "Carregando competências…"
              : competence
                ? `Competência selecionada: ${String(competence.reference_month).padStart(2, "0")}/${competence.reference_year} (${formatDate(competence.start_date)} a ${formatDate(competence.end_date)})`
                : allCompetencies ? "Todas as competências selecionadas" : "Nenhuma competência cadastrada."}
          </p>
        </section>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">Empresa
            <CompanyFilter value={companyFilter} onChange={setCompanyFilter} className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm" />
          </label>
          <label htmlFor="report-period" className="grid gap-1.5 text-sm font-medium">Competência dos relatórios
          <select
            id="report-period"
            value={selectedPeriodId || periods[0]?.id || ""}
            onChange={event => setSelectedPeriodId(event.target.value)}
            disabled={loading || !periods.length || !!busy}
            className="w-full rounded-lg border bg-background px-3 py-2.5 text-sm"
          >
            <option value="todos">Todas as competências</option>
            {periods.map(period => (
              <option key={period.id} value={period.id}>
                {formatPeriodRange(period)} · Ref. {String(period.reference_month).padStart(2, "0")}/{period.reference_year} · {period.status}
              </option>
            ))}
          </select>
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Empresa e competência são aplicadas aos relatórios. Faltas e Folgas, Interjornada, Declarações e Atestados respeitam o período selecionado; “Todas as competências” inclui todo o histórico. Horas a Pagar exige competência específica para evitar somar saldos acumulados entre períodos.
        </p>

        {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reports.map(([key, title]) => (
            <Card key={key} className="p-5">
              <FileBarChart className="h-5 w-5 text-primary" />
              <h2 className="mt-4 font-bold">{title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {key === "fechamento"
                  ? "Excel com funcionários, horas previstas e trabalhadas, faltas, atestados, declarações, abonos, débitos e horas extras."
                  : key === "banco"
                    ? "Excel com nome do funcionário, saldo do mês, saldo acumulado, débitos, ajustes, pagamentos e composição das horas extras."
                    : key === "interjornada"
                      ? "Excel com resumo por funcionário e aba de detalhamento, totalizando as horas de interjornada sem alterar o saldo do banco."
                      : key === "horas_pagar"
                        ? "Excel com uma linha por funcionário, horas e valores separados por categoria e total a pagar da competência."
                        : key === "atestados"
                          ? "Excel com declarações e atestados, período, dias, horas abonadas, motivo, CID e observações."
                          : "Excel de faltas e folgas com funcionário, período, tipo, quantidade e observações."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => void exportReport(key, "excel")} disabled={!!busy || loading || (key === "horas_pagar" && allCompetencies)} title={key === "horas_pagar" && allCompetencies ? "Selecione uma competência específica para calcular Horas a Pagar." : undefined} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
                  <Download className="h-4 w-4" /> {busy === key ? "Gerando…" : "Exportar Excel"}
                </button>
                <button onClick={() => void exportReport(key, "pdf")} disabled={!!busy || loading || (key === "horas_pagar" && allCompetencies)} title={key === "horas_pagar" && allCompetencies ? "Selecione uma competência específica para calcular Horas a Pagar." : undefined} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  <FileBarChart className="h-4 w-4" /> Exportar PDF
                </button>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
