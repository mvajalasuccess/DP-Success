import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, Building2, ChevronDown, Clock3, FileText, Gauge, LogOut, Users, WalletCards, Save, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Employees } from "@/screens/funcionarios";
import { Positions } from "@/screens/cargos";
import { Departments } from "@/screens/departamentos";
import { Schedules } from "@/screens/jornadas-escalas";
import { PointClosing } from "@/screens/fechamento-ponto";
import { Launches } from "@/screens/lancamentos";
import { BankHours } from "@/screens/banco-horas";
import { Atestados } from "@/screens/atestados";
import { Ocorrencias } from "@/screens/ocorrencias";
import { Comparativos } from "@/screens/comparativos";
import { Kpis } from "@/screens/kpis";
import { Relatorios } from "@/screens/relatorios";
import { Parametros } from "@/screens/parametros";
import { Tarefas } from "@/screens/tarefas";
import { ImportacaoHistorico } from "@/screens/importacao-historico";
import { ImportarCartaoPonto } from "@/screens/importar-cartao-ponto";
import { countWorkingWeekdays } from "@/lib/feriados";
import { balancesByEmployee } from "@/lib/dp-model";

export const Route = createFileRoute("/")({ component: Dashboard });

type ScreenKey = "dashboard" | "funcionarios" | "cargos" | "departamentos" | "jornadas-escalas" | "fechamento-ponto" | "lancamentos" | "banco-horas" | "atestados" | "ocorrencias" | "comparativos" | "kpis" | "relatorios" | "parametros" | "tarefas" | "importacao-historico" | "importar-cartao-ponto";

const screenComponents: Record<string, ComponentType> = {
  funcionarios: Employees, cargos: Positions, departamentos: Departments, "jornadas-escalas": Schedules,
  "fechamento-ponto": PointClosing, lancamentos: Launches, "banco-horas": BankHours,
  atestados: Atestados, ocorrencias: Ocorrencias, comparativos: Comparativos, kpis: Kpis,
  relatorios: Relatorios, parametros: Parametros, tarefas: Tarefas, "importacao-historico": ImportacaoHistorico, "importar-cartao-ponto": ImportarCartaoPonto,
};

const companyNav: Array<[string, ScreenKey]> = [
  ["Cargos", "cargos"], ["Departamentos", "departamentos"], ["Jornadas / Escalas", "jornadas-escalas"],
];

const closingNav: Array<[string, ScreenKey]> = [
  ["Fechamento", "fechamento-ponto"],
  ["Lançamentos", "lancamentos"],
  ["Declarações e Atestados", "atestados"],
  ["Faltas", "ocorrencias"],
  ["Importar Cartão Ponto", "importar-cartao-ponto"],
];

const mainNav: Array<[string, ScreenKey]> = [
  ["Tarefas e Agenda", "tarefas"],
  ["Banco de Horas", "banco-horas"],
  ["Relatórios", "relatorios"], ["Comparativos", "comparativos"], ["KPIs", "kpis"], ["Configurações", "parametros"], ["Importar histórico", "importacao-historico"],
];

function fmt(minutes: number) {
  const sign = minutes < 0 ? "-" : "+";
  const value = Math.abs(Math.round(minutes));
  return sign + Math.floor(value / 60) + "h " + String(value % 60).padStart(2, "0") + "m";
}

function Dashboard() {
  const [screen, setScreen] = useState<ScreenKey>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(true);
  const [closingOpen, setClosingOpen] = useState(true);
  const [isConsulta, setIsConsulta] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) return;
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();
      if (active) setIsConsulta(profile?.role === "consulta");
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("role-consulta", isConsulta);
    return () => document.body.classList.remove("role-consulta");
  }, [isConsulta]);

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const target = (event as CustomEvent<ScreenKey>).detail;
      if (target) setScreen(target);
    };
    window.addEventListener("dp-success:navigate", onNavigate);
    return () => window.removeEventListener("dp-success:navigate", onNavigate);
  }, []);

  const Screen = screen === "dashboard" ? null : screenComponents[screen];

  return (
    <AppShell
      screen={screen}
      collapsed={sidebarCollapsed}
      companyOpen={companyOpen}
      closingOpen={closingOpen}
      onNavigate={setScreen}
      onToggleCollapsed={() => setSidebarCollapsed(value => !value)}
      onToggleCompany={() => setCompanyOpen(value => !value)}
      onToggleClosing={() => setClosingOpen(value => !value)}
    >
      {Screen ? <Screen /> : <DashboardHome />}
    </AppShell>
  );
}

function AppShell({
  screen, collapsed, companyOpen, closingOpen, onNavigate, onToggleCollapsed, onToggleCompany, onToggleClosing, children,
}: {
  screen: ScreenKey;
  collapsed: boolean;
  companyOpen: boolean;
  closingOpen: boolean;
  onNavigate: (screen: ScreenKey) => void;
  onToggleCollapsed: () => void;
  onToggleCompany: () => void;
  onToggleClosing: () => void;
  children: ReactNode;
}) {
  const go = (key: ScreenKey) => onNavigate(key);
  const buttonClass = (key: ScreenKey) =>
    `flex w-full items-center rounded-xl py-2.5 text-left text-[13px] transition-colors ${screen === key ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"} ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`;

  return (
    <div className="min-h-screen bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r border-sidebar-border/60 bg-sidebar transition-[width] duration-200 lg:flex lg:flex-col ${collapsed ? "w-16" : "w-64"}`}>
        <div className={`flex h-[72px] shrink-0 items-center border-b border-sidebar-border/60 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          {!collapsed && <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"><Clock3 className="h-5 w-5" /></div><div><div className="font-display text-[15px] font-semibold tracking-tight">DP Success</div><div className="text-[9px] uppercase tracking-[0.22em] text-sidebar-foreground/45">RH · DP · Gestão</div></div></div>}
          {collapsed && <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Clock3 className="h-5 w-5" /></div>}
          <button type="button" onClick={onToggleCollapsed} className="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground" title={collapsed ? "Expandir menu" : "Minimizar menu"} aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}><ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} /></button>
        </div>

        <nav className={`flex-1 overflow-y-auto p-3 ${collapsed ? "space-y-2" : "space-y-1"}`}>
          <button type="button" onClick={() => go("dashboard")} className={buttonClass("dashboard")} title={collapsed ? "Dashboard" : undefined}>
            <Gauge className="h-4 w-4 shrink-0" />{!collapsed && <span>Dashboard</span>}
          </button>

          <button type="button" onClick={() => go("funcionarios")} className={buttonClass("funcionarios")} title={collapsed ? "Funcionários" : undefined}>
            <Users className="h-4 w-4 shrink-0" />{!collapsed && <span>Funcionários</span>}
          </button>

          {!collapsed && <div className="pt-2">
            <button type="button" onClick={onToggleCompany} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
              <span className="flex items-center gap-2"><Building2 className="h-4 w-4" />Empresas</span><ChevronDown className={`h-4 w-4 transition-transform ${companyOpen ? "rotate-180" : ""}`} />
            </button>
            {companyOpen && <div className="ml-3 mt-1 space-y-1 border-l pl-3">{companyNav.map(([label, key]) => <button key={key} type="button" onClick={() => go(key)} className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${screen === key ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"}`}>{label}</button>)}</div>}
          </div>}

          {!collapsed && <div className="pt-2">
            <button type="button" onClick={onToggleClosing} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4" />Fechamento de Ponto</span><ChevronDown className={`h-4 w-4 transition-transform ${closingOpen ? "rotate-180" : ""}`} />
            </button>
            {closingOpen && <div className="ml-3 mt-1 space-y-1 border-l pl-3">{closingNav.map(([label, key]) => <button key={key} type="button" onClick={() => go(key)} className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${screen === key ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent"}`}>{label}</button>)}</div>}
          </div>}

          {!collapsed && <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">Gestão</p>}
          {mainNav.filter(([_, key]) => ["tarefas", "banco-horas", "relatorios", "comparativos", "kpis"].includes(key)).map(([label, key]) => <button key={key} type="button" onClick={() => go(key)} className={buttonClass(key)} title={collapsed ? label : undefined}>
            {key === "banco-horas" ? <WalletCards className="h-4 w-4 shrink-0" /> : key === "comparativos" ? <Users className="h-4 w-4 shrink-0" /> : key === "kpis" ? <Gauge className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
            {!collapsed && <span>{label}</span>}
          </button>)}
          {!collapsed && <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/45">Administração</p>}
          {mainNav.filter(([_, key]) => ["parametros", "importacao-historico"].includes(key)).map(([label, key]) => <button key={key} type="button" onClick={() => go(key)} className={buttonClass(key)} title={collapsed ? label : undefined}>
            {key === "parametros" ? <Building2 className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
            {!collapsed && <span>{label}</span>}
          </button>)}
        </nav>
      </aside>

      <main className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-16" : "lg:pl-64"}`}>
        {children}
      </main>
    </div>
  );
}

function DashboardHome() {
  const [metrics, setMetrics] = useState({ employees: 0, overtime: 0, absenceDays: 0, certificates: 0, absenteeism: 0, turnover: 0, admissions: 0, terminations: 0, bankBalance: 0, period: "Nenhuma competência" });
  const [departments, setDepartments] = useState<Array<{ name: string; employees: number; minutes: number }>>([]);
  const [positiveBalances, setPositiveBalances] = useState<Array<{ name: string; minutes: number }>>([]);
  const [absencePeople, setAbsencePeople] = useState<string[]>([]);
  const [certificatePeople, setCertificatePeople] = useState<string[]>([]);
  const [competenceNote, setCompetenceNote] = useState("");
  const [noteItems, setNoteItems] = useState<Array<{ id: string; text: string; done: boolean }>>([]);
  const [newNoteItem, setNewNoteItem] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(true);
  const [userEmail, setUserEmail] = useState("Usuário RH");
  const [userRoleLabel, setUserRoleLabel] = useState("Usuário RH");

  useEffect(() => {
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        window.location.href = "/login";
        return;
      }
      setUserEmail(sessionData.session.user.email || "Usuário RH");
      const db = supabase;
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();
      setUserRoleLabel(profile?.role === "consulta" ? "Consulta" : "Usuário RH");
      const [emps, comp, overtimeRows, occ, cert, timeRows, bankRows, scheduleRows, overrideRows] = await Promise.all([
        db.from("employees").select("id,full_name,department_id,work_schedule_id,hire_date,termination_date,status,departments(name)"),
        db.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("reference_year", { ascending: false }).order("reference_month", { ascending: false }).limit(1),
        db.from("overtime_records").select("employee_id,minutes,period_id").order("reference_date", { ascending: false }),
        db.from("occurrences").select("employee_id,quantity,unit,occurrence_type_id,occurrence_date,end_date,period_id,occurrence_types(code)").order("occurrence_date", { ascending: false }),
        db.from("medical_certificates").select("id,employee_id,start_date,end_date,days"),
        db.from("time_records").select("employee_id,period_id,expected_minutes,worked_minutes"),
        db.from("bank_hours").select("employee_id,period_id,minutes,kind,adjustment_direction"),
        db.from("work_schedules").select("id,weekly_minutes"),
        db.from("point_closing_overrides").select("employee_id,period_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes"),
      ]);

      const allEmployees = emps.data ?? [];
      if (comp.data?.[0]?.id) {
        const { data: noteRow } = await db
          .from("dashboard_competence_notes")
          .select("note,items")
          .eq("period_id", comp.data[0].id)
          .maybeSingle();
        setCompetenceNote(noteRow?.note ?? "");
        setNoteItems(Array.isArray(noteRow?.items) ? (noteRow.items as unknown as { id: string; text: string; done: boolean }[]) : []);
      } else {
        setCompetenceNote("");
        setNoteItems([]);
      }
      setNoteSaved(false);
      const competence = comp.data?.[0];
      const employees = competence
        ? allEmployees.filter((e: any) =>
            (!e.hire_date || e.hire_date <= competence.end_date) &&
            (!e.termination_date || e.termination_date >= competence.start_date)
          )
        : allEmployees.filter((e: any) => e.status === "ativo");
      const activeEmployeeIds = new Set(employees.map((e: any) => e.id));
      const scheduleMap = new Map((scheduleRows.data ?? []).map((s: any) => [String(s.id), Number(s.weekly_minutes || 0) / 5]));
      const dailyMinutes = (employeeId: string) => {
        const employee = employees.find((e: any) => e.id === employeeId);
        return employee?.work_schedule_id ? (scheduleMap.get(String(employee.work_schedule_id)) ?? 528) : 528;
      };
      const overtimeData = overtimeRows.data ?? [];
      const occurrences = occ.data ?? [];

      const currentOvertime = competence
        ? overtimeData.filter((x: any) => x.period_id === competence.id && activeEmployeeIds.has(x.employee_id))
        : overtimeData.filter((x: any) => activeEmployeeIds.has(x.employee_id));
      const overtime = currentOvertime.reduce((sum: number, row: any) => sum + (row.minutes || 0), 0);

      const periodId = competence?.id ?? null;
      const absenceRows = occurrences.filter((x: any) => {
        const code = String(x.occurrence_types?.code ?? "").toLowerCase();
        return periodId && x.period_id === periodId && activeEmployeeIds.has(x.employee_id) && ["folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"].includes(code);
      });
      const absenceDays = absenceRows.reduce((sum: number, x: any) => sum + Number(x.quantity || 0), 0);
      const employeeMap = new Map(allEmployees.map((e: any) => [String(e.id), String(e.full_name || "Funcionário")]));
      setAbsencePeople(Array.from(new Set(absenceRows.map((x: any) => employeeMap.get(String(x.employee_id)) || "Funcionário"))));
      const declarationMinutes = occurrences
        .filter((x: any) => periodId && x.period_id === periodId && String(x.occurrence_types?.code ?? "").toLowerCase() === "declaracao_horas")
        .reduce((sum: number, x: any) => sum + Math.round(Number(x.quantity || 0) * 60), 0);
      const certificateRows = (cert.data ?? []).filter((x: any) => {
        if (!competence) return false;
        return x.start_date <= competence.end_date && x.end_date >= competence.start_date && activeEmployeeIds.has(x.employee_id);
      });
      const certificateDays = certificateRows.reduce((sum: number, x: any) => sum + Number(x.days || 0), 0);
      setCertificatePeople(Array.from(new Set(certificateRows.map((x: any) => employeeMap.get(String(x.employee_id)) || "Funcionário"))));
      const currentTime = (timeRows.data ?? []).filter((x: any) => (!periodId || x.period_id === periodId) && activeEmployeeIds.has(x.employee_id));
      const overrides = (overrideRows.data ?? []) as any[];
      const overrideByEmployee = new Map<string, any>(
        overrides
          .filter((x: any) => !periodId || x.period_id === periodId)
          .map((x: any) => [String(x.employee_id), x]),
      );
      const timeExpectedByEmployee = new Map<string, number>();
      currentTime.forEach((x: any) => {
        timeExpectedByEmployee.set(
          String(x.employee_id),
          (timeExpectedByEmployee.get(String(x.employee_id)) ?? 0) + Number(x.expected_minutes || 0),
        );
      });
      // Mesma regra do KPI para competências atuais: usa o previsto do ponto
      // quando informado; caso contrário, 08:48 por dia útil.
      const expectedMinutes = competence
        ? employees.reduce((sum: number, employee: any) => {
            const override = overrideByEmployee.get(String(employee.id));
            if (override) return sum + Number(override.expected_minutes || 0);
            const recordedExpected = timeExpectedByEmployee.get(String(employee.id));
            if (recordedExpected !== undefined) return sum + recordedExpected;
            const start = employee.hire_date && employee.hire_date > competence.start_date ? employee.hire_date : competence.start_date;
            const end = employee.termination_date && employee.termination_date < competence.end_date ? employee.termination_date : competence.end_date;
            if (end < start) return sum;
            return sum + Math.round(countWorkingWeekdays(start, end) * 528);
          }, 0)
        : currentTime.reduce((sum: number, x: any) => sum + Number(x.expected_minutes || 0), 0);
      const debitMinutes = (bankRows.data ?? [])
        .filter((x: any) =>
          periodId &&
          x.period_id === periodId &&
          activeEmployeeIds.has(x.employee_id) &&
          x.kind === "debito" &&
          !overrideByEmployee.has(String(x.employee_id))
        )
        .reduce((sum: number, x: any) => sum + Math.abs(Number(x.minutes || 0)), 0);
      // Absenteísmo: (faltas + débitos + abonos) / horas previstas.
      // Declarações já são registradas como abonos e, portanto,
      // não podem ser somadas novamente ao indicador.
      const allowanceRows = (occ.data ?? []).filter((x: any) => {
        const code = String(x.occurrence_types?.code ?? "").toLowerCase();
        return periodId &&
          x.period_id === periodId &&
          activeEmployeeIds.has(x.employee_id) &&
          code === "abono";
      });
      const allowanceMinutes = allowanceRows.reduce(
        (sum: number, x: any) => sum + (String(x.unit ?? "dias").toLowerCase().startsWith("dia")
          ? Number(x.quantity || 0) * dailyMinutes(x.employee_id)
          : String(x.unit ?? "").toLowerCase().startsWith("hor")
            ? Number(x.quantity || 0) * 60
            : Number(x.quantity || 0)),
        0,
      );
      let absenceMinutes =
        absenceRows
          .filter((x: any) => !overrideByEmployee.has(String(x.employee_id)))
          .reduce((sum: number, x: any) => sum + Number(x.quantity || 0) * dailyMinutes(x.employee_id), 0)
        + allowanceMinutes
        + debitMinutes;
      for (const override of overrides) {
        if (!periodId || override.period_id !== periodId || !activeEmployeeIds.has(override.employee_id)) continue;
        absenceMinutes +=
          Math.round(Number(override.absence_quantity || 0) * 528)
          + Number(override.allowance_minutes || 0)
          + Number(override.debit_minutes || 0);
      }

      const byEmployee = new Map<string, number>();
      currentOvertime.forEach((row: any) => {
        byEmployee.set(row.employee_id, (byEmployee.get(row.employee_id) || 0) + (row.minutes || 0));
      });
      const deptMap = new Map<string, { name: string; employees: number; minutes: number }>();
      employees.forEach((x: any) => {
        const name = x.departments?.name || "Sem departamento";
        const d = deptMap.get(name) || { name, employees: 0, minutes: 0 };
        d.employees++;
        deptMap.set(name, d);
      });
      currentOvertime.forEach((x: any) => {
        const employee = employees.find((e: any) => e.id === x.employee_id);
        const name = employee?.departments?.name || "Sem departamento";
        if (deptMap.has(name)) deptMap.get(name)!.minutes += x.minutes || 0;
      });
      setDepartments([...deptMap.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6));
      // Usa exatamente a mesma regra do Banco de Horas para o saldo mensal,
      // incluindo históricos, correções, ajustes, pagamentos e exceções manuais.
      const targetPeriodId = competence?.id ?? null;
      const positiveResults = await Promise.all(
        employees.map(async (employee: any) => {
          try {
            const balances = await balancesByEmployee(employee.id);
            const index = balances.findIndex((item: any) => item.period.id === targetPeriodId);
            if (index < 0) return null;

            const monthly = balances[index];
            // O saldo exibido é calculado na mesma camada central do Banco de Horas.
            // O Dashboard apenas consome o resultado, sem duplicar a regra.
            const payableMinutes = Number(monthly?.dashboardBalance || 0);

            return payableMinutes > 0
              ? { name: employee.full_name, minutes: payableMinutes }
              : null;
          } catch {
            return null;
          }
        }),
      );
      const bankBalance = positiveResults.reduce((sum, item) => sum + (item?.minutes ?? 0), 0);
      setPositiveBalances(
        positiveResults
          .filter((item): item is { name: string; minutes: number } => Boolean(item))
          .sort((a, b) => b.minutes - a.minutes),
      );
      const periodLabel = competence
        ? `Competência ${String(competence.reference_month).padStart(2, "0")}/${competence.reference_year}`
        : "Nenhuma competência";
      setMetrics({
        employees: employees.length,
        overtime,
        absenceDays,
        certificates: certificateRows.length,
        absenteeism: expectedMinutes > 0
          ? Math.round((absenceMinutes / expectedMinutes) * 1000) / 10
          : 0,
        turnover: employees.length > 0
          ? (((allEmployees.filter((e: any) => competence && e.hire_date >= competence.start_date && e.hire_date <= competence.end_date).length +
              allEmployees.filter((e: any) => competence && e.termination_date && e.termination_date >= competence.start_date && e.termination_date <= competence.end_date).length) / 2) / employees.length) * 100
          : 0,
        admissions: allEmployees.filter((e: any) => competence && e.hire_date >= competence.start_date && e.hire_date <= competence.end_date).length,
        terminations: allEmployees.filter((e: any) => competence && e.termination_date && e.termination_date >= competence.start_date && e.termination_date <= competence.end_date).length,
        bankBalance,
        period: periodLabel,
      });
    })();
  }, []);

  async function saveCompetenceNote() {
    setSavingNote(true);
    setNoteSaved(false);
    const { data: sessionData } = await supabase.auth.getSession();
    const { data: competence } = await supabase
      .from("time_periods")
      .select("id")
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!competence?.id) {
      setSavingNote(false);
      return;
    }
    const { error } = await supabase
      .from("dashboard_competence_notes")
      .upsert({
        period_id: competence.id,
        note: competenceNote,
        items: noteItems,
        updated_by: sessionData.session?.user.id ?? null,
      }, { onConflict: "period_id" });
    if (error) {
      window.alert("Não foi possível salvar as pendências: " + error.message);
      setSavingNote(false);
      return;
    }
    setNoteSaved(true);
    setSavingNote(false);
  }

  function addNoteItem() {
    const text = newNoteItem.trim();
    if (!text) return;
    setNoteItems(items => [...items, { id: crypto.randomUUID(), text, done: false }]);
    setNewNoteItem("");
    setNoteSaved(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const cards = [
    ["Funcionários ativos", String(metrics.employees), Users, "ativos na competência"],
    ["Absenteísmo", metrics.absenteeism.toFixed(1) + "%", Gauge, "horas perdidas ÷ previstas"],
    ["Turnover", metrics.turnover.toFixed(1) + "%", TrendingUp, metrics.admissions + " admissões · " + metrics.terminations + " desligamentos"],
    ["Banco de horas", fmt(metrics.bankBalance), WalletCards, "saldo positivo disponível"],
  ] as const;

  return (
    <div className="min-h-screen bg-background">
        <header className="flex h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur">
          <span className="text-xs text-muted-foreground">RH / Visão geral</span>
          <div className="flex items-center gap-2 rounded-xl border bg-card px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">RH</div>
            <div className="hidden max-w-56 md:block"><p className="truncate text-xs font-medium">{userEmail}</p><p className="text-[10px] text-muted-foreground">{userRoleLabel}</p></div>
            <button type="button" onClick={() => void signOut()} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Sair"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-6 py-8">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="text-sm font-medium text-primary">Gestão</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">Dashboard</h1>
              <p className="mt-1 text-sm text-muted-foreground">Resumo executivo de RH e DP da competência atual.</p>
            </div>
            <div className="rounded-xl border bg-card px-5 py-3 text-sm shadow-sm">
              <p className="text-xs text-muted-foreground">Competência atual</p>
              <strong>{metrics.period}</strong>
            </div>
          </div>
          <section className="mt-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {cards.map(([label, value, Icon, description]) => (
                <Card key={label} className="group relative overflow-hidden p-5 transition-shadow hover:shadow-md">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
                  <p className="mt-4 text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 font-display text-3xl font-bold tracking-tight">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{description}</p>
                </Card>
              ))}
            </div>
          </section>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-end justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Banco de horas</p><h2 className="mt-1 text-xl font-bold">Saldos positivos</h2><p className="text-xs text-muted-foreground">Crédito disponível nesta competência.</p></div>
                <span className="text-2xl font-bold text-primary">{fmt(metrics.bankBalance)}</span>
              </div>
              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{positiveBalances.map((r) => <div key={r.name} className="flex items-center justify-between rounded-lg border p-3 text-xs"><span className="font-medium">{r.name}</span><span className="font-semibold text-primary">{fmt(r.minutes)}</span></div>)}{!positiveBalances.length && <p className="py-6 text-sm text-muted-foreground">Nenhum funcionário com crédito disponível nesta competência.</p>}</div>
            </Card>
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Acompanhamento</p><h2 className="mt-1 text-xl font-bold">Pendências da competência</h2><p className="text-xs text-muted-foreground">Organize aqui o que precisa ser resolvido nesta competência.</p></div>
                <button type="button" onClick={() => void saveCompetenceNote()} disabled={savingNote} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50"><Save className="h-3.5 w-3.5"/>{savingNote ? "Salvando..." : "Salvar"}</button>
              </div>
              <div className="mt-4 space-y-2">
                {noteItems.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
                  <input type="checkbox" checked={item.done} onChange={e => { setNoteItems(items => items.map(x => x.id === item.id ? { ...x, done: e.target.checked } : x)); setNoteSaved(false); }} className="h-4 w-4" />
                  <span className={item.done ? "flex-1 text-sm text-muted-foreground line-through" : "flex-1 text-sm"}>{item.text}</span>
                  <button type="button" onClick={() => { setNoteItems(items => items.filter(x => x.id !== item.id)); setNoteSaved(false); }} className="text-xs text-muted-foreground hover:text-destructive">Excluir</button>
                </div>)}
                {!noteItems.length && <p className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Nenhuma pendência adicionada.</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={newNoteItem} onChange={e => setNewNoteItem(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNoteItem(); } }} placeholder="Digite uma pendência..." className="flex-1 rounded-xl border bg-muted/20 px-3 py-2 text-sm outline-none focus:border-primary" />
                <button type="button" onClick={addNoteItem} className="rounded-xl border px-3 py-2 text-sm font-medium">Adicionar</button>
              </div>
              <div className="mt-2 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">As pendências ficam vinculadas à competência atual.</span>{noteSaved && <span className="text-[11px] font-medium text-primary">Salvo ✓</span>}</div>
            </Card>
          </div>
          <section className="mt-8">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Resumo da competência</p>
              <h2 className="mt-1 text-xl font-bold">O que merece atenção agora</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="p-5">
                <Clock3 className="h-5 w-5 text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">Horas extras</p>
                <p className="mt-1 text-2xl font-bold">{fmt(metrics.overtime)}</p>
                <p className="mt-1 text-xs text-muted-foreground">registradas na competência</p>
              </Card>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dp-success:navigate", { detail: "ocorrencias" }))} className="text-left">
                <Card className="h-full p-5 transition-shadow hover:shadow-md">
                  <AlertTriangle className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">Faltas</p>
                  <p className="mt-1 text-2xl font-bold">{Math.round(metrics.absenceDays)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">dias registrados · clique para ver</p>
                  {absencePeople.length > 0 && <div className="mt-3 border-t pt-3">
                    {absencePeople.slice(0, 3).map(name => <p key={name} className="truncate text-xs font-medium">{name}</p>)}
                    {absencePeople.length > 3 && <p className="mt-1 text-[11px] text-muted-foreground">+ {absencePeople.length - 3} funcionário(s)</p>}
                  </div>}
                </Card>
              </button>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dp-success:navigate", { detail: "atestados" }))} className="text-left">
                <Card className="h-full p-5 transition-shadow hover:shadow-md">
                  <FileText className="h-5 w-5 text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">Atestados</p>
                  <p className="mt-1 text-2xl font-bold">{metrics.certificates}</p>
                  <p className="mt-1 text-xs text-muted-foreground">registros na competência · clique para ver</p>
                  {certificatePeople.length > 0 && <div className="mt-3 border-t pt-3">
                    {certificatePeople.slice(0, 3).map(name => <p key={name} className="truncate text-xs font-medium">{name}</p>)}
                    {certificatePeople.length > 3 && <p className="mt-1 text-[11px] text-muted-foreground">+ {certificatePeople.length - 3} funcionário(s)</p>}
                  </div>}
                </Card>
              </button>
              <Card className="p-5">
                <Users className="h-5 w-5 text-primary" />
                <p className="mt-4 text-sm text-muted-foreground">Movimentações</p>
                <p className="mt-1 text-2xl font-bold">{metrics.admissions + metrics.terminations}</p>
                <p className="mt-1 text-xs text-muted-foreground">{metrics.admissions} admissões · {metrics.terminations} desligamentos</p>
              </Card>
            </div>
          </section>

          <section className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Visão rápida</p>
              <h2 className="mt-1 text-xl font-bold">Horas extras por departamento</h2>
              <p className="mt-1 text-xs text-muted-foreground">Onde estão concentradas as horas extras da competência.</p>
              <div className="mt-5 space-y-3">
                {departments.map(d => {
                  const total = Math.max(metrics.overtime, 1);
                  const width = Math.min(100, (d.minutes / total) * 100);
                  return (
                    <div key={d.name}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium">{d.name}</span>
                        <span className="font-semibold">{fmt(d.minutes)}</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary/70" style={{ width: width + "%" }} />
                      </div>
                    </div>
                  );
                })}
                {!departments.length && <p className="py-6 text-sm text-muted-foreground">Nenhum departamento com horas extras registradas.</p>}
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Próximo passo</p>
              <h2 className="mt-1 text-xl font-bold">Análise detalhada</h2>
              <p className="mt-2 text-sm text-muted-foreground">Use a tela de KPIs quando precisar investigar a origem dos indicadores, comparar competências, setores ou funcionários.</p>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dp-success:navigate", { detail: "kpis" }))} className="mt-5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground">
                Abrir KPIs
              </button>
            </Card>
          </section>
        </div>
    </div>
  );
}
