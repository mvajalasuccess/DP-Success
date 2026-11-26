import { canSelectNewAttendanceEmployee } from "@/lib/attendance-employee";
// @ts-nocheck -- compact legacy code; strict index-signature checks disabled until refactor
import {attendanceDetails,compareAttendanceDates,expandAttendance,type AttendanceDetail} from "@/lib/historical-attendance-details";
import { ArrowLeft, ChevronDown, ChevronUp, Download, FileSpreadsheet, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { DocumentAuditImport } from "@/components/document-audit-import";
import { supabase } from "@/integrations/supabase/client";
import { CompanyFilter } from "@/components/company-filter";

import { ScreenBrand } from "@/components/screen-brand";
type Employee = { id: string; full_name: string; status?: string; hire_date?: string | null; termination_date?: string | null; company_id?: string | null };
type Certificate = {
  id: string; employee_id: string; start_date: string; end_date: string; days: number;
  certificate_type: string; cid: string | null; notes: string | null; employees?: { full_name: string } | null;
};

const emptyForm = { employee_id: "", start_date: "", end_date: "", days: "", certificate_type: "medico", cid: "", notes: "" };

function formatDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function compareNewestAttendanceFirst(first?: string | null, second?: string | null) {
  return first && second ? compareAttendanceDates(second, first) : compareAttendanceDates(first, second);
}

function countDays(start: string, end: string) {
  if (!start || !end) return 0;
  const a = new Date(start + "T00:00:00");
  const b = new Date(end + "T00:00:00");
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000) + 1);
}

type Declaration = { id: string; employee_id: string; occurrence_date: string; quantity: number; notes: string | null; employees?: { full_name: string } | null };
type Period = { id: string; start_date: string; end_date: string; status?: string };
type HistoricalBaseRow = { id: string; employee_id: string | null; employee_name: string; registration: string | null; period_id: string; reference_year: number; reference_month: number; certificate_minutes: number; declaration_minutes: number; period_start?: string; period_end?: string; certificate_type?: string | null; certificate_cid?: string | null; declaration_observation?: string | null; certificate_display_start?:string|null; certificate_display_end?:string|null; certificate_display_days?:number|null; certificate_display_notes?:string|null; declaration_display_start?:string|null; declaration_display_end?:string|null; declaration_display_minutes?:number|null; declaration_display_reason?:string|null };
type ClosingAttendance = {
  employee_id: string;
  period_id: string;
  certificate_minutes: number;
  declaration_minutes: number;
};

type HistoricalAnnotationForm = { details:AttendanceDetail[]; row: HistoricalBaseRow; certificate_type: string; certificate_cid: string; declaration_observation: string; kind:"atestado"|"declaracao"; start:string; end:string; days:string; quantity:string; notes:string; reason:string };

const declarationReasons = ["Acompanhante", "Consulta", "Exame", "Outros"];

export function Atestados() {
  const [rows, setRows] = useState<Certificate[]>([]);
  const [declarations, setDeclarations] = useState<Declaration[]>([]);
  const [historicalBaseRows, setHistoricalBaseRows] = useState<HistoricalBaseRow[]>([]);
  const [closingAttendance, setClosingAttendance] = useState<ClosingAttendance[]>([]);
  const [historicalEdit, setHistoricalEdit] = useState<HistoricalAnnotationForm | null>(null);
  const [savingHistoricalAnnotation, setSavingHistoricalAnnotation] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [filterEmployee, setFilterEmployee] = useState("todos");
  const [employeeStatusFilter, setEmployeeStatusFilter] = useState<"ativo" | "inativo" | "todos">("ativo");
  const [companyFilter, setCompanyFilter] = useState("");
  const [filterPeriod, setFilterPeriod] = useState("todos");
  const [showCertificates, setShowCertificates] = useState(true);
  const [showDeclarations, setShowDeclarations] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"atestado" | "declaracao">("atestado");
  const [declarationForm, setDeclarationForm] = useState({ employee_id: "", occurrence_date: "", quantity: "", reason: "Acompanhante", notes: "" });
  const [editingDeclaration, setEditingDeclaration] = useState<Declaration | null>(null);

  const referenceDate = mode === "declaracao" ? declarationForm.occurrence_date : form.start_date;
  const selectedEditingRecord = (mode === "declaracao" ? editingDeclaration : editing);
  const openPeriod = periods.find(period => period.status === "aberto");
  const employeesForDate = employees.filter(employee => {
    if (employee.id === selectedEditingRecord?.employee_id) return true;
    if (companyFilter && employee.company_id !== companyFilter) return false;
    const matchesDate = !referenceDate ||
      ((!employee.hire_date || employee.hire_date <= referenceDate) &&
       (!employee.termination_date || employee.termination_date >= referenceDate));
    return matchesDate && (selectedEditingRecord || canSelectNewAttendanceEmployee(employee, openPeriod));
  });

  async function load() {
    setError("");
    const { data, error } = await supabase
      .from("medical_certificates")
      .select("id,employee_id,start_date,end_date,days,certificate_type,cid,notes,employees(full_name)")
      .order("start_date", { ascending: false });
    if (error) setError(error.message);
    else setRows((data ?? []) as Certificate[]);
    const decl = await supabase.from("occurrences").select("id,employee_id,occurrence_date,quantity,notes,employees(full_name),occurrence_types!inner(code)").eq("occurrence_types.code", "declaracao_horas").order("occurrence_date", { ascending: false });
    if (!decl.error) setDeclarations((decl.data ?? []) as unknown as Declaration[]);
    const { data: periodData } = await supabase.from("time_periods").select("id,start_date,end_date,status").order("start_date", { ascending: false });
    const loadedPeriods = (periodData ?? []) as Period[];
    setPeriods(loadedPeriods);

    // A BASE histórica contém totais por funcionário/competência, não lançamentos
    // individuais com data, CID ou motivo. Exibimos esses totais separadamente,
    // sem transformá-los em atestados/declarações operacionais nem afetar cálculos.
    const historicalResult = await (supabase as any).from("historical_kpi_data")
      .select("id,employee_id,employee_name,registration,period_id,reference_year,reference_month,certificate_minutes,declaration_minutes")
      .or("certificate_minutes.gt.0,declaration_minutes.gt.0")
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false });
    if (historicalResult.error) {
      setError(previous => previous || "Não foi possível carregar os totais históricos da BASE: " + historicalResult.error.message);
      setHistoricalBaseRows([]);
    } else {
      const { data: annotationData, error: annotationError } = await (supabase as any)
        .from("historical_kpi_annotations")
        .select("historical_kpi_data_id,certificate_type,certificate_cid,declaration_observation,certificate_display_start,certificate_display_end,certificate_display_days,certificate_display_notes,declaration_display_start,declaration_display_end,declaration_display_minutes,declaration_display_reason,certificate_details,declaration_details");
      if (annotationError) {
        setError(previous => previous || "Os campos complementares do histórico ainda precisam ser habilitados no banco de dados: " + annotationError.message);
      }
      const annotationsByHistoricalId = new Map((annotationData ?? []).map((item: any) => [item.historical_kpi_data_id, item]));
      const periodById = new Map(loadedPeriods.map(p => [p.id, p]));
      const historical = ((historicalResult.data ?? []) as HistoricalBaseRow[])
        .map(row => {
          const annotation = annotationsByHistoricalId.get(row.id) as any;

          const period = periodById.get(row.period_id);
          // A competência histórica excepcional de jan/2026 foi fechada de 11/12/2025 a 20/01/2026.
          // Essa regra afeta apenas a identificação exibida nesta lista histórica, sem alterar períodos ou cálculos.
          const isExceptionalJan2026 = Number(row.reference_year) === 2026 && Number(row.reference_month) === 1;
          const fallbackStart = new Date(row.reference_year, row.reference_month - 2, 21);
          const fallbackEnd = new Date(row.reference_year, row.reference_month - 1, 20);
          const toISO = (date: Date) => date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
          return {
            ...row,
            ...(annotation??{}),
            certificate_type: annotation?.certificate_type ?? null,
            certificate_cid: annotation?.certificate_cid ?? null,
            declaration_observation: annotation?.declaration_observation ?? null,
            period_start: isExceptionalJan2026 ? "2025-12-11" : (period?.start_date ?? toISO(fallbackStart)),
            period_end: isExceptionalJan2026 ? "2026-01-20" : (period?.end_date ?? toISO(fallbackEnd)),
          };
        })
        .filter(row => (row.period_end ?? "") >= "2025-12-11");
      setHistoricalBaseRows(historical);

    }
  }

  async function loadClosingAttendance() {
    const adjustments: ClosingAttendance[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error: adjustmentError } = await (supabase as any).from("point_closing_overrides")
        .select("employee_id,period_id,certificate_minutes,declaration_minutes")
        .order("period_id").order("employee_id")
        .range(offset, offset + pageSize - 1);
      if (adjustmentError) {
        setClosingAttendance([]);
        setError(previous => previous || "Não foi possível carregar os ajustes do Fechamento de Ponto.");
        return;
      }
      adjustments.push(...(data ?? []));
      if ((data?.length ?? 0) < pageSize) break;
    }
    setClosingAttendance(adjustments);
  }

  async function loadEmployees() {
    const { data } = await (supabase as any).from("employees").select("id,full_name,status,hire_date,termination_date,company_id").order("full_name");
    setEmployees((data ?? []) as Employee[]);
  }

  useEffect(() => { void load(); void loadEmployees(); void loadClosingAttendance(); }, []);

  const selectedPeriod = periods.find(p => p.id === filterPeriod);
  const employeesById = new Map(employees.map(employee => [employee.id, employee]));
  const matchesEmployeeStatus = (employee?: Employee) =>
    employeeStatusFilter === "todos" || employee?.status?.trim().toLowerCase() === employeeStatusFilter;
  const companyEmployees = employees.filter(employee =>
    (!companyFilter || employee.company_id === companyFilter) && matchesEmployeeStatus(employee));
  const employeesForFilter = companyEmployees.filter(employee => !selectedPeriod ||
    ((!employee.hire_date || employee.hire_date <= selectedPeriod.end_date) &&
      (!employee.termination_date || employee.termination_date >= selectedPeriod.start_date)));
  const companyEmployeeIds = new Set(companyEmployees.map(employee => employee.id));
  const filteredRows = rows.filter(row =>
    companyEmployeeIds.has(row.employee_id) &&
    (filterEmployee === "todos" || row.employee_id === filterEmployee) &&
    (!selectedPeriod || (row.start_date <= selectedPeriod.end_date && row.end_date >= selectedPeriod.start_date))
  );
  const filteredDeclarations = declarations.filter(row =>
    companyEmployeeIds.has(row.employee_id) &&
    (filterEmployee === "todos" || row.employee_id === filterEmployee) &&
    (!selectedPeriod || (row.occurrence_date >= selectedPeriod.start_date && row.occurrence_date <= selectedPeriod.end_date))
  );
  function periodLabel(period: Period) {
    const displayStart = period.end_date === "2026-01-20"
      ? "2025-12-11"
      : period.start_date;
    return `${formatDate(displayStart)} a ${formatDate(period.end_date)}`;
  }

  function formatHistoricalHours(minutesValue: number | null | undefined) {
    const minutes = Math.max(0, Math.round(Number(minutesValue ?? 0)));
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  const filteredHistoricalBaseRows = historicalBaseRows.filter(row => {
    const matchedEmployee = row.employee_id ? employeesById.get(row.employee_id) : undefined;
    // Registros sem vínculo não têm situação verificável e aparecem em Todos.
    const companyMatches = !companyFilter || !matchedEmployee || matchedEmployee.company_id === companyFilter;
    const employeeMatches = filterEmployee === "todos" || row.employee_id === filterEmployee;
    const periodMatches = !selectedPeriod ||
      (String(row.period_start ?? "") <= selectedPeriod.end_date && String(row.period_end ?? "") >= selectedPeriod.start_date);
    return companyMatches && employeeMatches && periodMatches && matchesEmployeeStatus(matchedEmployee);
  });

  const historicalCertificates = expandAttendance(filteredHistoricalBaseRows.filter(row => Number(row.certificate_minutes ?? 0) > 0),"atestado");
  const historicalDeclarations = expandAttendance(filteredHistoricalBaseRows.filter(row => Number(row.declaration_minutes ?? 0) > 0),"declaracao");

  const closingKey = (employeeId: string | null, periodId: string) => `${employeeId ?? ""}:${periodId}`;
  const closingByEmployeePeriod = new Map(closingAttendance.map(row => [closingKey(row.employee_id, row.period_id), row]));
  const historicalAttendanceKeys = new Set(filteredHistoricalBaseRows.map(row => closingKey(row.employee_id, row.period_id)));
  const periodById = new Map(periods.map(period => [period.id, period]));
  const visibleClosingAttendance = closingAttendance.flatMap(row => {
    const period = periodById.get(row.period_id);
    if (!period || !companyEmployeeIds.has(row.employee_id) ||
      (filterEmployee !== "todos" && row.employee_id !== filterEmployee) ||
      (selectedPeriod && row.period_id !== selectedPeriod.id)) return [];

    const hasAttendance = row.certificate_minutes > 0 || row.declaration_minutes > 0 ||
      historicalAttendanceKeys.has(closingKey(row.employee_id, row.period_id)) ||
      filteredRows.some(record => record.employee_id === row.employee_id &&
        record.start_date <= period.end_date && record.end_date >= period.start_date) ||
      filteredDeclarations.some(record => record.employee_id === row.employee_id &&
        record.occurrence_date >= period.start_date && record.occurrence_date <= period.end_date);
    return hasAttendance ? [{ row, period, name: employeesById.get(row.employee_id)?.full_name ?? "Funcionário" }] : [];
  }).sort((first, second) => compareNewestAttendanceFirst(first.period.start_date, second.period.start_date) ||
    first.name.localeCompare(second.name, "pt-BR"));

  function closingMinutes(row: HistoricalBaseRow, kind: "atestado" | "declaracao") {
    const adjustment = closingByEmployeePeriod.get(closingKey(row.employee_id, row.period_id));
    return kind === "atestado" ? adjustment?.certificate_minutes ?? row.certificate_minutes
      : adjustment?.declaration_minutes ?? row.declaration_minutes;
  }

  function historicalEmployeeName(row: HistoricalBaseRow) {
    return (row.employee_id ? employees.find(employee => employee.id === row.employee_id)?.full_name : null) || row.employee_name || "Funcionário não identificado";
  }



  function startEditHistorical(row: HistoricalBaseRow, kind: "atestado" | "declaracao") {
    row=historicalBaseRows.find(r=>r.id===row.id)??row;
    const details = attendanceDetails(row, kind)
      .sort((first, second) => compareNewestAttendanceFirst(first.start, second.start));
    setHistoricalEdit({
      details:details.length?details:[{id:crypto.randomUUID(),start:"",end:"",category:kind==="atestado"?row.certificate_type||"medico":row.declaration_display_reason||"Outros",cid:row.certificate_cid||"",notes:kind==="atestado"?row.certificate_display_notes||"":row.declaration_observation||"",...(kind==="declaracao"?{minutes:row.declaration_display_minutes??row.declaration_minutes}: {})}],
      row,kind,
      start:(kind==="atestado"?row.certificate_display_start:row.declaration_display_start)||"",
      end:(kind==="atestado"?row.certificate_display_end:row.declaration_display_end)||"",
      days:row.certificate_display_days==null?"":String(row.certificate_display_days),
      quantity:formatHistoricalHours(row.declaration_display_minutes??row.declaration_minutes),
      notes:row.certificate_display_notes||"",
      reason:row.declaration_display_reason||"Outros",
      certificate_type: row.certificate_type || "medico",
      certificate_cid: row.certificate_cid || "",
      declaration_observation: row.declaration_observation || "",
    });
    setMode(kind);
    setError("");
  }

  async function saveHistoricalAnnotation() {
    if (!historicalEdit) return;
    const h=historicalEdit;
    for(const d of h.details){
      if(!d.start||!d.end||d.end<d.start){setError("Preencha início e fim válidos de cada registro.");return;}
      if(h.kind==="atestado"&&(!Number.isInteger(d.days??countDays(d.start,d.end))||(d.days??countDays(d.start,d.end))<=0)){setError("Informe a quantidade de dias inteira e positiva.");return;}
      if(h.kind==="declaracao"&&(!Number.isInteger(d.minutes)||Number(d.minutes)<=0)){setError("Informe a quantidade de minutos positiva para cada declaração.");return;}
    }
    const details = h.details
      .map(detail => ({ ...detail, ...(h.kind === "atestado" ? { days: detail.days ?? countDays(detail.start, detail.end) } : {}) }))
      .sort((first, second) => compareNewestAttendanceFirst(first.start, second.start));
    setSavingHistoricalAnnotation(true);setError("");
    const payload={historical_kpi_data_id:h.row.id,updated_at:new Date().toISOString(),...(h.kind==="atestado"?{certificate_details:details,certificate_display_start:null,certificate_display_end:null,certificate_display_days:null,certificate_display_notes:null}:{declaration_details:details,declaration_display_start:null,declaration_display_end:null,declaration_display_minutes:null,declaration_display_reason:null})};
    const { error: saveError } = await (supabase as any)
      .from("historical_kpi_annotations")
      .upsert(payload, { onConflict: "historical_kpi_data_id" });
    setSavingHistoricalAnnotation(false);
    if (saveError) {
      setError("Não foi possível salvar os campos complementares do histórico. Verifique se a migração historical_kpi_annotations foi aplicada. " + saveError.message);
      return;
    }
    setHistoricalEdit(null);
    await load();
  }


  function getFilteredReportRows() {
    const reportRows = [
      ...filteredRows.map(row => ({
        "Tipo de registro": "Atestado",
        "Funcionário": row.employees?.full_name ?? "",
        "Data inicial": row.start_date,
        "Data final": row.end_date,
        "Dias": displayedDays(row),
        "Horas abonadas": "",
        "Tipo / motivo": row.certificate_type ?? "",
        "CID": row.cid ?? "",
        "Observação": row.notes ?? "",
      })),
      ...historicalCertificates.map(row => ({
        "Tipo de registro": "Atestado",
        "Funcionário": historicalEmployeeName(row),
        "Data inicial": row.certificate_display_start ?? row.period_start ?? "",
        "Data final": row.certificate_display_end ?? row.period_end ?? "",
        "Dias": row.certificate_display_days ?? "",
        "Horas abonadas": row.detail ? "" : formatHistoricalHours(closingMinutes(row, "atestado")),
        "Tipo / motivo": row.certificate_type ? (({ medico: "Médico", odontologico: "Odontológico", acompanhamento: "Acompanhamento", outro: "Outro" } as Record<string, string>)[row.certificate_type] || row.certificate_type) : "Tipo não informado",
        "CID": row.certificate_cid ?? "",
        "Observação": row.certificate_display_notes ?? "",
      })),
      ...filteredDeclarations.map(row => ({
        "Tipo de registro": "Declaração de horas",
        "Funcionário": row.employees?.full_name ?? "",
        "Data inicial": row.occurrence_date,
        "Data final": row.occurrence_date,
        "Dias": "",
        "Horas abonadas": formatHistoricalHours(Math.round(Number(row.quantity ?? 0) * 60)),
        "Tipo / motivo": "",
        "CID": "",
        "Observação": row.notes ?? "",
      })),
      ...historicalDeclarations.map(row => ({
        "Tipo de registro": "Declaração de horas",
        "Funcionário": historicalEmployeeName(row),
        "Data inicial": row.declaration_display_start ?? row.period_start ?? "",
        "Data final": row.declaration_display_end ?? row.period_end ?? "",
        "Dias": "",
        "Horas abonadas": formatHistoricalHours(row.declaration_display_minutes ?? closingMinutes(row, "declaracao")),
        "Tipo / motivo": row.declaration_display_reason??"",
        "CID": "",
        "Observação": row.declaration_observation ?? "",
      })),
    ];
    return reportRows
      .sort((first, second) => compareAttendanceDates(first["Data inicial"], second["Data inicial"]))
      .map(row => ({
        ...row,
        "Data inicial": formatDate(row["Data inicial"]),
        "Data final": formatDate(row["Data final"]),
      }));
  }

  async function exportFilteredExcel() {
    const reportRows = getFilteredReportRows();
    if (!reportRows.length) { setError("Não há registros para exportar com os filtros selecionados."); return; }
    setError("");
    try {
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "DP SUCCESS";
      workbook.subject = "Declarações e Atestados";
      workbook.title = "Declarações e Atestados";
      workbook.created = new Date();

      const columns = Object.keys(reportRows[0] ?? {}).map(key => {
        const values = reportRows.slice(0, 100).map(row => String(row[key] ?? ""));
        const width = Math.max(key.length + 4, ...values.map(value => Math.min(value.length + 2, 42)));
        return { header: key, key, width: Math.min(42, Math.max(12, width)) };
      });
      const worksheet = workbook.addWorksheet("Declarações e Atestados", {
        views: [{ state: "frozen", ySplit: 5, xSplit: 1 }],
      });
      const lastColumn = columns.length;
      worksheet.mergeCells(1, 1, 1, lastColumn);
      const titleCell = worksheet.getCell(1, 1);
      titleCell.value = "DP SUCCESS • DECLARAÇÕES E ATESTADOS";
      titleCell.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
      titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123B3A" } };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };
      worksheet.getRow(1).height = 30;

      worksheet.mergeCells(2, 1, 2, lastColumn);
      worksheet.getCell(2, 1).value = "Relatório conforme os filtros selecionados  |  Registros: " + reportRows.length + "  |  Exportado em: " + new Date().toLocaleString("pt-BR");
      worksheet.getCell(2, 1).font = { size: 11, bold: true, color: { argb: "FF123B3A" } };
      worksheet.getCell(2, 1).alignment = { vertical: "middle", wrapText: true };
      worksheet.getRow(2).height = 23;
      worksheet.addRow([]);
      worksheet.addRow([]);

      const headerRow = worksheet.addRow(columns.map(column => column.header));
      headerRow.height = 34;
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FF123B3A" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDF7F0" } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = { bottom: { style: "thin", color: { argb: "FF06CAA0" } } };
      });

      for (const source of reportRows) {
        const row = worksheet.addRow(columns.map(column => source[column.key] ?? ""));
        row.eachCell((cell, columnNumber) => {
          cell.alignment = { vertical: "middle", horizontal: columnNumber >= 3 ? "center" : "left", wrapText: true };
          if (row.number % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5FAF8" } };
        });
        columns.forEach((column, index) => {
          const cell = row.getCell(index + 1);
          if (["Dias", "Quantidade"].includes(column.key) && typeof source[column.key] === "number") cell.numFmt = "0";
        });
      }

      columns.forEach((column, index) => { worksheet.getColumn(index + 1).width = column.width; });
      worksheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, worksheet.rowCount), column: lastColumn } };
      worksheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
      worksheet.properties.defaultRowHeight = 20;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "dp-success-declaracoes-e-atestados-filtrados.xlsx";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      console.error("Erro ao exportar Excel filtrado:", error);
      setError("Não foi possível gerar o Excel. Tente novamente.");
    }
  }

  function exportFilteredPdf() {
    const reportRows = getFilteredReportRows();
    if (!reportRows.length) { setError("Não há registros para exportar com os filtros selecionados."); return; }
    setError("");
    const columns = Object.keys(reportRows[0] ?? {});
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const columnWeight = (key: string) => {
      const name = key.toLowerCase();
      if (/funcion.rio|employee/.test(name)) return 2.15;
      if (/observa|justific|descri|motivo/.test(name)) return 1.8;
      if (/data|in.cio|fim/.test(name)) return 0.9;
      if (/quantidade|dias|horas/.test(name)) return 0.85;
      return 1;
    };
    const totalWeight = columns.reduce((sum, key) => sum + columnWeight(key), 0);
    const colgroup = '<colgroup>' + columns.map(key => '<col style="width:' + (columnWeight(key) / totalWeight * 100).toFixed(3) + '%">').join("") + '</colgroup>';
    const tableHead = columns.map(column => "<th>" + escapeHtml(column) + "</th>").join("");
    const tableRows = reportRows.map(row => "<tr>" + columns.map(column => {
      const value = row[column];
      if (value == null || value === "") return "<td>—</td>";
      if (typeof value === "number" && ["Dias", "Quantidade"].includes(column)) return "<td>" + escapeHtml(Number.isInteger(value) ? String(value) : String(value)) + "</td>";
      return "<td>" + escapeHtml(value) + "</td>";
    }).join("") + "</tr>").join("");
    const printWindow = window.open("", "_blank");
    if (!printWindow) { setError("O navegador bloqueou a janela do PDF. Permita pop-ups para este site e tente novamente."); return; }
    printWindow.document.write("<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>Declarações e Atestados</title><style>" +
      "*{box-sizing:border-box}html,body{width:100%;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#183735;font-size:7px;print-color-adjust:exact;-webkit-print-color-adjust:exact}" +
      "@page{size:A4 landscape;margin:7mm}.brand{background:#123b3a;color:#fff;padding:10px 14px;break-inside:avoid}.eyebrow{font-size:7px;letter-spacing:1.2px;color:#9debd8;font-weight:bold}h1{font-size:16px;margin:4px 0}.subtitle{font-size:8px;color:#d9f4ed;overflow-wrap:anywhere}.meta{display:flex;justify-content:space-between;gap:8px;background:#f0faf7;border:1px solid #d8eee7;color:#365b56;font-size:7px;padding:6px 8px;margin-top:5px}table{width:100%;max-width:100%;margin-top:8px;table-layout:fixed;border-collapse:collapse}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th{background:#dff7f0;color:#123b3a;text-align:left;text-transform:uppercase;font-size:6.5px}th,td{border-bottom:1px solid #e1ece8;padding:3px 3px;line-height:1.2;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;white-space:normal}tbody tr:nth-child(even){background:#f6faf9}.footer{margin-top:5px;padding-top:3px;border-top:1px solid #d8e8e3;color:#64817b}@media print{html,body{width:100%;height:auto}table{width:100%}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>" +
      "<header class='brand'><div class='eyebrow'>DP SUCCESS · GESTÃO DE PESSOAS</div><h1>Declarações e Atestados</h1><div class='subtitle'>Relatório conforme os filtros selecionados</div></header>" +
      "<div class='meta'><strong>Registros: " + reportRows.length + "</strong><span>Gerado em " + new Date().toLocaleString("pt-BR") + "</span></div><table>" + colgroup + "<thead><tr>" + tableHead + "</tr></thead><tbody>" + tableRows + "</tbody></table>" +
      "<div class='footer'>DP SUCCESS · Relatório gerencial · Documento para conferência interna</div></body></html>");
    printWindow.document.close();
    window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 700);
  }

  function displayedDays(row: Certificate) {
    if (!selectedPeriod) return row.days;
    const overlapStart = row.start_date > selectedPeriod.start_date ? row.start_date : selectedPeriod.start_date;
    const overlapEnd = row.end_date < selectedPeriod.end_date ? row.end_date : selectedPeriod.end_date;
    return overlapEnd < overlapStart ? 0 : countDays(overlapStart, overlapEnd);
  }

  function startNew() {
    setMode("atestado");
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setOpen(true);
  }

  async function startEdit(row: Certificate) {
    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      start_date: row.start_date,
      end_date: row.end_date,
      days: String(row.days ?? ""),
      certificate_type: row.certificate_type || "medico",
      cid: row.cid || "",
      notes: row.notes || "",
    });
    setError("");
    setOpen(true);
  }

  function startEditDeclaration(row: Declaration) {
    const parts = String(row.notes ?? "").split(" — ");
    const firstPart = parts[0] ?? "";
    const reason = declarationReasons.includes(firstPart) ? firstPart : "Outros";
    const totalMinutes = Math.round(Number(row.quantity || 0) * 60);
    setEditingDeclaration(row);
    setMode("declaracao");
    setDeclarationForm({ employee_id: row.employee_id, occurrence_date: row.occurrence_date, quantity: String(Math.floor(totalMinutes / 60)).padStart(2, "0") + ":" + String(totalMinutes % 60).padStart(2, "0"), reason, notes: parts.slice(1).join(" — ") });
    setError("");
    setOpen(true);
  }

  async function removeDeclaration(row: Declaration) {
    if (!window.confirm("Excluir a declaração de " + (row.employees?.full_name ?? "funcionário") + "?")) return;
    setError("");
    const { error } = await supabase.from("occurrences").delete().eq("id", row.id);
    if (error) setError(error.message); else await load();
  }
  async function save() {
    setError("");
    if (!selectedEditingRecord) {
      const launchDate = referenceDate;
      const endDate = mode === "atestado" ? form.end_date : "";
      if (openPeriod && ((launchDate && (launchDate < openPeriod.start_date || launchDate > openPeriod.end_date)) ||
        (endDate && (endDate < openPeriod.start_date || endDate > openPeriod.end_date)))) {
        setError("Informe uma data dentro da competência em aberto.");
        return;
      }
      const employeeId = mode === "declaracao" ? declarationForm.employee_id : form.employee_id;
      if (!openPeriod || (employeeId && !employeesForDate.some(employee => employee.id === employeeId))) {
        setError(openPeriod ? "Selecione um funcionário ativo na competência em aberto." : "Nenhuma competência de ponto em aberto.");
        return;
      }
    }
    if (mode === "declaracao") {
      const [h, m] = declarationForm.quantity.split(":").map(Number);
      const minutes = (h || 0) * 60 + (m || 0);
      if (!declarationForm.employee_id || !declarationForm.occurrence_date || minutes <= 0) { setError("Informe funcionário, data e horas abonadas."); return; }
      const { data: type } = await supabase.from("occurrence_types").select("id").eq("code", "declaracao_horas").single();
      if (!type?.id) { setError("Tipo de declaração não encontrado."); return; }
      const { data: periods } = await supabase.from("time_periods").select("id,start_date,end_date");
      const period = !editingDeclaration ? openPeriod : (periods ?? []).find((p: any) => declarationForm.occurrence_date >= p.start_date && declarationForm.occurrence_date <= p.end_date);
      const notes = declarationForm.reason + (declarationForm.notes.trim() ? " — " + declarationForm.notes.trim() : "");
      setSaving(true);
      const result = editingDeclaration
        ? await supabase.from("occurrences").update({ employee_id: declarationForm.employee_id, occurrence_date: declarationForm.occurrence_date, quantity: minutes / 60, unit: "horas", period_id: period?.id ?? null, notes }).eq("id", editingDeclaration.id)
        : await supabase.from("occurrences").insert({ employee_id: declarationForm.employee_id, occurrence_type_id: type.id, occurrence_date: declarationForm.occurrence_date, period_id: period?.id ?? null, quantity: minutes / 60, unit: "horas", notes });
      setSaving(false);
      if (result.error) { setError(result.error.message); return; }
      setEditingDeclaration(null);
      setDeclarationForm({ employee_id: "", occurrence_date: "", quantity: "", reason: "Acompanhante", notes: "" });
      setOpen(false);
      await load(); return;
    }
    if (!form.employee_id || !form.start_date || !form.end_date) {
      setError("Informe funcionário, início e fim do atestado.");
      return;
    }
    if (form.end_date < form.start_date) {
      setError("A data final não pode ser anterior à data inicial.");
      return;
    }
    if (form.days.trim() && (!Number.isInteger(Number(form.days)) || Number(form.days) <= 0)) {
      setError("A quantidade de dias deve ser um número inteiro positivo.");
      return;
    }
    setSaving(true);
    const payload = {
      employee_id: form.employee_id,
      start_date: form.start_date,
      end_date: form.end_date,
      days: form.days.trim() ? Number(form.days) : countDays(form.start_date, form.end_date),
      certificate_type: form.certificate_type,
      notes: form.notes.trim() || null,
      cid: form.cid.trim() || null,
    };
    const result = editing
      ? await supabase.from("medical_certificates").update(payload).eq("id", editing.id)
      : await supabase.from("medical_certificates").insert(payload);
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  async function remove(row: Certificate) {
    if (!window.confirm(`Excluir o atestado de ${row.employees?.full_name ?? "funcionário"}?`)) return;
    setError("");
    const { error } = await supabase.from("medical_certificates").delete().eq("id", row.id);
    if (error) setError(error.message);
    else await load();
  }

  return <div className="dp-screen min-h-screen bg-background">
    <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[1500px] items-center justify-between">
      <a href="/" className="flex gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a>
      <ScreenBrand name="Declarações e Atestados" />
    </div></header>
    <main className="dp-screen-content mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="relative isolate mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 flex items-end justify-between gap-4 [&_p]:!text-white/75 [&_h1]:!text-white"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Ponto</p><h1 className="text-2xl font-semibold tracking-tight sm:text-[30px]">Declarações e Atestados</h1><p className="text-sm text-muted-foreground">Registre atestados e declarações com as horas efetivamente abonadas.</p></div>
        <div className="flex gap-2"><button data-role-sensitive onClick={() => { startNew(); setMode("atestado"); }} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="mr-2 inline h-4 w-4" />Novo atestado</button><button data-role-sensitive onClick={() => { setMode("declaracao"); setEditing(null); setEditingDeclaration(null); setError(""); setDeclarationForm({ employee_id: "", occurrence_date: "", quantity: "", reason: "Acompanhante", notes: "" }); setOpen(true); }} className="rounded-lg border px-4 py-2.5 text-sm"><Plus className="mr-2 inline h-4 w-4" />Nova declaração</button></div>
      </div>
      <div className="mb-4 flex justify-end"><DocumentAuditImport employees={employees} mode="attendance" /></div>
        <Card className="mt-6 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium"><span>Filtros</span><span className="text-xs font-normal text-muted-foreground">Aplicados às duas listas</span></div>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-sm"><span className="text-muted-foreground">Empresa</span><CompanyFilter value={companyFilter} onChange={value => { setCompanyFilter(value); setFilterEmployee("todos"); }} /></label>
          <label className="grid gap-1 text-sm"><span className="text-muted-foreground">Competência</span><select value={filterPeriod} onChange={e => { setFilterPeriod(e.target.value); setFilterEmployee("todos"); }} className="rounded-lg border bg-background px-3 py-2"><option value="todos">Todas as competências</option>{periods.map(p => <option key={p.id} value={p.id}>{periodLabel(p)}</option>)}</select></label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Situação do funcionário</span>
            <select value={employeeStatusFilter}
              onChange={event => {
                setEmployeeStatusFilter(event.target.value as typeof employeeStatusFilter);
                setFilterEmployee("todos");
              }}
              className="rounded-lg border bg-background px-3 py-2">
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm"><span className="text-muted-foreground">Funcionário</span><select value={filterEmployee} onChange={e => setFilterEmployee(e.target.value)} className="rounded-lg border bg-background px-3 py-2"><option value="todos">Todos os funcionários</option>{employeesForFilter.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
        </div>
      </Card>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={exportFilteredExcel} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <FileSpreadsheet className="h-4 w-4" /> Exportar Excel
        </button>
        <button type="button" onClick={exportFilteredPdf} className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted">
          <FileText className="h-4 w-4" /> Exportar PDF
        </button>
      </div>
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {visibleClosingAttendance.length > 0 && (
        <Card className="mt-6 overflow-hidden">
          <div className="border-b p-4">
            <h2 className="font-semibold">Totais ajustados no Fechamento de Ponto</h2>
            <p className="text-xs text-muted-foreground">Horas apuradas por competência. As datas dos documentos estão nas listas abaixo.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-muted/70 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-5 py-3">Funcionário</th>
                  <th scope="col" className="px-5 py-3">Competência</th>
                  <th scope="col" className="px-5 py-3">Atestados</th>
                  <th scope="col" className="px-5 py-3">Declarações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleClosingAttendance.map(({ row, period, name }) => (
                  <tr key={closingKey(row.employee_id, row.period_id)}>
                    <td className="px-5 py-3 font-medium">{name}</td>
                    <td className="whitespace-nowrap px-5 py-3">{periodLabel(period)}</td>
                    <td className="px-5 py-3 tabular-nums">{formatHistoricalHours(row.certificate_minutes)}</td>
                    <td className="px-5 py-3 tabular-nums">{formatHistoricalHours(row.declaration_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Card className="mt-6 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Atestados</h2><p className="text-xs text-muted-foreground">{filteredRows.length + historicalCertificates.length} registro(s), incluindo histórico consolidado</p></div><button type="button" onClick={() => setShowCertificates(v => !v)} className="rounded-md border p-2 hover:bg-muted" title={showCertificates ? "Ocultar atestados" : "Mostrar atestados"} aria-label={showCertificates ? "Ocultar atestados" : "Mostrar atestados"}>{showCertificates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>
        {showCertificates && <div className="max-h-[calc(100vh-300px)] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr>
          <th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Início</th><th className="px-5 py-3">Fim</th><th className="px-5 py-3">Dias</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">CID</th><th data-role-sensitive className="px-5 py-3 text-right">Ações</th>
        </tr></thead><tbody className="divide-y">
          {filteredRows.length === 0 && historicalCertificates.length === 0 && <tr><td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">Nenhum atestado encontrado para os filtros selecionados.</td></tr>}
          {[
            ...filteredRows.map(row => ({ historical: false as const, row, date: row.start_date })),
            ...historicalCertificates.map(row => ({ historical: true as const, row, date: row.certificate_display_start || row.period_start })),
          ].sort((first, second) => compareNewestAttendanceFirst(first.date, second.date)).map(item => {
            if (item.historical) {
              const r = item.row;
              return <tr key={"base-cert-" + r.detailKey} className="bg-muted/20"><td className="px-5 py-4 font-medium">{historicalEmployeeName(r)}</td><td className="whitespace-nowrap px-5 py-4">{formatDate(r.certificate_display_start || r.period_start || "")}</td><td className="whitespace-nowrap px-5 py-4">{formatDate(r.certificate_display_end || r.period_end || "")}</td><td className="px-5 py-4">{r.certificate_display_days??"—"}</td><td className="px-5 py-4">{(r.certificate_type ? ({ medico: "Médico", odontologico: "Odontológico", acompanhamento: "Acompanhamento", outro: "Outro" } as Record<string, string>)[r.certificate_type] || r.certificate_type : "Tipo não informado") + (r.detail?"":" · " + formatHistoricalHours(closingMinutes(r, "atestado")) + " h")}</td><td className="px-5 py-4">{r.certificate_cid || "—"}</td><td data-role-sensitive className="px-5 py-4 text-right"><button data-role-sensitive onClick={() => startEditHistorical(r, "atestado")} className="rounded-md border p-2" title="Editar tipo e CID do histórico"><Pencil className="h-4 w-4" /></button></td></tr>;
            }
            const r = item.row;
            return <tr key={r.id} className="transition-colors hover:bg-muted/25"><td className="px-5 py-4 font-medium">{r.employees?.full_name ?? "—"}</td><td className="px-5 py-4">{formatDate(r.start_date)}</td><td className="px-5 py-4">{formatDate(r.end_date)}</td><td className="px-5 py-4">{displayedDays(r)}</td><td className="px-5 py-4">{r.certificate_type}</td><td className="px-5 py-4">{r.cid ?? "—"}</td><td data-role-sensitive className="px-5 py-4 text-right"><button data-role-sensitive onClick={() => void startEdit(r)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button data-role-sensitive onClick={() => void remove(r)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td></tr>;
          })}
        </tbody></table></div>}
      </Card>
      <Card className="mt-6 overflow-hidden"><div className="flex items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Declarações</h2><p className="text-xs text-muted-foreground">{filteredDeclarations.length + historicalDeclarations.length} registro(s), incluindo histórico consolidado</p></div><button type="button" onClick={() => setShowDeclarations(v => !v)} className="rounded-md border p-2 hover:bg-muted" title={showDeclarations ? "Ocultar declarações" : "Mostrar declarações"} aria-label={showDeclarations ? "Ocultar declarações" : "Mostrar declarações"}>{showDeclarations ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button></div>{showDeclarations && <div className="max-h-[calc(100vh-300px)] overflow-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted/95 text-xs text-muted-foreground backdrop-blur"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Horas abonadas</th><th className="px-5 py-3">Observação</th><th data-role-sensitive className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">{filteredDeclarations.length === 0 && historicalDeclarations.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Nenhuma declaração encontrada para os filtros selecionados.</td></tr>}{[
            ...filteredDeclarations.map(row => ({ historical: false as const, row, date: row.occurrence_date })),
            ...historicalDeclarations.map(row => ({ historical: true as const, row, date: row.declaration_display_start || row.period_start })),
          ].sort((first, second) => compareNewestAttendanceFirst(first.date, second.date)).map(item => {
            if (item.historical) {
              const r = item.row;
              return <tr key={"base-decl-" + r.detailKey} className="bg-muted/20"><td className="px-5 py-4 font-medium">{historicalEmployeeName(r)}</td><td className="whitespace-nowrap px-5 py-4">{formatDate(r.declaration_display_start || r.period_start || "")} a {formatDate(r.declaration_display_end || r.period_end || "")}</td><td className="px-5 py-4">{formatHistoricalHours(r.declaration_display_minutes ?? closingMinutes(r, "declaracao"))}</td><td className="px-5 py-4">{[r.declaration_display_reason,r.declaration_observation].filter(Boolean).join(" — ")||"—"}</td><td data-role-sensitive className="px-5 py-4 text-right"><button data-role-sensitive onClick={() => startEditHistorical(r, "declaracao")} className="rounded-md border p-2" title="Editar observação do histórico"><Pencil className="h-4 w-4" /></button></td></tr>;
            }
            const d = item.row;
            return <tr key={d.id} className="transition-colors hover:bg-muted/25"><td className="px-5 py-4 font-medium">{d.employees?.full_name ?? "—"}</td><td className="px-5 py-4">{formatDate(d.occurrence_date)}</td><td className="px-5 py-4">{String(Math.floor(Number(d.quantity) || 0)).padStart(2,"0")}:{String(Math.round(((Number(d.quantity)||0)%1)*60)).padStart(2,"0")}</td><td className="px-5 py-4">{d.notes ?? "—"}</td><td data-role-sensitive className="px-5 py-4 text-right"><button data-role-sensitive onClick={() => startEditDeclaration(d)} className="mr-2 rounded-md border p-2" title="Editar"><Pencil className="h-4 w-4" /></button><button data-role-sensitive onClick={() => void removeDeclaration(d)} className="rounded-md border p-2 text-destructive" title="Excluir"><Trash2 className="h-4 w-4" /></button></td></tr>;
          })}</tbody></table></div>}</Card>
    </main>
    {historicalEdit && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto p-6">
      <h2 className="text-xl font-bold">{historicalEdit.kind==="atestado"?"Editar atestado":"Editar declaração de horas"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Dados informativos para o histórico e dossiê. Os cálculos originais permanecem intactos.</p>
      <div className="mt-4 space-y-4">
        <label className="grid gap-1 text-sm">Funcionário<input readOnly className="rounded-lg border bg-muted px-3 py-2" value={historicalEmployeeName(historicalEdit.row)}/></label>
        <div className="rounded-md border bg-muted/30 p-3 text-sm">Competência original: {formatDate(historicalEdit.row.period_start||"")} a {formatDate(historicalEdit.row.period_end||"")}<br/>Total histórico: {formatHistoricalHours(historicalEdit.kind==="atestado"?historicalEdit.row.certificate_minutes:historicalEdit.row.declaration_minutes)} h · {historicalEdit.details.length} registro(s)</div>
        {historicalEdit.details.map((d,i)=>{
          const patch=(value:Partial<AttendanceDetail>)=>setHistoricalEdit(old=>old?{...old,details:old.details.map(x=>x.id===d.id?{...x,...value}:x)}:old);
          return <div key={d.id} className="rounded-lg border p-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{historicalEdit.kind==="atestado"?"Atestado":"Declaração"} {i+1}</h3><button type="button" title="Excluir detalhe" onClick={()=>setHistoricalEdit(old=>old?{...old,details:old.details.filter(x=>x.id!==d.id)}:old)} className="rounded-md border p-2 text-destructive"><Trash2 className="h-4 w-4"/></button></div><div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Início<input type="date" value={d.start} onChange={e=>patch({start:e.target.value})} className="rounded-lg border bg-background px-3 py-2"/></label>
          <label className="grid gap-1 text-sm">Fim<input type="date" value={d.end} onChange={e=>patch({end:e.target.value})} className="rounded-lg border bg-background px-3 py-2"/></label>
          {historicalEdit.kind==="atestado"?<>
            <label className="grid gap-1 text-sm">Quantidade de dias<input type="number" min="1" step="1" value={d.days??""} placeholder={String(countDays(d.start,d.end)||"")} onChange={e=>patch({days:e.target.value?Number(e.target.value):undefined})} className="rounded-lg border bg-background px-3 py-2"/></label>
            <label className="grid gap-1 text-sm">Categoria<select value={d.category} onChange={e=>patch({category:e.target.value})} className="rounded-lg border bg-background px-3 py-2"><option value="medico">Médico</option><option value="odontologico">Odontológico</option><option value="acompanhamento">Acompanhamento</option><option value="outro">Outro</option></select></label>
            <label className="grid gap-1 text-sm sm:col-span-2">CID (opcional)<input value={d.cid||""} onChange={e=>patch({cid:e.target.value})} className="rounded-lg border bg-background px-3 py-2"/></label>
          </>:<>
            <div className="grid grid-cols-2 gap-4"><label className="grid gap-1 text-sm">Horas<input type="number" min="0" step="1" value={Math.floor((d.minutes??0)/60)} onChange={e=>patch({minutes:Number(e.target.value)*60+(d.minutes??0)%60})} className="min-w-0 rounded-lg border bg-background px-3 py-2"/></label><label className="grid gap-1 text-sm">Minutos<input type="number" min="0" max="59" step="1" value={(d.minutes??0)%60} onChange={e=>patch({minutes:Math.floor((d.minutes??0)/60)*60+Math.min(59,Math.max(0,Number(e.target.value)))})} className="min-w-0 rounded-lg border bg-background px-3 py-2"/></label></div>
            <label className="grid gap-1 text-sm">Categoria<select value={d.category} onChange={e=>patch({category:e.target.value})} className="rounded-lg border bg-background px-3 py-2">{declarationReasons.map(r=><option key={r}>{r}</option>)}</select></label>
          </>}
          <label className="grid gap-1 text-sm sm:col-span-2">Observações<textarea value={d.notes} onChange={e=>patch({notes:e.target.value})} className="rounded-lg border bg-background px-3 py-2"/></label>
          </div></div>;
        })}
        <button type="button" onClick={()=>setHistoricalEdit(old=>old?{...old,details:[...old.details,{id:crypto.randomUUID(),start:"",end:"",category:old.kind==="atestado"?"medico":"Outros",notes:"",cid:""}]}:old)} className="flex w-full items-center justify-center gap-2 rounded-md border px-3 py-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4"/>Adicionar {historicalEdit.kind==="atestado"?"atestado":"declaração"}</button>
        {!historicalEdit.details.length&&<p className="text-sm text-muted-foreground">Sem detalhes: o registro original voltará a aparecer consolidado.</p>}
        {historicalEdit.kind==="declaracao"&&<p className="text-sm text-muted-foreground">Total detalhado: {formatHistoricalHours(historicalEdit.details.reduce((s,d)=>s+(d.minutes??0),0))} h. O total de cálculo original não muda.</p>}
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button onClick={() => setHistoricalEdit(null)} className="rounded-lg border px-4 py-2">Cancelar</button><button data-role-sensitive disabled={savingHistoricalAnnotation} onClick={() => void saveHistoricalAnnotation()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{savingHistoricalAnnotation ? "Salvando..." : "Salvar alterações"}</button></div>
    </Card></div>}
    {open && mode === "atestado" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto p-6">
      <h2 className="text-xl font-bold">{editing ? "Editar atestado" : "Novo atestado"}</h2>
      <div className="mt-4 grid gap-x-6 gap-y-5 md:grid-cols-2">
        <label className="grid gap-1 text-sm md:col-span-2">Funcionário<select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="rounded-lg border px-3 py-2"><option value="">{!selectedEditingRecord && !openPeriod ? "Nenhuma competência em aberto" : "Funcionário"}</option>{employeesForDate.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
        <label className="grid gap-1 text-sm ">Início<input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
        <label className="grid gap-1 text-sm ">Fim<input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
        <label className="grid gap-1 text-sm ">Quantidade de dias<input type="number" min="1" step="1" placeholder={`Quantidade de dias (automático: ${countDays(form.start_date, form.end_date) || "—"})`} value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
        <label className="grid gap-1 text-sm ">Categoria<select value={form.certificate_type} onChange={e => setForm({ ...form, certificate_type: e.target.value })} className="rounded-lg border px-3 py-2"><option value="medico">Médico</option><option value="odontologico">Odontológico</option><option value="acompanhamento">Acompanhamento</option><option value="outro">Outro</option></select></label>
        <label className="grid gap-1 text-sm md:col-span-2">CID (opcional)<input placeholder="CID" value={form.cid} onChange={e => setForm({ ...form, cid: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
        <label className="grid gap-1 text-sm md:col-span-2">Observações<textarea placeholder="Observações" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
      </div>
      <div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button data-role-sensitive disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{saving ? "Salvando..." : "Salvar"}</button></div>
    </Card></div>}
    {open && mode === "declaracao" && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="max-h-[90vh] w-full max-w-xl overflow-y-auto p-6">
      <h2 className="text-xl font-bold">{editingDeclaration ? "Editar declaração de horas" : "Nova declaração de horas"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Informe somente as horas que serão efetivamente abonadas.</p>
      <div className="mt-4 grid gap-x-6 gap-y-5 md:grid-cols-2">
        <label className="grid gap-1 text-sm md:col-span-2">Funcionário<select value={declarationForm.employee_id} onChange={e => setDeclarationForm({ ...declarationForm, employee_id: e.target.value })} className="rounded-lg border px-3 py-2"><option value="">{!selectedEditingRecord && !openPeriod ? "Nenhuma competência em aberto" : "Funcionário"}</option>{employeesForDate.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
        <label className="grid gap-1 text-sm ">Data da declaração<input type="date" value={declarationForm.occurrence_date} onChange={e => setDeclarationForm({ ...declarationForm, occurrence_date: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
        <label className="grid gap-1 text-sm ">Horas abonadas<input type="time" value={declarationForm.quantity} onChange={e => setDeclarationForm({ ...declarationForm, quantity: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
        <label className="grid gap-1 text-sm md:col-span-2">Categoria<select value={declarationForm.reason} onChange={e => setDeclarationForm({ ...declarationForm, reason: e.target.value })} className="rounded-lg border px-3 py-2">{declarationReasons.map(reason => <option key={reason} value={reason}>{reason}</option>)}</select></label>
        <label className="grid gap-1 text-sm md:col-span-2">Observações<textarea placeholder="Observações" value={declarationForm.notes} onChange={e => setDeclarationForm({ ...declarationForm, notes: e.target.value })} className="rounded-lg border px-3 py-2" /></label>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button data-role-sensitive disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{saving ? "Salvando..." : editingDeclaration ? "Salvar alterações" : "Salvar declaração"}</button></div>
    </Card></div>}
  </div>;
}
