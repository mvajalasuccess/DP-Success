import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { AlertTriangle, Building2, ChevronDown, Clock3, FileText, Gauge, LogOut, Users, WalletCards } from "lucide-react";
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
import { ImportacaoHistorico } from "@/screens/importacao-historico";
import { countWorkingWeekdays } from "@/lib/feriados";

export const Route = createFileRoute("/")({ component: Dashboard });

type ScreenKey = "dashboard" | "funcionarios" | "cargos" | "departamentos" | "jornadas-escalas" | "fechamento-ponto" | "lancamentos" | "banco-horas" | "atestados" | "ocorrencias" | "comparativos" | "kpis" | "relatorios" | "parametros" | "importacao-historico";

const screenComponents: Record<string, ComponentType> = {
  funcionarios: Employees, cargos: Positions, departamentos: Departments, "jornadas-escalas": Schedules,
  "fechamento-ponto": PointClosing, lancamentos: Launches, "banco-horas": BankHours,
  atestados: Atestados, ocorrencias: Ocorrencias, comparativos: Comparativos, kpis: Kpis,
  relatorios: Relatorios, parametros: Parametros, "importacao-historico": ImportacaoHistorico,
};

const companyNav: Array<[string, ScreenKey]> = [
  ["Cargos", "cargos"], ["Departamentos", "departamentos"], ["Jornadas / Escalas", "jornadas-escalas"],
];

const closingNav: Array<[string, ScreenKey]> = [
  ["Fechamento", "fechamento-ponto"],
  ["Lançamentos", "lancamentos"],
  ["Atestados", "atestados"],
  ["Faltas e Ocorrências", "ocorrencias"],
];

const mainNav: Array<[string, ScreenKey]> = [
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
  children: React.ReactNode;
}) {
  const go = (key: ScreenKey) => onNavigate(key);
  const buttonClass = (key: ScreenKey) =>
    `flex w-full items-center rounded-lg py-2.5 text-left text-sm transition-colors ${screen === key ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"} ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`;

  return (
    <div className="min-h-screen bg-background">
      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r bg-sidebar transition-[width] duration-200 lg:flex lg:flex-col ${collapsed ? "w-16" : "w-64"}`}>
        <div className={`flex h-16 shrink-0 items-center border-b ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          {!collapsed && <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Clock3 className="h-5 w-5" /></div><div><div className="font-display text-base font-bold">DP Success</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">RH · DP · Gestão</div></div></div>}
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
              <span className="flex items-center gap-2"><Building2 className="h-4 w-4" />Empresa</span><ChevronDown className={`h-4 w-4 transition-transform ${companyOpen ? "rotate-180" : ""}`} />
            </button>
            {companyOpen && <div className="ml-3 mt-1 space-y-1 border-l pl-3">{companyNav.map(([label, key]) => <button key={key} type="button" onClick={() => go(key)} className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${screen === key ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent"}`}>{label}</button>)}</div>}
          </div>}

          {!collapsed && <div className="pt-2">
            <button type="button" onClick={onToggleClosing} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4" />Fechamento de Ponto</span><ChevronDown className={`h-4 w-4 transition-transform ${closingOpen ? "rotate-180" : ""}`} />
            </button>
            {closingOpen && <div className="ml-3 mt-1 space-y-1 border-l pl-3">{closingNav.map(([label, key]) => <button key={key} type="button" onClick={() => go(key)} className={`block w-full rounded-lg px-3 py-2 text-left text-xs ${screen === key ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent"}`}>{label}</button>)}</div>}
          </div>}

          {mainNav.map(([label, key]) => <button key={key} type="button" onClick={() => go(key)} className={buttonClass(key)} title={collapsed ? label : undefined}>
            {key === "banco-horas" ? <WalletCards className="h-4 w-4 shrink-0" /> : key === "relatorios" ? <FileText className="h-4 w-4 shrink-0" /> : key === "comparativos" ? <Users className="h-4 w-4 shrink-0" /> : key === "kpis" ? <Gauge className="h-4 w-4 shrink-0" /> : key === "parametros" ? <Building2 className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
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
  const [metrics, setMetrics] = useState({ employees: 0, overtime: 0, absenceDays: 0, certificates: 0, absenteeism: 0, period: "Nenhuma competência" });
  const [top, setTop] = useState<Array<{ name: string; minutes: number }>>([]);
  const [departments, setDepartments] = useState<Array<{ name: string; employees: number; minutes: number }>>([]);
  const [positiveBalances, setPositiveBalances] = useState<Array<{ name: string; minutes: number }>>([]);
  const [companyOpen, setCompanyOpen] = useState(true);
  const [userEmail, setUserEmail] = useState("Usuário RH");

  useEffect(() => {
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        window.location.href = "/login";
        return;
      }
      setUserEmail(sessionData.session.user.email || "Usuário RH");
      const db = supabase;
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
      const declarationMinutes = occurrences
        .filter((x: any) => periodId && x.period_id === periodId && String(x.occurrence_types?.code ?? "").toLowerCase() === "declaracao_horas")
        .reduce((sum: number, x: any) => sum + Math.round(Number(x.quantity || 0) * 60), 0);
      const certificateRows = (cert.data ?? []).filter((x: any) => {
        if (!competence) return false;
        return x.start_date <= competence.end_date && x.end_date >= competence.start_date && activeEmployeeIds.has(x.employee_id);
      });
      const certificateDays = certificateRows.reduce((sum: number, x: any) => sum + Number(x.days || 0), 0);
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
      // Absenteísmo segue exatamente a mesma regra da tela de KPIs:
      // (faltas + débitos + abonos) / horas previstas.
      // Atestados e declarações são exibidos separadamente e não entram no indicador.
      const allowanceRows = (occ.data ?? []).filter((x: any) => {
        const code = String(x.occurrence_types?.code ?? "").toLowerCase();
        return periodId && x.period_id === periodId && activeEmployeeIds.has(x.employee_id) && code === "abono";
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
      setTop(employees.map((x: any) => ({ name: x.full_name, minutes: byEmployee.get(x.id) || 0 })).filter(x => x.minutes > 0).sort((a, b) => b.minutes - a.minutes).slice(0, 5));
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
      const positiveByEmployee = new Map<string, number>();
      const currentOverrides = new Map(
        overrides
          .filter((x: any) => periodId && x.period_id === periodId)
          .map((x: any) => [String(x.employee_id), x]),
      );
      employees.forEach((employee: any) => {
        const override = currentOverrides.get(String(employee.id));
        if (override) {
          const balance =
            Number(override.he_60_minutes || 0) +
            Number(override.he_60_night_minutes || 0) +
            Number(override.he_100_minutes || 0) +
            Number(override.he_20_minutes || 0) -
            Number(override.debit_minutes || 0);
          if (balance > 0) positiveByEmployee.set(employee.id, balance);
          return;
        }
        const credits = overtimeData.filter(
          (x: any) => periodId && x.period_id === periodId && x.employee_id === employee.id,
        );
        const debits = (bankRows.data ?? []).filter(
          (x: any) => periodId && x.period_id === periodId && x.employee_id === employee.id && x.kind === "debito",
        );
        const adjustments = (bankRows.data ?? []).filter(
          (x: any) => periodId && x.period_id === periodId && x.employee_id === employee.id && x.kind === "ajuste",
        );
        const regularCredits = credits
          .filter((x: any) => x.launch_type !== "HE_60_NOTURNO")
          .reduce((sum: number, x: any) => sum + Math.abs(Number(x.minutes || 0)), 0);
        const nightCredits = credits
          .filter((x: any) => x.launch_type === "HE_60_NOTURNO")
          .reduce((sum: number, x: any) => sum + Math.abs(Number(x.minutes || 0)), 0);
        const debit = debits.reduce((sum: number, x: any) => sum + Math.abs(Number(x.minutes || 0)), 0);
        const adjustment = adjustments.reduce(
          (sum: number, x: any) =>
            sum + (x.adjustment_direction === "debito"
              ? -Math.abs(Number(x.minutes || 0))
              : Math.abs(Number(x.minutes || 0))),
          0,
        );
        const balance =
          regularCredits +
          (competence && competence.end_date >= "2026-08-20" ? nightCredits : 0) -
          debit +
          adjustment;
        if (balance > 0) positiveByEmployee.set(employee.id, balance);
      });
      setPositiveBalances(
        employees
          .map((employee: any) => ({
            name: employee.full_name,
            minutes: positiveByEmployee.get(employee.id) || 0,
          }))
          .filter(x => x.minutes > 0)
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
        period: periodLabel,
      });
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const cards = [
    ["Funcionários ativos", String(metrics.employees), Users],
    ["Horas extras", fmt(metrics.overtime), Clock3],
    ["Faltas", String(Math.round(metrics.absenceDays)), AlertTriangle],
    ["Atestados", String(metrics.certificates), FileText],
    ["Absenteísmo", metrics.absenteeism.toFixed(1) + "%", Gauge],
  ] as const;

  return (
    <div className="min-h-screen bg-background">
        <header className="flex h-16 items-center justify-between border-b bg-background/90 px-6">
          <span className="text-xs text-muted-foreground">RH / Visão geral</span>
          <div className="flex items-center gap-2 rounded-xl border bg-card px-2 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">RH</div>
            <div className="hidden max-w-56 md:block"><p className="truncate text-xs font-medium">{userEmail}</p><p className="text-[10px] text-muted-foreground">Usuário RH</p></div>
            <button type="button" onClick={() => void signOut()} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground" title="Sair"><LogOut className="h-4 w-4" /></button>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-6 py-7">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-medium text-primary">Visão geral da empresa</p><h1 className="mt-1 text-3xl font-bold">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe ponto, banco de horas, absenteísmo e indicadores.</p></div><div className="rounded-lg border bg-card px-4 py-2 text-xs font-medium">Competência: <strong>{metrics.period}</strong></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value, Icon]) => <Card key={label} className="p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><p className="mt-4 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{metrics.employees === 0 ? "sem dados cadastrados" : "dados atuais"}</p></Card>)}</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 p-5"><h2 className="font-display font-bold">Funcionários com mais horas extras</h2><p className="text-xs text-muted-foreground">Dados reais dos lançamentos registrados</p><div className="mt-4 divide-y">{top.map((r, i) => <div key={r.name} className="flex items-center justify-between py-3 text-xs"><span className="w-6 text-muted-foreground">{i + 1}</span><span className="flex-1 font-medium">{r.name}</span><span className="w-24 text-right font-semibold">{fmt(r.minutes)}</span></div>)}{!top.length && <p className="py-6 text-sm text-muted-foreground">Nenhum dado de horas extras registrado.</p>}</div></Card>
            <Card className="p-5"><h2 className="font-display font-bold">Saldos positivos</h2><p className="text-xs text-muted-foreground">Funcionários com saldo positivo nesta competência</p><div className="mt-4 max-h-80 space-y-2 overflow-y-auto">{positiveBalances.map((r) => <div key={r.name} className="flex items-center justify-between rounded-lg border p-3 text-xs"><span className="font-medium">{r.name}</span><span className="font-semibold text-primary">{fmt(r.minutes)}</span></div>)}{!positiveBalances.length && <p className="py-6 text-sm text-muted-foreground">Nenhum funcionário com saldo positivo nesta competência.</p>}</div></Card>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><h2 className="font-display font-bold">Visão por departamento</h2><p className="text-xs text-muted-foreground">Dados reais de funcionários e horas extras</p><div className="mt-4 grid grid-cols-2 gap-3">{departments.map(d => <div key={d.name} className="rounded-xl border p-4"><p className="text-xs font-semibold">{d.name}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><span>{d.employees}<br /><em className="text-muted-foreground not-italic">func.</em></span><span>{fmt(d.minutes)}<br /><em className="text-muted-foreground not-italic">HE</em></span></div></div>)}{!departments.length && <p className="text-sm text-muted-foreground">Nenhum departamento com dados cadastrados.</p>}</div></Card>

          </div>
        </div>
    </div>
  );
}
