import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, BadgeDollarSign, Building2, BriefcaseBusiness, CalendarClock, CalendarDays, CalendarCheck, CalendarX, CalendarRange, ChartColumn, ChevronDown, ChevronLeft, ClipboardCheck, ClipboardList, Clock3, FileText, Gauge, LayoutDashboard, ListChecks, LogOut, Settings, Menu, CircleDollarSign, Upload, UsersRound, WalletCards, Save, TrendingUp, Stethoscope, X, Pencil, Trash2, CheckCircle2, RotateCcw, Palmtree, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { CompanyFilter } from "@/components/company-filter";
const Employees = lazy(() => import("@/screens/funcionarios").then(m => ({ default: m.Employees })));
const Companies = lazy(() => import("@/screens/empresas").then(m => ({ default: m.Companies })));
const Positions = lazy(() => import("@/screens/cargos").then(m => ({ default: m.Positions })));
const Departments = lazy(() => import("@/screens/departamentos").then(m => ({ default: m.Departments })));
const Schedules = lazy(() => import("@/screens/jornadas-escalas").then(m => ({ default: m.Schedules })));
const PointClosing = lazy(() => import("@/screens/fechamento-ponto").then(m => ({ default: m.PointClosing })));
const Launches = lazy(() => import("@/screens/lancamentos").then(m => ({ default: m.Launches })));
const BankHours = lazy(() => import("@/screens/banco-horas").then(m => ({ default: m.BankHours })));
const Payments = lazy(() => import("@/screens/pagamentos").then(m => ({ default: m.Payments })));
const Atestados = lazy(() => import("@/screens/atestados").then(m => ({ default: m.Atestados })));
const Ocorrencias = lazy(() => import("@/screens/ocorrencias").then(m => ({ default: m.Ocorrencias })));
const Comparativos = lazy(() => import("@/screens/comparativos").then(m => ({ default: m.Comparativos })));
const Kpis = lazy(() => import("@/screens/kpis").then(m => ({ default: m.Kpis })));
const Relatorios = lazy(() => import("@/screens/relatorios").then(m => ({ default: m.Relatorios })));
const Parametros = lazy(() => import("@/screens/parametros").then(m => ({ default: m.Parametros })));
const Tarefas = lazy(() => import("@/screens/tarefas").then(m => ({ default: m.Tarefas })));
const PlanejamentoMensal = lazy(() => import("@/screens/planejamento-mensal").then(m => ({ default: m.PlanejamentoMensal })));
const DiarioOcorrencias = lazy(() => import("@/screens/diario-ocorrencias").then(m => ({ default: m.DiarioOcorrencias })));
const ImportacaoHistorico = lazy(() => import("@/screens/importacao-historico").then(m => ({ default: m.ImportacaoHistorico })));
const ImportarCartaoPonto = lazy(() => import("@/screens/importar-cartao-ponto").then(m => ({ default: m.ImportarCartaoPonto })));
const Ferias = lazy(() => import("@/screens/ferias").then(m => ({ default: m.Ferias })));
import { countWorkingWeekdays } from "@/lib/feriados";
import { balancesByEmployees } from "@/lib/dp-model";

export const Route = createFileRoute("/")({ component: Dashboard });

type ScreenKey = "dashboard" | "empresas" | "funcionarios" | "cargos" | "departamentos" | "jornadas-escalas" | "fechamento-ponto" | "lancamentos" | "banco-horas" | "pagamentos" | "atestados" | "ocorrencias" | "comparativos" | "kpis" | "relatorios" | "parametros" | "tarefas" | "planejamento-mensal" | "diario-ocorrencias" | "importacao-historico" | "importar-cartao-ponto" | "ferias";

const screenComponents = {
  empresas: Companies, funcionarios: Employees, cargos: Positions, departamentos: Departments, "jornadas-escalas": Schedules,
  "fechamento-ponto": PointClosing, lancamentos: Launches, "banco-horas": BankHours, pagamentos: Payments,
  atestados: Atestados, ocorrencias: Ocorrencias, comparativos: Comparativos, kpis: Kpis,
  relatorios: Relatorios, parametros: Parametros, tarefas: Tarefas, "planejamento-mensal": PlanejamentoMensal, "diario-ocorrencias": DiarioOcorrencias, "importacao-historico": ImportacaoHistorico, "importar-cartao-ponto": ImportarCartaoPonto, ferias: Ferias,
};


function fmt(minutes: number) {
  const sign = minutes < 0 ? "-" : "+";
  const value = Math.abs(Math.round(minutes));
  return sign + Math.floor(value / 60) + "h " + String(value % 60).padStart(2, "0") + "m";
}

function getScreenFromUrl(): ScreenKey {
  if (typeof window === "undefined") return "dashboard";
  const value = new URLSearchParams(window.location.search).get("tela") as ScreenKey | null;
  const validScreens: ScreenKey[] = ["dashboard", "empresas", "funcionarios", "cargos", "departamentos", "jornadas-escalas", "fechamento-ponto", "lancamentos", "banco-horas", "pagamentos", "atestados", "ocorrencias", "comparativos", "kpis", "relatorios", "parametros", "tarefas", "planejamento-mensal", "diario-ocorrencias", "importacao-historico", "importar-cartao-ponto", "ferias"];
  return value && validScreens.includes(value) ? value : "dashboard";
}

function Dashboard() {
  const [screen, setScreen] = useState<ScreenKey>(getScreenFromUrl);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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
      if (active) setIsConsulta(profile?.role === "consulta" || profile?.role === "convidado");
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
      onNavigate={navigateToScreen}
      onToggleCollapsed={() => setSidebarCollapsed(value => !value)}
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
  const go = (key: ScreenKey) => { onNavigate(key); setMobileMenuOpen(false); };
  const [managementOpen, setManagementOpen] = useState(true);
  const [closingMenuOpen, setClosingMenuOpen] = useState(true);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (["dashboard", "kpis", "comparativos", "relatorios"].includes(screen)) setManagementOpen(true);
    if (["fechamento-ponto", "importar-cartao-ponto", "lancamentos", "banco-horas", "pagamentos", "ocorrencias", "atestados"].includes(screen)) setClosingMenuOpen(true);
    if (["empresas", "funcionarios", "cargos", "departamentos", "jornadas-escalas"].includes(screen)) setCompanyMenuOpen(true);
    if (["planejamento-mensal", "diario-ocorrencias", "tarefas"].includes(screen)) setTasksOpen(true);
    if (screen === "ferias") setPeopleOpen(true);
  }, [screen]);

  const buttonClass = (key: ScreenKey) =>
    `dp-sidebar-item group relative flex min-h-10 w-full items-center py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${screen === key ? "dp-sidebar-item-active font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent"} ${collapsed ? "justify-center px-2" : "gap-3 px-3"}`;

  const sectionButtonClass = "dp-sidebar-group-label flex min-h-9 w-full items-center justify-between px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";
  const mobileGroups: { label: string; items: [string, ScreenKey, LucideIcon][] }[] = [
    { label: "Análise", items: [["Dashboard", "dashboard", LayoutDashboard], ["KPIs", "kpis", ChartColumn], ["Comparativos", "comparativos", UsersRound], ["Relatórios", "relatorios", FileText]] },
    { label: "Fechamento de Ponto", items: [["Fechamento", "fechamento-ponto", CalendarClock], ["Importar Cartão Ponto", "importar-cartao-ponto", Upload], ["Lançamentos", "lancamentos", ClipboardList], ["Banco de Horas", "banco-horas", Clock3], ["Pagamentos", "pagamentos", BadgeDollarSign], ["Faltas e Folgas", "ocorrencias", CalendarX], ["Declarações e Atestados", "atestados", ClipboardCheck]] },
    { label: "Cadastro", items: [["Empresas", "empresas", Building2], ["Funcionários", "funcionarios", UsersRound], ["Cargos", "cargos", BriefcaseBusiness], ["Departamentos", "departamentos", Building2], ["Jornadas / Escalas", "jornadas-escalas", CalendarDays]] },
    { label: "Organização", items: [["Planejamento Mensal", "planejamento-mensal", CalendarRange], ["Diário de Ocorrências", "diario-ocorrencias", ClipboardList], ["Tarefas", "tarefas", ListChecks]] },
    { label: "Pessoas", items: [["Férias", "ferias", Palmtree]] },
  ];

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 shadow-sm backdrop-blur lg:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <Clock3 className="h-5 w-5 shrink-0 text-primary-strong" strokeWidth={1.8} aria-hidden="true" />
          <span className="truncate font-display text-sm font-semibold tracking-tight">DP <span className="text-primary-strong">SUCCESS</span></span>
        </div>
        <button type="button" onClick={() => setMobileMenuOpen(true)} aria-expanded={mobileMenuOpen} aria-haspopup="dialog" className="inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Menu className="h-4 w-4" /> Menu
        </button>
      </div>
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] bg-foreground/40 lg:hidden">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu de navegação" />
          <aside role="dialog" aria-modal="true" aria-label="Menu de navegação" className="dp-sidebar relative z-10 flex h-full w-[min(88vw,22rem)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
            <div className="dp-sidebar-header flex h-[76px] shrink-0 items-center justify-between border-b border-sidebar-border px-4">
              <div className="flex min-w-0 items-center gap-3">
                <Clock3 className="h-5 w-5 shrink-0 text-sidebar-primary" strokeWidth={1.8} aria-hidden="true" />
                <div className="min-w-0"><p className="font-display text-base font-bold tracking-tight">DP <span className="text-sidebar-primary">SUCCESS</span></p><p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/80">RH · DP · ANÁLISE</p></div>
              </div>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center text-sidebar-foreground/80 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring" aria-label="Fechar menu"><X className="h-5 w-5" strokeWidth={1.8} /></button>
            </div>
            <nav aria-label="Navegação principal" className="dp-sidebar-nav sidebar-scrollbar-hidden flex-1 overflow-y-auto p-3">
              {mobileGroups.map(group => (
                <section key={group.label} className="dp-sidebar-mobile-group mb-5">
                  <p className="dp-sidebar-group-label px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/80">{group.label}</p>
                  <div className="space-y-0.5">
                    {group.items.map(([label, key, Icon]) => (
                      <button key={key} type="button" onClick={() => go(key)} aria-current={screen === key ? "page" : undefined} className={`dp-sidebar-item relative flex min-h-10 w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${screen === key ? "dp-sidebar-item-active font-semibold" : "text-sidebar-foreground hover:bg-sidebar-accent"}`}>
                        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /><span>{label}</span>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </nav>
            <SidebarProfile collapsed={false} onNavigate={go} />
          </aside>
        </div>
      )}
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
            <Clock3 className="h-5 w-5 text-primary-strong" strokeWidth={1.8} aria-hidden="true" />
            <span className="font-display text-base font-semibold text-foreground">DP <span className="text-primary-strong">SUCCESS</span></span>
          </div>
        </div>
      )}
      <aside aria-label="Barra lateral principal" className={`dp-sidebar fixed inset-y-0 left-0 z-40 hidden border-r bg-sidebar transition-[transform,width] duration-200 lg:flex lg:flex-col ${collapsed ? "-translate-x-full w-64" : "translate-x-0 w-64"}`}>
        <div className={`dp-sidebar-header flex h-[82px] shrink-0 items-center border-b border-sidebar-border ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-3">
              <Clock3 className="h-5 w-5 shrink-0 text-sidebar-primary" strokeWidth={1.8} aria-hidden="true" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5 leading-none">
                  <span className="font-display text-[20px] font-semibold tracking-[-0.035em] text-sidebar-foreground">DP</span>
                  <span className="font-display text-[20px] font-semibold tracking-[-0.035em] text-sidebar-primary">SUCCESS</span>
                </div>
                <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-sidebar-foreground/80">RH · DP · GESTÃO</div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-sidebar-foreground/80 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            title={collapsed ? "Expandir menu" : "Minimizar menu"}
            aria-label={collapsed ? "Expandir menu" : "Minimizar menu"}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>

        <nav aria-label="Navegação principal" className={`dp-sidebar-nav sidebar-scrollbar-hidden flex-1 overflow-y-auto p-3 ${collapsed ? "space-y-2" : "space-y-2"}`}>
          {!collapsed ? (
            <>
              <section className="dp-sidebar-group">
                <button type="button" onClick={() => setManagementOpen(v => !v)} className={sectionButtonClass} aria-expanded={managementOpen} aria-controls="dp-sidebar-management">
                  <span>Análise</span><ChevronDown className={`h-4 w-4 transition-transform duration-150 ${managementOpen ? "rotate-0" : "-rotate-90"}`} strokeWidth={1.8} />
                </button>
                {managementOpen && <div id="dp-sidebar-management" className="mt-1 space-y-1">
                  {([
                    ["Dashboard", "dashboard", LayoutDashboard], ["KPIs", "kpis", ChartColumn], ["Comparativos", "comparativos", UsersRound], ["Relatórios", "relatorios", FileText],
                  ] as [string, ScreenKey, LucideIcon][]).map(([label, key, Icon]) => <button key={key} type="button" onClick={() => go(key)} aria-current={screen === key ? "page" : undefined} className={buttonClass(key)}><Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /><span>{label}</span></button>)}
                </div>}
              </section>

              <section className="dp-sidebar-group">
                <button type="button" onClick={() => setClosingMenuOpen(v => !v)} className={sectionButtonClass} aria-expanded={closingMenuOpen} aria-controls="dp-sidebar-closing">
                  <span>Fechamento de Ponto</span><ChevronDown className={`h-4 w-4 transition-transform duration-150 ${closingMenuOpen ? "rotate-0" : "-rotate-90"}`} strokeWidth={1.8} />
                </button>
                {closingMenuOpen && <div id="dp-sidebar-closing" className="mt-1 space-y-1">
                  {([
                    ["Fechamento", "fechamento-ponto", CalendarClock], ["Importar Cartão Ponto", "importar-cartao-ponto", Upload], ["Lançamentos", "lancamentos", ClipboardList], ["Banco de Horas", "banco-horas", Clock3], ["Pagamentos", "pagamentos", BadgeDollarSign], ["Faltas e Folgas", "ocorrencias", CalendarX], ["Declarações e Atestados", "atestados", ClipboardCheck],
                  ] as [string, ScreenKey, LucideIcon][]).map(([label, key, Icon]) => <button key={key} type="button" onClick={() => go(key)} aria-current={screen === key ? "page" : undefined} className={buttonClass(key)}><Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /><span>{label}</span></button>)}
                </div>}
              </section>

              <section className="dp-sidebar-group">
                <button type="button" onClick={() => setCompanyMenuOpen(v => !v)} className={sectionButtonClass} aria-expanded={companyMenuOpen} aria-controls="dp-sidebar-cadastro">
                  <span>Cadastro</span><ChevronDown className={`h-4 w-4 transition-transform duration-150 ${companyMenuOpen ? "rotate-0" : "-rotate-90"}`} strokeWidth={1.8} />
                </button>
                {companyMenuOpen && <div id="dp-sidebar-cadastro" className="mt-1 space-y-1">
                  {[
                    ["Empresas", "empresas"], ["Funcionários", "funcionarios"], ["Cargos", "cargos"], ["Departamentos", "departamentos"], ["Jornadas", "jornadas-escalas"],
                  ].map(([label, key]) => { const Icon = key === "empresas" || key === "departamentos" ? Building2 : key === "funcionarios" ? UsersRound : key === "cargos" ? BriefcaseBusiness : CalendarDays; return <button key={key} type="button" onClick={() => go(key as ScreenKey)} aria-current={screen === key ? "page" : undefined} className={buttonClass(key as ScreenKey)}><Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /><span>{label}</span></button>; })}
                </div>}
              </section>

              <section className="dp-sidebar-group">
                <button type="button" onClick={() => setTasksOpen(v => !v)} className={sectionButtonClass} aria-expanded={tasksOpen} aria-controls="dp-sidebar-organization">
                  <span>Organização</span><ChevronDown className={`h-4 w-4 transition-transform duration-150 ${tasksOpen ? "rotate-0" : "-rotate-90"}`} strokeWidth={1.8} />
                </button>
              <section className="dp-sidebar-group">
                <button type="button" onClick={() => setPeopleOpen(v => !v)} className={sectionButtonClass} aria-expanded={peopleOpen} aria-controls="dp-sidebar-people">
                  <span>Pessoas</span><ChevronDown className={"h-4 w-4 transition-transform duration-150 " + (peopleOpen ? "rotate-0" : "-rotate-90")} strokeWidth={1.8} />
                </button>
                {peopleOpen && <div id="dp-sidebar-people" className="mt-1 space-y-1">
                  <button type="button" onClick={() => go("ferias")} aria-current={screen === "ferias" ? "page" : undefined} className={buttonClass("ferias")}><Palmtree className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /><span>Férias</span></button>
                </div>}
              </section>
                {tasksOpen && <div id="dp-sidebar-organization" className="mt-1 space-y-1">
                  <button type="button" onClick={() => go("planejamento-mensal")} aria-current={screen === "planejamento-mensal" ? "page" : undefined} className={buttonClass("planejamento-mensal")}><CalendarRange className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /><span>Planejamento Mensal</span></button>
                  <button type="button" onClick={() => go("diario-ocorrencias")} aria-current={screen === "diario-ocorrencias" ? "page" : undefined} className={buttonClass("diario-ocorrencias")}><ClipboardList className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /><span>Diário de Ocorrências</span></button>
                  <button type="button" onClick={() => go("tarefas")} aria-current={screen === "tarefas" ? "page" : undefined} className={buttonClass("tarefas")}><ListChecks className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /><span>Tarefas</span></button>
                </div>}
              </section>
            </>
          ) : (
            <>
              {([
                ["dashboard", LayoutDashboard, "Dashboard"], ["kpis", ChartColumn, "KPIs"], ["comparativos", UsersRound, "Comparativos"], ["relatorios", FileText, "Relatórios"],
                ["fechamento-ponto", CalendarClock, "Fechamento"], ["importar-cartao-ponto", Upload, "Importar Cartão Ponto"], ["lancamentos", ClipboardList, "Lançamentos"], ["banco-horas", Clock3, "Banco de Horas"], ["pagamentos", BadgeDollarSign, "Pagamentos"], ["ocorrencias", CalendarX, "Faltas e Folgas"], ["atestados", ClipboardCheck, "Declarações e Atestados"],
                ["empresas", Building2, "Empresas"], ["funcionarios", UsersRound, "Funcionários"], ["cargos", BriefcaseBusiness, "Cargos"], ["departamentos", Building2, "Departamentos"], ["jornadas-escalas", CalendarDays, "Jornadas"], ["planejamento-mensal", CalendarRange, "Planejamento Mensal"], ["diario-ocorrencias", ClipboardList, "Diário de Ocorrências"], ["tarefas", FileText, "Tarefas"], ["ferias", Palmtree, "Férias"],
              ] as [ScreenKey, LucideIcon, string][]).map(([key, Icon, label]) => <button key={key} type="button" onClick={() => go(key)} className={buttonClass(key)} title={label} aria-label={label} aria-current={screen === key ? "page" : undefined}><Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} /></button>)}
            </>
          )}
        </nav>
        <SidebarProfile collapsed={collapsed} onNavigate={go} />
      </aside>

      <main className={`dp-app-main transition-[padding] duration-200 ${collapsed ? "lg:pl-0 lg:pt-16" : "lg:pl-64"}`}>
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
    setRole(profile?.role === "consulta" ? "Consulta" : profile?.role === "convidado" ? "Convidado" : "Usuário RH");
  })(); }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/login";
  };
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "DP";

  return (
    <div className="dp-sidebar-footer border-t border-sidebar-border p-3">
      <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-2"}`}>
        <div className={`flex min-w-0 flex-1 items-center ${collapsed ? "flex-col gap-2" : "gap-3"}`}>
          <div className="dp-sidebar-avatar flex h-10 w-10 shrink-0 items-center justify-center text-sm font-semibold" aria-hidden="true">{initials}</div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">{name}</p>
              <p className="mt-0.5 truncate text-xs text-sidebar-foreground/80">{role}</p>
            </div>
          )}
        </div>
        <div className={`flex shrink-0 items-center ${collapsed ? "flex-col gap-1" : "gap-1"}`}>
          <button
            type="button"
            onClick={() => onNavigate("parametros")}
            className="flex h-10 w-10 items-center justify-center text-sidebar-foreground/80 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            title="Configurações"
            aria-label="Configurações"
          >
            <Settings className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className={`dp-sidebar-logout flex min-h-10 items-center justify-center gap-2 px-2 text-sm font-medium transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${collapsed ? "w-10" : ""}`}
            title="Sair do sistema"
            aria-label="Sair do sistema"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

function DashboardHome() {
  const navigate = useNavigate();
  const [companyFilter, setCompanyFilter] = useState("");
  const [metrics, setMetrics] = useState({ employees: 0, overtime: 0, absenceDays: 0, certificates: 0, absenteeism: 0, turnover: 0, admissions: 0, terminations: 0, bankBalance: 0, period: "Nenhuma competência" });
  const [departments, setDepartments] = useState<Array<{ name: string; employees: number; minutes: number }>>([]);
  const [positiveBalances, setPositiveBalances] = useState<Array<{ name: string; minutes: number }>>([]);
  const [individualDebits, setIndividualDebits] = useState<Array<{ name: string; minutes: number }>>([]);
  const [occurrenceHours, setOccurrenceHours] = useState<Array<{ name: string; minutes: number }>>([]);
  const [absencePeople, setAbsencePeople] = useState<Array<{ name: string; count: number }>>([]);
  const [folgaPeople, setFolgaPeople] = useState<Array<{ name: string; count: number }>>([]);
  const [declarationPeople, setDeclarationPeople] = useState<Array<{ name: string; count: number }>>([]);
  const [certificatePeople, setCertificatePeople] = useState<Array<{ name: string; count: number }>>([]);
  const [competenceNote, setCompetenceNote] = useState("");
  const [competenceNotes, setCompetenceNotes] = useState<Array<{ id: string; note: string; created_at: string; completed: boolean }>>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState("");
  const [noteActionId, setNoteActionId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState("Usuário RH");
  const [userRoleLabel, setUserRoleLabel] = useState("Usuário RH");

  useEffect(() => {
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await navigate({ to: "/login", replace: true });
        return;
      }
      setUserEmail(sessionData.session.user.email || "Usuário RH");
      const db = supabase;
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("role")
        .eq("id", sessionData.session.user.id)
        .maybeSingle();
      setUserRoleLabel(profile?.role === "consulta" ? "Consulta" : profile?.role === "convidado" ? "Convidado" : "Usuário RH");
      // Carrega primeiro apenas o contexto necessário para a primeira pintura.
      // Os dados operacionais são buscados depois, já filtrados pela competência.
      const [emps, comp] = await Promise.all([
        db.from("employees").select("id,full_name,department_id,work_schedule_id,hire_date,termination_date,status,company_id,departments(name)"),
        db.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("reference_year", { ascending: false }).order("reference_month", { ascending: false }).limit(1),
      ]);

      // Mantém no Dashboard as mesmas datas de desligamento já validadas
      // e usadas na tela de KPIs quando o cadastro antigo está incompleto.
      const confirmedTerminationDates: Record<string, string> = {
        "ANILEI APARECIDO ALVES": "2026-05-22",
        "ANTONIO LUIS LIMA JUNIOR": "2026-07-30",
        "EDINILSON DE ALMEIDA SILVA": "2026-05-29",
        "EMILIO PICOLI FRACAROLLI": "2026-06-05",
        "FELIPE HILMANN": "2026-07-30",
      };
      const allEmployees = (emps.data ?? []).filter((employee: any) => !companyFilter || employee.company_id === companyFilter).map((employee: any) => {
        const normalizedName = String(employee.full_name ?? "")
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
        return {
          ...employee,
          termination_date: employee.termination_date ?? confirmedTerminationDates[normalizedName] ?? null,
        };
      });
      if (comp.data?.[0]?.id) {
        const { data: noteRows, error: notesError } = await db
          .from("dashboard_competence_notes")
          .select("id,note,created_at,completed")
          .eq("period_id", comp.data[0].id)
          .order("created_at", { ascending: true });
        if (notesError) {
          console.error("Falha ao carregar comentários da competência:", notesError.message);
          setCompetenceNotes([]);
        } else {
          setCompetenceNotes((noteRows ?? []).map((row: any) => ({
            id: String(row.id),
            note: String(row.note ?? ""),
            created_at: String(row.created_at ?? ""),
            completed: Boolean(row.completed),
          })));
        }
        setCompetenceNote("");
      } else {
        setCompetenceNotes([]);
        setCompetenceNote("");
      }
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
        holidayRows,
      ] = competence
        ? await Promise.all([
            db.from("overtime_records").select("employee_id,minutes,period_id,launch_type").eq("period_id", competence.id),
            db.from("occurrences").select("employee_id,quantity,unit,occurrence_type_id,occurrence_date,end_date,period_id,occurrence_types(code)").eq("period_id", competence.id),
            db.from("medical_certificates").select("id,employee_id,start_date,end_date,days").lte("start_date", competence.end_date).gte("end_date", competence.start_date),
            db.from("time_records").select("employee_id,period_id,expected_minutes,worked_minutes").eq("period_id", competence.id),
            db.from("bank_hours").select("employee_id,period_id,minutes,kind,adjustment_direction").eq("period_id", competence.id),
            db.from("work_schedules").select("id,weekly_minutes"),
            db.from("point_closing_overrides").select("employee_id,period_id,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes").eq("period_id", competence.id),
            db.from("holidays").select("holiday_date").eq("is_demo", false),
          ])
        : [
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
            { data: [], error: null },
          ];
      const scheduleMap = new Map((scheduleRows.data ?? []).map((s: any) => [String(s.id), Number(s.weekly_minutes || 0) / 5]));
      const additionalHolidayDates = new Set(
        (holidayRows.data ?? []).map((row: any) => String(row.holiday_date).slice(0, 10)),
      );
      const dailyMinutes = (employeeId: string) => {
        const employee = employees.find((e: any) => e.id === employeeId);
        return employee?.work_schedule_id ? (scheduleMap.get(String(employee.work_schedule_id)) ?? 528) : 528;
      };
      const overtimeData = overtimeRows.data ?? [];
      const occurrences = occ.data ?? [];
      const overrides = (overrideRows.data ?? []) as any[];
      const overrideByEmployee = new Map<string, any>(
        overrides.map((row: any) => [String(row.employee_id), row]),
      );

      // A correção manual substitui os lançamentos de HE da mesma competência.
      // A interjornada permanece informativa e não entra no total de horas extras.
      const operationalOvertime = competence
        ? overtimeData.filter((row: any) =>
            row.period_id === competence.id &&
            activeEmployeeIds.has(row.employee_id) &&
            !overrideByEmployee.has(String(row.employee_id))
          )
        : overtimeData.filter((row: any) =>
            activeEmployeeIds.has(row.employee_id) &&
            !overrideByEmployee.has(String(row.employee_id))
          );
      const overrideOvertime = overrides
        .filter((row: any) => activeEmployeeIds.has(String(row.employee_id)))
        .flatMap((row: any) => [
          { employee_id: row.employee_id, launch_type: "HE_60", minutes: row.he_60_minutes },
          { employee_id: row.employee_id, launch_type: "HE_60_NOTURNO", minutes: row.he_60_night_minutes },
          { employee_id: row.employee_id, launch_type: "HE_100", minutes: row.he_100_minutes },
          { employee_id: row.employee_id, launch_type: "ADICIONAL_NOTURNO", minutes: row.he_20_minutes },
        ]);
      const currentOvertime = [...operationalOvertime, ...overrideOvertime]
        .filter((row: any) => String(row.launch_type ?? "").toUpperCase() !== "INTERJORNADA_50");
      const overtime = currentOvertime.reduce(
        (sum: number, row: any) => sum + Math.abs(Number(row.minutes || 0)),
        0,
      );

      const periodId = competence?.id ?? null;
      const currentOccurrences = occurrences.filter((x: any) => periodId && x.period_id === periodId && activeEmployeeIds.has(x.employee_id));
      const codeOf = (x: any) => String(x.occurrence_types?.code ?? "").toLowerCase();
      const absenceRows = currentOccurrences.filter((x: any) => ["falta", "falta_justificada", "falta_injustificada"].includes(codeOf(x)));
      const folgaRows = currentOccurrences.filter((x: any) => ["folga_abonada", "folga_descontada"].includes(codeOf(x)));
      const declarationRows = currentOccurrences.filter((x: any) => codeOf(x) === "declaracao_horas");
      const absenceDays = absenceRows.reduce((sum: number, x: any) => sum + Number(x.quantity || 0), 0);
      const employeeMap = new Map(allEmployees.map((e: any) => [String(e.id), String(e.full_name || "Funcionário")]));
      const countByEmployee = (rows: any[]) => {
        const counts = new Map<string, number>();
        rows.forEach((row: any) => counts.set(String(row.employee_id), (counts.get(String(row.employee_id)) ?? 0) + 1));
        return [...counts.entries()].map(([id, count]) => ({ name: employeeMap.get(id) || "Funcionário", count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "pt-BR"));
      };
      setAbsencePeople(countByEmployee(absenceRows));
      setFolgaPeople(countByEmployee(folgaRows));
      setDeclarationPeople(countByEmployee(declarationRows));
      const declarationMinutes = declarationRows
        .reduce((sum: number, x: any) => sum + Math.round(Number(x.quantity || 0) * 60), 0);
      const certificateRows = (cert.data ?? []).filter((x: any) => {
        if (!competence) return false;
        return x.start_date <= competence.end_date && x.end_date >= competence.start_date && activeEmployeeIds.has(x.employee_id);
      });
      const minutesForOccurrence = (row: any) => {
        const unit = String(row.unit ?? "dias").toLowerCase();
        const quantity = Number(row.quantity || 0);
        return Math.round(unit.startsWith("dia") ? quantity * dailyMinutes(String(row.employee_id)) : unit.startsWith("hor") ? quantity * 60 : quantity);
      };
      const overriddenIds = new Set(overrides.map((row: any) => String(row.employee_id)));
      const occurrenceAbsenceMinutes = absenceRows
        .filter((row: any) => !overriddenIds.has(String(row.employee_id)))
        .reduce((sum: number, row: any) => sum + minutesForOccurrence(row), 0)
        + overrides.reduce((sum: number, row: any) => sum + Math.round(Number(row.absence_quantity || 0) * dailyMinutes(String(row.employee_id))), 0);
      const occurrenceFolgaMinutes = folgaRows.reduce((sum: number, row: any) => sum + minutesForOccurrence(row), 0);
      const occurrenceCertificateMinutes = certificateRows
        .filter((row: any) => !overriddenIds.has(String(row.employee_id)))
        .reduce((sum: number, row: any) => sum + Math.round(Number(row.days || 0) * dailyMinutes(String(row.employee_id))), 0)
        + overrides.reduce((sum: number, row: any) => sum + Number(row.certificate_minutes || 0), 0);
      const occurrenceDeclarationMinutes = declarationRows
        .filter((row: any) => !overriddenIds.has(String(row.employee_id)))
        .reduce((sum: number, row: any) => sum + minutesForOccurrence(row), 0)
        + overrides.reduce((sum: number, row: any) => sum + Number(row.declaration_minutes || 0), 0);
      setOccurrenceHours([
        { name: "Faltas", minutes: occurrenceAbsenceMinutes },
        { name: "Folgas", minutes: occurrenceFolgaMinutes },
        { name: "Atestados", minutes: occurrenceCertificateMinutes },
        { name: "Declarações de horas", minutes: occurrenceDeclarationMinutes },
      ]);
      const certificateDays = certificateRows.reduce((sum: number, x: any) => sum + Number(x.days || 0), 0);
      setCertificatePeople(countByEmployee(certificateRows));
      const currentTime = (timeRows.data ?? []).filter((x: any) => (!periodId || x.period_id === periodId) && activeEmployeeIds.has(x.employee_id));
      // Reutiliza overrideByEmployee criado junto às fontes do Dashboard.
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
            return sum + Math.round(countWorkingWeekdays(start, end, additionalHolidayDates) * dailyMinutes(employee.id));
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
          Math.round(Number(override.absence_quantity || 0) * dailyMinutes(override.employee_id))
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
        if (department) department.minutes += Math.abs(Number(x.minutes || 0));
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
      const balancesByEmployee = await balancesByEmployees(employees.map((employee: any) => String(employee.id)));
      const positiveResults = employees.map((employee: any) => {
        const balances = balancesByEmployee[String(employee.id)] ?? [];
        const monthly = balances.find((item: any) => item.period.id === targetPeriodId);
        if (!monthly) return null;
        const payableMinutes = Number(monthly.dashboardBalance || 0);
        return payableMinutes > 0 ? { name: employee.full_name, minutes: payableMinutes } : null;
      });
      const debitByEmployee = new Map<string, number>();
      (bankRows.data ?? []).forEach((row: any) => {
        const employeeId = String(row.employee_id);
        if (!targetPeriodId || row.period_id !== targetPeriodId || !activeEmployeeIds.has(employeeId) ||
            row.kind !== "debito" || overrideByEmployee.has(employeeId)) return;
        debitByEmployee.set(employeeId, (debitByEmployee.get(employeeId) ?? 0) + Math.abs(Number(row.minutes || 0)));
      });
      overrides.forEach((row: any) => {
        const employeeId = String(row.employee_id);
        if (!targetPeriodId || row.period_id !== targetPeriodId || !activeEmployeeIds.has(employeeId)) return;
        const minutes = Math.abs(Number(row.debit_minutes || 0));
        if (minutes > 0) debitByEmployee.set(employeeId, (debitByEmployee.get(employeeId) ?? 0) + minutes);
      });
      setIndividualDebits([...debitByEmployee.entries()]
        .filter(([, minutes]) => minutes > 0)
        .map(([id, minutes]) => ({ name: employeeMap.get(id) || "Funcionário", minutes }))
        .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "pt-BR")));
      const bankBalance = positiveResults.reduce((sum, item) => sum + (item?.minutes ?? 0), 0);
      setPositiveBalances(positiveResults.filter((item): item is { name: string; minutes: number } => Boolean(item)).sort((a, b) => b.minutes - a.minutes));
      setMetrics(current => ({ ...current, bankBalance }));
    })();
  }, [companyFilter]);

  async function saveCompetenceNote() {
    const text = competenceNote.trim();
    if (!text) {
      window.alert("Escreva um comentário antes de concluir o checkpoint da competência.");
      return;
    }

    setSavingNote(true);
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      window.alert("Sua sessão expirou. Entre novamente para salvar os comentários.");
      setSavingNote(false);
      return;
    }

    const { data: competence, error: competenceError } = await supabase
      .from("time_periods")
      .select("id")
      .order("reference_year", { ascending: false })
      .order("reference_month", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (competenceError || !competence?.id) {
      window.alert("Não foi possível identificar a competência para salvar os comentários.");
      setSavingNote(false);
      return;
    }

    const { data: savedRow, error } = await supabase
      .from("dashboard_competence_notes")
      .insert({
        period_id: competence.id,
        note: text,
        updated_by: sessionData.session.user.id,
      })
      .select("id,note,created_at,completed")
      .single();

    if (error || !savedRow) {
      window.alert("O comentário não foi salvo. Verifique se a migração de comentários múltiplos foi aplicada no banco de dados. " + (error?.message ?? ""));
      setSavingNote(false);
      return;
    }

    setCompetenceNotes(current => [...current, {
      id: String(savedRow.id),
      note: String(savedRow.note ?? text),
      created_at: String(savedRow.created_at ?? new Date().toISOString()),
      completed: Boolean(savedRow.completed),
    }]);
    setCompetenceNote("");
    setSavingNote(false);
  }

  async function updateCompetenceNote(id: string) {
    const text = editingNoteText.trim();
    if (!text) {
      window.alert("O comentário não pode ficar vazio.");
      return;
    }
    setNoteActionId(id);
    const { data, error } = await supabase
      .from("dashboard_competence_notes")
      .update({ note: text })
      .eq("id", id)
      .select("id,note,created_at,completed")
      .single();
    if (error || !data) {
      window.alert("Não foi possível atualizar o comentário. " + (error?.message ?? ""));
      setNoteActionId(null);
      return;
    }
    setCompetenceNotes(rows => rows.map(row => row.id === id ? {
      id: String(data.id),
      note: String(data.note ?? text),
      created_at: String(data.created_at ?? row.created_at),
      completed: Boolean(data.completed),
    } : row));
    setEditingNoteId(null);
    setEditingNoteText("");
    setNoteActionId(null);
  }

  async function deleteCompetenceNote(id: string) {
    if (!window.confirm("Deseja excluir este comentário? Essa ação não pode ser desfeita.")) return;
    setNoteActionId(id);
    const { error } = await supabase
      .from("dashboard_competence_notes")
      .delete()
      .eq("id", id);
    if (error) {
      window.alert("Não foi possível excluir o comentário. " + error.message);
      setNoteActionId(null);
      return;
    }
    setCompetenceNotes(rows => rows.filter(row => row.id !== id));
    if (editingNoteId === id) {
      setEditingNoteId(null);
      setEditingNoteText("");
    }
    setNoteActionId(null);
  }

  async function toggleCompetenceNoteCompleted(id: string, completed: boolean) {
    setNoteActionId(id);
    const { data, error } = await supabase
      .from("dashboard_competence_notes")
      .update({ completed })
      .eq("id", id)
      .select("id,completed")
      .single();
    if (error || !data) {
      window.alert("Não foi possível atualizar o status do comentário. " + (error?.message ?? ""));
      setNoteActionId(null);
      return;
    }
    setCompetenceNotes(rows => rows.map(row => row.id === id ? { ...row, completed: Boolean(data.completed) } : row));
    setNoteActionId(null);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const cards = [
    ["Funcionários ativos", String(metrics.employees), UsersRound, "ativos na competência"],
    ["Absenteísmo", metrics.absenteeism.toFixed(1) + "%", CalendarX, "horas perdidas ÷ previstas"],
    ["Turnover", metrics.turnover.toFixed(1) + "%", TrendingUp, metrics.admissions + " admissões · " + metrics.terminations + " desligamentos"],
    ["Banco de horas", fmt(metrics.bankBalance), WalletCards, "saldo positivo disponível"],
  ] as const;

  return (
    <div className="min-h-screen bg-background">
        <header className="dp-screen-topbar flex h-14 items-center border-b bg-background px-4 sm:px-6">
          <span className="text-xs text-muted-foreground">RH / Visão geral</span>
        </header>
        <div className="dp-screen-content mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
          <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7">
            <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-56 w-56 rounded-full bg-[#06CAA0]/20 blur-3xl" />
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7cebd0]">ANÁLISE • DP SUCCESS</p>
                <h1 style={{ color: "#ffffff", WebkitTextFillColor: "#ffffff" }} className="!text-white text-2xl font-semibold tracking-tight sm:text-[30px]">Dashboard</h1>
                <p className="mt-2 text-sm text-slate-200">Resumo executivo de RH e DP da competência atual.</p>
              </div>
              <div className="min-w-[190px] rounded-xl border border-white/15 bg-white/[0.08] px-5 py-3 backdrop-blur-sm">
                <p className="text-xs font-medium text-slate-200">Competência atual</p>
                <p className="mt-1 text-lg font-semibold text-white">{metrics.period}</p>
              </div>
            </div>
          </section>
          <Card className="mt-6 p-4"><label className="grid max-w-sm gap-1.5 text-sm font-medium"><span>Empresa</span><CompanyFilter value={companyFilter} onChange={setCompanyFilter} /></label><p className="mt-2 text-xs text-muted-foreground">O filtro afeta somente os indicadores e listas exibidos no Dashboard; não altera lançamentos nem competências fechadas.</p></Card>
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(([label, value, Icon, detail]) => (
              <Card key={label} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
                  </div>
                  <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Icon className="h-5 w-5" /></div>
                </div>
              </Card>
            ))}
          </section>
          <section className="mt-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Resumo da competência</p>
              <h2 className="mt-1 text-xl font-bold">Ocorrências por funcionário</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dp-success:navigate", { detail: "ocorrencias" }))} className="text-left">
                <Card className="h-full p-3.5 transition-shadow hover:shadow-md">
                  <CalendarX className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Faltas</p>
                  <p className="mt-1 text-lg font-bold">{absencePeople.reduce((sum, item) => sum + item.count, 0)} registros</p>
                  <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t pt-2">
                    {absencePeople.map(item => <div key={item.name} className="flex items-start justify-between gap-2 text-[11px]"><span className="min-w-0 truncate font-medium">{item.name}</span><span className="shrink-0 font-semibold">{item.count}</span></div>)}
                    {!absencePeople.length && <p className="text-[11px] text-muted-foreground">Nenhuma falta registrada.</p>}
                  </div>
                </Card>
              </button>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dp-success:navigate", { detail: "ocorrencias" }))} className="text-left">
                <Card className="h-full p-3.5 transition-shadow hover:shadow-md">
                  <CalendarCheck className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Folgas</p>
                  <p className="mt-1 text-lg font-bold">{folgaPeople.reduce((sum, item) => sum + item.count, 0)} registros</p>
                  <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t pt-2">
                    {folgaPeople.map(item => <div key={item.name} className="flex items-start justify-between gap-2 text-[11px]"><span className="min-w-0 truncate font-medium">{item.name}</span><span className="shrink-0 font-semibold">{item.count}</span></div>)}
                    {!folgaPeople.length && <p className="text-[11px] text-muted-foreground">Nenhuma folga registrada.</p>}
                  </div>
                </Card>
              </button>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dp-success:navigate", { detail: "atestados" }))} className="text-left">
                <Card className="h-full p-3.5 transition-shadow hover:shadow-md">
                  <ClipboardCheck className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Declarações</p>
                  <p className="mt-1 text-lg font-bold">{declarationPeople.reduce((sum, item) => sum + item.count, 0)} registros</p>
                  <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t pt-2">
                    {declarationPeople.map(item => <div key={item.name} className="flex items-start justify-between gap-2 text-[11px]"><span className="min-w-0 truncate font-medium">{item.name}</span><span className="shrink-0 font-semibold">{item.count}</span></div>)}
                    {!declarationPeople.length && <p className="text-[11px] text-muted-foreground">Nenhuma declaração registrada.</p>}
                  </div>
                </Card>
              </button>
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("dp-success:navigate", { detail: "atestados" }))} className="text-left">
                <Card className="h-full p-3.5 transition-shadow hover:shadow-md">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  <p className="mt-2 text-xs text-muted-foreground">Atestados</p>
                  <p className="mt-1 text-lg font-bold">{certificatePeople.reduce((sum, item) => sum + item.count, 0)} registros</p>
                  <div className="mt-2 max-h-28 space-y-1 overflow-y-auto border-t pt-2">
                    {certificatePeople.map(item => <div key={item.name} className="flex items-start justify-between gap-2 text-[11px]"><span className="min-w-0 truncate font-medium">{item.name}</span><span className="shrink-0 font-semibold">{item.count}</span></div>)}
                    {!certificatePeople.length && <p className="text-[11px] text-muted-foreground">Nenhum atestado registrado.</p>}
                  </div>
                </Card>
              </button>
            </div>
          </section>

          <section className="mt-6">
            <Card className="p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-primary">Registro da competência</p>
                  <h2 className="mt-1 text-xl font-bold">Comentários da competência</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Registre observações importantes sobre o fechamento desta competência.</p>
                </div>
                {competenceNotes.length > 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"><ClipboardCheck className="h-4 w-4" />{competenceNotes.length} {competenceNotes.length === 1 ? "comentário salvo" : "comentários salvos"}</span>}
              </div>
              {competenceNotes.length > 0 && (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {competenceNotes.map((item, index) => (
                    <article key={item.id} className={`rounded-xl border p-4 shadow-sm transition-colors ${item.completed ? "border-primary/40 bg-primary/[0.04]" : "bg-background"}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.completed ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                          {item.completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                          {item.completed ? "Concluído" : `Registro ${index + 1}`}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {item.created_at && !Number.isNaN(new Date(item.created_at).getTime())
                            ? new Date(item.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
                            : ""}
                        </span>
                      </div>
                      {editingNoteId === item.id ? (
                        <div className="mt-3 space-y-2">
                          <textarea value={editingNoteText} onChange={event => setEditingNoteText(event.target.value)} rows={3} className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                          <div className="flex flex-wrap justify-end gap-2">
                            <button type="button" onClick={() => { setEditingNoteId(null); setEditingNoteText(""); }} disabled={noteActionId === item.id} className="rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Cancelar</button>
                            <button type="button" onClick={() => void updateCompetenceNote(item.id)} disabled={noteActionId === item.id || !editingNoteText.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">
                              <Save className="h-3.5 w-3.5" />{noteActionId === item.id ? "Salvando..." : "Salvar edição"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className={`mt-3 whitespace-pre-wrap break-words text-sm leading-6 ${item.completed ? "text-muted-foreground" : ""}`}>{item.note}</p>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                        <button type="button" onClick={() => void toggleCompetenceNoteCompleted(item.id, !item.completed)} disabled={noteActionId === item.id || editingNoteId === item.id} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50">
                          {item.completed ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          {item.completed ? "Reabrir" : "Marcar como concluído"}
                        </button>
                        <button type="button" onClick={() => { setEditingNoteId(item.id); setEditingNoteText(item.note); }} disabled={noteActionId === item.id || editingNoteId !== null} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50">
                          <Pencil className="h-3.5 w-3.5" />Editar
                        </button>
                        <button type="button" onClick={() => void deleteCompetenceNote(item.id)} disabled={noteActionId === item.id || editingNoteId === item.id} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/5 disabled:opacity-50">
                          <Trash2 className="h-3.5 w-3.5" />{noteActionId === item.id ? "Processando..." : "Excluir"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <textarea
                value={competenceNote}
                onChange={event => setCompetenceNote(event.target.value)}
                placeholder="Escreva uma nova observação sobre o fechamento desta competência..."
                rows={3}
                className="mt-4 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="mt-3 flex justify-end">
                <button type="button" onClick={() => void saveCompetenceNote()} disabled={savingNote || !competenceNote.trim()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60">
                  <Save className="h-4 w-4" />
                  {savingNote ? "Salvando..." : "Adicionar comentário"}
                </button>
              </div>
            </Card>
          </section>

          <section className="mt-6">
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Ocorrências da competência</p>
              <h2 className="mt-1 text-xl font-bold">Horas por tipo de ocorrência</h2>
              <p className="mt-1 text-xs text-muted-foreground">Comparativo de horas de faltas, folgas, atestados e declarações, considerando a competência e a empresa selecionadas.</p>
              <div className="mt-5 grid items-center gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
                <div className="relative mx-auto h-52 w-52">
                  <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label="Gráfico de rosca das horas por tipo de ocorrência">
                    {(() => {
                      const colors = ["#06CAA0", "#3B82F6", "#8B5CF6", "#F59E0B"];
                      const total = occurrenceHours.reduce((sum, item) => sum + item.minutes, 0);
                      let offset = 0;
                      return occurrenceHours.map((item, index) => {
                        const fraction = total > 0 ? item.minutes / total : 0;
                        const dash = fraction * 2 * Math.PI * 72;
                        const circle = <circle key={item.name} cx="100" cy="100" r="72" fill="none" stroke={colors[index]} strokeWidth="28" strokeDasharray={`${dash} ${2 * Math.PI * 72 - dash}`} strokeDashoffset={-offset} />;
                        offset += dash;
                        return circle;
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs text-muted-foreground">Total de horas</span>
                    <span className="text-xl font-bold tabular-nums">{fmt(occurrenceHours.reduce((sum, item) => sum + item.minutes, 0))}</span>
                  </div>
                </div>
                <div className="min-w-0 space-y-3">
                  {occurrenceHours.map((item, index) => {
                    const colors = ["#06CAA0", "#3B82F6", "#8B5CF6", "#F59E0B"];
                    const total = occurrenceHours.reduce((sum, value) => sum + value.minutes, 0);
                    const percent = total > 0 ? Math.round(item.minutes / total * 100) : 0;
                    return <div key={item.name} className="flex items-center gap-3 border-b pb-3 last:border-0">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: colors[index] }} />
                      <span className="min-w-0 flex-1 text-sm font-medium">{item.name}</span>
                      <span className="text-sm font-semibold tabular-nums">{fmt(item.minutes)}</span>
                      <span className="w-10 text-right text-xs text-muted-foreground">{percent}%</span>
                    </div>;
                  })}
                </div>
              </div>
            </Card>
          </section>

          <section className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
            <Card className="flex h-[390px] min-h-0 flex-col p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Visão rápida</p>
              <h2 className="mt-1 text-xl font-bold">Horas extras por departamento</h2>
              <p className="mt-1 text-xs text-muted-foreground">Onde estão concentradas as horas extras da competência.</p>
              <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
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
            <Card className="flex h-[390px] min-h-0 flex-col p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">Controle de horas</p>
              <h2 className="mt-1 text-xl font-bold">Débitos individuais na competência</h2>
              <p className="mt-1 text-xs text-muted-foreground">Débitos registrados por funcionário na competência selecionada.</p>
              <div className="mt-4 grid min-h-0 flex-1 items-center gap-4 sm:grid-cols-[170px_minmax(0,1fr)]">
                <div className="relative mx-auto h-40 w-40">
                  <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" role="img" aria-label="Gráfico de rosca dos débitos por funcionário">
                    {(() => {
                      const top = individualDebits.slice(0, 5);
                      const other = individualDebits.slice(5).reduce((sum, item) => sum + item.minutes, 0);
                      const values = [...top, ...(other > 0 ? [{ name: "Outros", minutes: other }] : [])];
                      const colors = ["#06CAA0", "#3B82F6", "#8B5CF6", "#F97316", "#EF4444", "#FBBF24"];
                      const total = values.reduce((sum, item) => sum + item.minutes, 0);
                      let offset = 0;
                      return values.map((item, index) => {
                        const fraction = total > 0 ? item.minutes / total : 0;
                        const dash = fraction * 2 * Math.PI * 72;
                        const circle = <circle key={item.name} cx="100" cy="100" r="72" fill="none" stroke={colors[index % colors.length]} strokeWidth="28" strokeDasharray={`${dash} ${2 * Math.PI * 72 - dash}`} strokeDashoffset={-offset} />;
                        offset += dash;
                        return circle;
                      });
                    })()}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs text-muted-foreground">Total débitos</span>
                    <span className="text-lg font-bold tabular-nums">{fmt(-individualDebits.reduce((sum, item) => sum + item.minutes, 0))}</span>
                  </div>
                </div>
                <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
                  {(() => {
                    const top = individualDebits.slice(0, 5);
                    const other = individualDebits.slice(5).reduce((sum, item) => sum + item.minutes, 0);
                    const values = [...top, ...(other > 0 ? [{ name: "Outros", minutes: other }] : [])];
                    const colors = ["#06CAA0", "#3B82F6", "#8B5CF6", "#F97316", "#EF4444", "#FBBF24"];
                    const total = values.reduce((sum, item) => sum + item.minutes, 0);
                    return values.map((item, index) => <div key={item.name} className="flex items-center gap-2 border-b pb-2 text-sm last:border-0">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{fmt(-item.minutes)}</span>
                      <span className="w-9 text-right text-xs text-muted-foreground">{total > 0 ? Math.round(item.minutes / total * 100) : 0}%</span>
                    </div>);
                  })()}
                  {!individualDebits.length && <p className="py-5 text-sm text-muted-foreground">Nenhum débito individual registrado nesta competência.</p>}
                </div>
              </div>
              <div className="mt-4 border-t pt-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">Total de débitos</span>
                  <span className="font-bold tabular-nums">{fmt(-individualDebits.reduce((sum, item) => sum + item.minutes, 0))}</span>
                </div>
              </div>
            </Card>
          </section>

        </div>
    </div>
  );
}
