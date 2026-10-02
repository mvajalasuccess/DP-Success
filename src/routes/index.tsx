import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Building2, ChevronDown, Clock3, FileText, Gauge, LogOut, Users, WalletCards, Save, TrendingUp, Settings, Menu } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
const Employees = lazy(() => import("@/screens/funcionarios").then(m => ({ default: m.Employees })));
const Positions = lazy(() => import("@/screens/cargos").then(m => ({ default: m.Positions })));
const Departments = lazy(() => import("@/screens/departamentos").then(m => ({ default: m.Departments })));
const Schedules = lazy(() => import("@/screens/jornadas-escalas").then(m => ({ default: m.Schedules })));
const PointClosing = lazy(() => import("@/screens/fechamento-ponto").then(m => ({ default: m.PointClosing })));
const Launches = lazy(() => import("@/screens/lancamentos").then(m => ({ default: m.Launches })));
const BankHours = lazy(() => import("@/screens/banco-horas").then(m => ({ default: m.BankHours })));
const Atestados = lazy(() => import("@/screens/atestados").then(m => ({ default: m.Atestados })));
const Ocorrencias = lazy(() => import("@/screens/ocorrencias").then(m => ({ default: m.Ocorrencias })));
const Comparativos = lazy(() => import("@/screens/comparativos").then(m => ({ default: m.Comparativos })));
const Kpis = lazy(() => import("@/screens/kpis").then(m => ({ default: m.Kpis })));
const Relatorios = lazy(() => import("@/screens/relatorios").then(m => ({ default: m.Relatorios })));
const Parametros = lazy(() => import("@/screens/parametros").then(m => ({ default: m.Parametros })));
const Tarefas = lazy(() => import("@/screens/tarefas").then(m => ({ default: m.Tarefas })));
const ImportacaoHistorico = lazy(() => import("@/screens/importacao-historico").then(m => ({ default: m.ImportacaoHistorico })));
const ImportarCartaoPonto = lazy(() => import("@/screens/importar-cartao-ponto").then(m => ({ default: m.ImportarCartaoPonto })));
import { countWorkingWeekdays } from "@/lib/feriados";
import { balancesByEmployees } from "@/lib/dp-model";

export const Route = createFileRoute("/")({ component: Dashboard });

type ScreenKey = "dashboard" | "funcionarios" | "cargos" | "departamentos" | "jornadas-escalas" | "fechamento-ponto" | "lancamentos" | "banco-horas" | "atestados" | "ocorrencias" | "comparativos" | "kpis" | "relatorios" | "parametros" | "tarefas" | "importacao-historico" | "importar-cartao-ponto";

const screenComponents = {
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
  ["Atestados", "atestados"],
  ["Faltas e Ocorrências", "ocorrencias"],
  ["Importar Cartão Ponto", "importar-cartao-ponto"],
];

const mainNav: Array<[string, ScreenKey]> = [
  ["Tarefas & Agenda", "tarefas"],
  ["Banco de Horas", "banco-horas"],
  ["Relatórios", "relatorios"], ["Comparativos", "comparativos"], ["KPIs", "kpis"], ["Configurações", "parametros"], ["Importar histórico", "importacao-historico"],
];

function fmt(minutes: number) {
  const sign = minutes < 0 ? "-" : "+";
  const value = Math.abs(Math.round(minutes));
  return sign + Math.floor(value / 60) + "h " + String(value % 60).padStart(2, "0") + "m";
}

function getScreenFromUrl(): ScreenKey {
  if (typeof window === "undefined") return "dashboard";
  const value = new URLSearchParams(window.location.search).get("tela") as ScreenKey | null;
  const validScreens: ScreenKey[] = ["dashboard", "funcionarios", "cargos", "departamentos", "jornadas-escalas", "fechamento-ponto", "lancamentos", "banco-horas", "atestados", "ocorrencias", "comparativos", "kpis", "relatorios", "parametros", "tarefas", "importacao-historico", "importar-cartao-ponto"];
  return value && validScreens.includes(value) ? value : "dashboard";
}

function Dashboard() {
  const [screen, setScreen] = useState<ScreenKey>(getScreenFromUrl);
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

  const navigateToScreen = (target: ScreenKey) => {
    setScreen(target);
    const url = new URL(window.location.href);
    if (target === "dashboard") url.searchParams.delete("tela");
    else url.searchParams.set("tela", target);
    window.history.pushState({ screen: target }, "", url);
  };

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const target = (event as CustomEvent<ScreenKey>).detail;
      if (target) navigateToScreen(target);
    };
    const onPopState = () => setScreen(getScreenFromUrl());
    window.addEventListener("dp-success:navigate", onNavigate);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("dp-success:navigate", onNavigate);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  const Screen = screen === "dashboard" ? null : screenComponents[screen];

  return (
    <AppShell
      screen={screen}
      collapsed={sidebarCollapsed}
      companyOpen={companyOpen}
      closingOpen={closingOpen}
      onNavigate={navigateToScreen}
      onToggleCollapsed={() => setSidebarCollapsed(value => !value)}
      onToggleCompany={() => setCompanyOpen(value => !value)}
      onToggleClosing={() => setClosingOpen(value => !value)}
    >
      {Screen ? (
          <Suspense fallback={<div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">Carregando tela...</div>}>
            <Screen />
          </Suspense>
        ) : <DashboardHome />}
    </AppShell>
  );
}

function AppShell({
  screen, collapsed, onNavigate, onToggleCollapsed, children,
}: {
  screen: ScreenKey;
  collapsed: boolean;
  onNavigate: (screen: ScreenKey) => void;
  onToggleCollapsed: () => void;
  children: ReactNode;
}) {
  const go = (key: ScreenKey) => onNavigate(key);
  const [managementOpen, setManagementOpen] = useState(true);
  const [closingMenuOpen, setClosingMenuOpen] = useState(true);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);

  const buttonClass = (key: ScreenKey) =>
    `flex w-full items-center rounded-lg py-2.5 text-left text-sm transition-colors ${screen === key ? "bg-sidebar-primary text-sidebar-primary-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"} ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`;

  const sectionButtonClass = "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/45 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground";

  return (
    <div className="min-h-screen bg-background">
      {collapsed && (
        <div className="fixed inset-x-0 top-0 z-50 hidden h-16 items-center border-b bg-background/95 px-6 shadow-sm backdrop-blur lg:flex">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="mr-4 rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
            title="Abrir menu"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Clock3 className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-bold text-foreground">DP Success</span>
          </div>
        </div>
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 hidden border-r bg-sidebar transition-[transform,width] duration-200 lg:flex lg:flex-col ${collapsed ? "-translate-x-full w-64" : "translate-x-0 w-64"}`}>
        <div className={`flex h-16 shrink-0 items-center border-b ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          {!collapsed && <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Clock3 className="h-5 w-5" /></div><div><div className="font-display text-base font-bold">DP Success</div><div className="text-[9px] uppercase tracking-widest text-muted-foreground">RH · DP · Gestão</div></div></div>}
          {collapsed && <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Clock3 className="h-5 w-5" /></div>}
          <button type="button" onClick={onToggleCollapsed} className="rounded-lg p-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground" title={collapsed ? "Expandir menu" : "Minimizar menu"} aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}><ChevronDown className={`h-4 w-4 transition-transform ${collapsed ? "-rotate-90" : "rotate-90"}`} /></button>
        </div>

        <nav className={`flex-1 overflow-y-auto sidebar-scrollbar-hidden p-3 ${collapsed ? "space-y-2" : "space-y-2"}`}>
          {!collapsed ? (
            <>
              <div>
                <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Funcionários</div>
                <button type="button" onClick={() => go("funcionarios")} className={buttonClass("funcionarios")}><Users className="h-4 w-4 shrink-0" /><span>Funcionários</span></button>
              </div>

              <div>
                <button type="button" onClick={() => setManagementOpen(v => !v)} className={sectionButtonClass} aria-expanded={managementOpen}>
                  <span>Gestão</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${managementOpen ? "rotate-0" : "-rotate-90"}`} />
                </button>
                {managementOpen && <div className="mt-1 space-y-0.5">
                  {[
                    ["Dashboard", "dashboard", Gauge], ["KPIs", "kpis", Gauge], ["Comparativos", "comparativos", Users], ["Relatórios", "relatorios", FileText],
                  ].map(([label, key, Icon]) => <button key={key as string} type="button" onClick={() => go(key as ScreenKey)} className={buttonClass(key as ScreenKey)}><Icon className="h-4 w-4 shrink-0" /><span>{label as string}</span></button>)}
                </div>}
              </div>

              <div>
                <button type="button" onClick={() => setClosingMenuOpen(v => !v)} className={sectionButtonClass} aria-expanded={closingMenuOpen}>
                  <span>Fechamento de Ponto</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${closingMenuOpen ? "rotate-0" : "-rotate-90"}`} />
                </button>
                {closingMenuOpen && <div className="mt-1 space-y-0.5">
                  {[
                    ["Fechamento", "fechamento-ponto", Clock3], ["Lançamentos", "lancamentos", FileText], ["Banco de Horas", "banco-horas", WalletCards], ["Faltas", "ocorrencias", AlertTriangle], ["Declarações e Atestados", "atestados", FileText], ["Importar Cartão Ponto", "importar-cartao-ponto", FileText],
                  ].map(([label, key, Icon]) => <button key={key as string} type="button" onClick={() => go(key as ScreenKey)} className={buttonClass(key as ScreenKey)}><Icon className="h-4 w-4 shrink-0" /><span>{label as string}</span></button>)}
                </div>}
              </div>

              <div>
                <button type="button" onClick={() => setCompanyMenuOpen(v => !v)} className={sectionButtonClass} aria-expanded={companyMenuOpen}>
                  <span>Empresa</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${companyMenuOpen ? "rotate-0" : "-rotate-90"}`} />
                </button>
                {companyMenuOpen && <div className="mt-1 space-y-0.5">
                  {[
                    ["Cargos", "cargos"], ["Departamentos", "departamentos"], ["Jornadas", "jornadas-escalas"],
                  ].map(([label, key]) => <button key={key} type="button" onClick={() => go(key as ScreenKey)} className={buttonClass(key as ScreenKey)}><Building2 className="h-4 w-4 shrink-0" /><span>{label}</span></button>)}
                </div>}
              </div>

              <div>
                <button type="button" onClick={() => setTasksOpen(v => !v)} className={sectionButtonClass} aria-expanded={tasksOpen}>
                  <span>Tarefas</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${tasksOpen ? "rotate-0" : "-rotate-90"}`} />
                </button>
                {tasksOpen && <div className="mt-1 space-y-0.5">
                  <button type="button" onClick={() => go("tarefas")} className={buttonClass("tarefas")}><FileText className="h-4 w-4 shrink-0" /><span>Tarefas</span></button>
                </div>}
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={() => go("funcionarios")} className={buttonClass("funcionarios")} title="Funcionários"><Users className="h-4 w-4 shrink-0" /></button>
              {[
                ["dashboard", Gauge, "Dashboard"], ["kpis", Gauge, "KPIs"], ["comparativos", Users, "Comparativos"], ["relatorios", FileText, "Relatórios"],
                ["fechamento-ponto", Clock3, "Fechamento"], ["lancamentos", FileText, "Lançamentos"], ["banco-horas", WalletCards, "Banco de Horas"], ["ocorrencias", AlertTriangle, "Faltas"], ["atestados", FileText, "Declarações e Atestados"], ["importar-cartao-ponto", FileText, "Importar Cartão Ponto"],
                ["cargos", Building2, "Cargos"], ["departamentos", Building2, "Departamentos"], ["jornadas-escalas", Building2, "Jornadas"], ["tarefas", FileText, "Tarefas"],
              ].map(([key, Icon, label]) => <button key={key as string} type="button" onClick={() => go(key as ScreenKey)} className={buttonClass(key as ScreenKey)} title={label as string}><Icon className="h-4 w-4 shrink-0" /></button>)}
            </>
          )}
        </nav>
        <SidebarProfile collapsed={collapsed} onNavigate={go} />
      </aside>

      <main className={`transition-[padding] duration-200 ${collapsed ? "lg:pl-0 lg:pt-16" : "lg:pl-64"}`}>
        {children}
      </main>
    </div>
  );
}

function SidebarProfile({ collapsed, onNavigate }: { collapsed: boolean; onNavigate: (screen: ScreenKey) => void }) {
  const [name, setName] = useState("Mariana Ajala");
  const [role, setRole] = useState("Usuário RH");

  useEffect(() => { void (async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    if (!userId) return;
    const { data: profile } = await (supabase as any).from("profiles").select("full_name,role").eq("id", userId).maybeSingle();
    if (profile?.full_name) setName(profile.full_name);
    setRole(profile?.role === "consulta" ? "Consulta" : "Usuário RH");
  })(); }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="border-t border-sidebar-border/60 p-3">
      <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-2"}`}>
        <button
          type="button"
          onClick={() => onNavigate("parametros")}
          className={`flex min-w-0 flex-1 items-center rounded-xl p-2 text-left hover:bg-sidebar-accent ${collapsed ? "justify-center" : "gap-3"}`}
          title={collapsed ? "Configurações" : undefined}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-foreground/75">
            <Settings className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-sidebar-foreground">{name}</p>
              <p className="truncate text-[10px] text-sidebar-foreground/45">{role}</p>
            </div>
          )}
        </button>

        <button
          type="button"
          onClick={() => void handleLogout()}
          className={`flex shrink-0 items-center rounded-xl p-2 text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${collapsed ? "" : "px-2"}`}
          title="Sair do sistema"
          aria-label="Sair do sistema"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-1 text-[11px] font-medium">Sair</span>}
        </button>
      </div>
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
      // Carrega primeiro apenas o contexto necessário para a primeira pintura.
      // Os dados operacionais são buscados depois, já filtrados pela competência.
      const [emps, comp] = await Promise.all([
        db.from("employees").select("id,full_name,department_id,work_schedule_id,hire_date,termination_date,status,departments(name)"),
        db.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("reference_year", { ascending: false }).order("reference_month", { ascending: false }).limit(1),
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

      const [
        overtimeRows,
        occ,
        cert,
        timeRows,
        bankRows,
        scheduleRows,
        overrideRows,
      ] = competence
        ? await Promise.all([
            db.from("overtime_records").select("employee_id,minutes,period_id").eq("period_id", competence.id),
            db.from("occurrences").select("employee_id,quantity,unit,occurrence_type_id,occurrence_date,end_date,period_id,occurrence_types(code)").eq("period_id", competence.id),
            db.from("medical_certificates").select("id,employee_id,start_date,end_date,days").lte("start_date", competence.end_date).gte("end_date", competence.start_date),
            db.from("time_records").select("employee_id,period_id,expected_minutes,worked_minutes").eq("period_id", competence.id),
            db.from("bank_hours").select("employee_id,period_id,minutes,kind,adjustment_direction").eq("period_id", competence.id),
            db.from("work_schedules").select("id,weekly_minutes"),
            db.from("point_closing_overrides").select("employee_id,period_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes").eq("period_id", competence.id),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];
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

      const departmentByEmployee = new Map(
        employees.map((employee: any) => [String(employee.id), employee.departments?.name || "Sem departamento"]),
      );
      const deptMap = new Map<string, { name: string; employees: number; minutes: number }>();
      employees.forEach((x: any) => {
        const name = x.departments?.name || "Sem departamento";
        const d = deptMap.get(name) || { name, employees: 0, minutes: 0 };
        d.employees++;
        deptMap.set(name, d);
      });
      currentOvertime.forEach((x: any) => {
        const name = departmentByEmployee.get(String(x.employee_id)) || "Sem departamento";
        const department = deptMap.get(name);
        if (department) department.minutes += x.minutes || 0;
      });
      setDepartments([...deptMap.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 6));
      // Renderiza os indicadores principais antes do cálculo mais pesado do Banco de Horas.
      // O saldo detalhado continua sendo carregado em seguida, sem bloquear a primeira pintura.
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
        bankBalance: 0,
        period: periodLabel,
      });

      // O saldo positivo detalhado é calculado depois, sem bloquear os cards principais.
      const targetPeriodId = competence?.id ?? null;
      // Calcula todos os saldos em lote, preservando a mesma regra central do Banco de Horas.
      const balancesByEmployee = await balancesByEmployees(employees.map((employee: any) => String(employee.id)));
      const positiveResults = employees.map((employee: any) => {
        const balances = balancesByEmployee[String(employee.id)] ?? [];
        const monthly = balances.find((item: any) => item.period.id === targetPeriodId);
        if (!monthly) return null;
        const payableMinutes = Number(monthly.dashboardBalance || 0);
        return payableMinutes > 0
          ? { name: employee.full_name, minutes: payableMinutes }
          : null;
      });
      const bankBalance = positiveResults.reduce((sum, item) => sum + (item?.minutes ?? 0), 0);
      setPositiveBalances(
        positiveResults
          .filter((item): item is { name: string; minutes: number } => Boolean(item))
          .sort((a, b) => b.minutes - a.minutes),
      );
      setMetrics(current => ({ ...current, bankBalance }));
    })();
  }, []);

  async function saveCompetenceNote() {
    setSavingNote(true);
    setNoteSaved(false);
    const { data: sessionData } = await supabase.auth.getSession();
    const { data: competence } = await supabase
      .from("time_periods")
      .select("id")