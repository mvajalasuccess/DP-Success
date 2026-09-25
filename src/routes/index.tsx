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

export const Route = createFileRoute("/")({ component: Dashboard });

type ScreenKey = "dashboard" | "funcionarios" | "cargos" | "departamentos" | "jornadas-escalas" | "fechamento-ponto" | "lancamentos" | "banco-horas" | "atestados" | "ocorrencias" | "comparativos" | "kpis" | "relatorios" | "parametros";

const screenComponents: Record<string, ComponentType> = {
  funcionarios: Employees, cargos: Positions, departamentos: Departments, "jornadas-escalas": Schedules,
  "fechamento-ponto": PointClosing, lancamentos: Launches, "banco-horas": BankHours,
  atestados: Atestados, ocorrencias: Ocorrencias, comparativos: Comparativos, kpis: Kpis,
  relatorios: Relatorios, parametros: Parametros,
};

const companyNav: Array<[string, ScreenKey]> = [
  ["Cargos", "cargos"], ["Departamentos", "departamentos"], ["Jornadas / Escalas", "jornadas-escalas"],
];
const mainNav: Array<[string, ScreenKey]> = [
  ["Funcionários", "funcionarios"], ["Fechamento de Ponto", "fechamento-ponto"], ["Lançamentos", "lancamentos"],
  ["Banco de Horas", "banco-horas"], ["Atestados", "atestados"], ["Faltas e Ocorrências", "ocorrencias"],
  ["Relatórios", "relatorios"], ["Comparativos", "comparativos"], ["KPIs", "kpis"], ["Parâmetros", "parametros"],
];

function fmt(minutes: number) {
  const sign = minutes < 0 ? "-" : "+";
  const value = Math.abs(Math.round(minutes));
  return sign + Math.floor(value / 60) + "h " + String(value % 60).padStart(2, "0") + "m";
}

function Dashboard() {
  const [screen, setScreen] = useState<ScreenKey>("dashboard");
  const Screen = screen === "dashboard" ? null : screenComponents[screen];

  if (Screen) return <Screen />;
  return <DashboardHome onNavigate={setScreen} />;
}

function DashboardHome({ onNavigate }: { onNavigate: (screen: ScreenKey) => void }) {
  const [metrics, setMetrics] = useState({ employees: 0, overtime: 0, bank: 0, absence: 0, certificates: 0, absenteeism: 0, period: "Nenhuma competência" });
  const [top, setTop] = useState<Array<{ name: string; minutes: number }>>([]);
  const [departments, setDepartments] = useState<Array<{ name: string; employees: number; minutes: number }>>([]);
  const [alerts, setAlerts] = useState<string[]>([]);
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
      const [emps, comp, overtimeRows, bankRows, occ, cert] = await Promise.all([
        db.from("employees").select("id,full_name,department_id,departments(name)").eq("status", "ativo"),
        db.from("time_periods").select("id,reference_year,reference_month,status").order("reference_year", { ascending: false }).order("reference_month", { ascending: false }).limit(1),
        db.from("overtime_records").select("employee_id,minutes,period_id").order("reference_date", { ascending: false }),
        db.from("bank_hours").select("employee_id,balance_minutes,entry_date").order("entry_date", { ascending: false }),
        db.from("occurrences").select("employee_id,quantity,unit,occurrence_type_id,occurrence_types(code)").order("occurrence_date", { ascending: false }),
        db.from("medical_certificates").select("id"),
      ]);

      const employees = emps.data ?? [];
      const competence = comp.data?.[0];
      const overtimeData = overtimeRows.data ?? [];
      const bankData = bankRows.data ?? [];
      const occurrences = occ.data ?? [];

      const currentOvertime = competence
        ? overtimeData.filter((x: any) => x.period_id === competence.id)
        : overtimeData;
      const overtime = currentOvertime.reduce((sum: number, row: any) => sum + (row.minutes || 0), 0);

      const latestBankByEmployee = new Map<string, number>();
      for (const row of bankData as any[]) {
        if (!latestBankByEmployee.has(row.employee_id)) {
          latestBankByEmployee.set(row.employee_id, row.balance_minutes || 0);
        }
      }
      const bank = employees.reduce(
        (sum: number, row: any) => sum + (latestBankByEmployee.get(row.id) || 0),
        0,
      );

      const absence = occurrences
        .filter((x: any) => {
          const code = String(x.occurrence_types?.code ?? "").toLowerCase();
          return code === "falta" || code === "absence";
        })
        .reduce((sum: number, x: any) => {
          const quantity = Number(x.quantity || 0);
          const unit = String(x.unit ?? "").toLowerCase();
          if (unit === "minutos" || unit === "minutes") return sum + quantity;
          if (unit === "horas" || unit === "hours") return sum + quantity * 60;
          if (unit === "dias" || unit === "days") return sum + quantity * 480;
          return sum;
        }, 0);

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
      const periodLabel = competence
        ? `Competência ${String(competence.reference_month).padStart(2, "0")}/${competence.reference_year}`
        : "Nenhuma competência";
      setMetrics({
        employees: employees.length,
        overtime,
        bank,
        absence,
        certificates: (cert.data ?? []).length,
        absenteeism: employees.length > 0
          ? Math.round((absence / (employees.length * 22 * 480)) * 1000) / 10
          : 0,
        period: periodLabel,
      });
      setAlerts(competence && competence.status !== "FECHADA" ? ["Competência não fechada"] : []);
    })();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const cards = [
    ["Funcionários ativos", String(metrics.employees), Users],
    ["Horas extras", fmt(metrics.overtime), Clock3],
    ["Saldo do banco", fmt(metrics.bank), WalletCards],
    ["Faltas", Math.round(metrics.absence / 60 * 100) / 100 + "h", AlertTriangle],
    ["Atestados", String(metrics.certificates), FileText],
    ["Absenteísmo", metrics.absenteeism.toFixed(1) + "%", Gauge],
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-sidebar lg:block">
        <div className="flex h-20 items-center gap-3 border-b px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Clock3 className="h-5 w-5" /></div>
          <div><div className="font-display text-lg font-bold">DP Success</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">RH · DP · Gestão</div></div>
        </div>
        <nav className="space-y-1 p-3 text-sm">
          <button type="button" onClick={() => onNavigate("dashboard")} className="block w-full rounded-lg bg-sidebar-primary px-3 py-2.5 text-left text-sidebar-primary-foreground">Dashboard</button>
          {mainNav.slice(0, 1).map(([label, key]) => <button key={key} type="button" onClick={() => onNavigate(key)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sidebar-foreground/75 hover:bg-sidebar-accent">{label}</button>)}
          <div className="pt-2">
            <button type="button" onClick={() => setCompanyOpen(!companyOpen)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sidebar-foreground/80 hover:bg-sidebar-accent"><span className="flex items-center gap-2"><Building2 className="h-4 w-4" />Empresas</span><ChevronDown className={`h-4 w-4 transition-transform ${companyOpen ? "rotate-180" : ""}`} /></button>
            {companyOpen && <div className="ml-3 mt-1 space-y-1 border-l pl-3">{companyNav.map(([label, key]) => <button key={key} type="button" onClick={() => onNavigate(key)} className="block w-full rounded-lg px-3 py-2 text-left text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent">{label}</button>)}</div>}
          </div>
          <div className="my-2 border-t border-sidebar-border" />
          {mainNav.slice(1).map(([label, key]) => <button key={key} type="button" onClick={() => onNavigate(key)} className="block w-full rounded-lg px-3 py-2.5 text-left text-sidebar-foreground/75 hover:bg-sidebar-accent">{label}</button>)}
        </nav>
      </aside>

      <main className="lg:pl-64">
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
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">{cards.map(([label, value, Icon]) => <Card key={label} className="p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></div><p className="mt-4 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{metrics.employees === 0 ? "sem dados cadastrados" : "dados atuais"}</p></Card>)}</div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 p-5"><h2 className="font-display font-bold">Funcionários com mais horas extras</h2><p className="text-xs text-muted-foreground">Dados reais dos lançamentos registrados</p><div className="mt-4 divide-y">{top.map((r, i) => <div key={r.name} className="flex items-center justify-between py-3 text-xs"><span className="w-6 text-muted-foreground">{i + 1}</span><span className="flex-1 font-medium">{r.name}</span><span className="w-24 text-right font-semibold">{fmt(r.minutes)}</span></div>)}{!top.length && <p className="py-6 text-sm text-muted-foreground">Nenhum dado de horas extras registrado.</p>}</div></Card>
            <Card className="p-5"><h2 className="font-display font-bold">Alertas</h2><p className="text-xs text-muted-foreground">Pontos que merecem atenção</p><div className="mt-4 space-y-3">{alerts.length ? alerts.map(x => <div key={x} className="flex gap-3 rounded-lg border p-3"><AlertTriangle className="mt-0.5 h-4 w-4 text-warning" /><p className="text-xs font-semibold">{x}</p></div>) : <p className="py-6 text-sm text-muted-foreground">Nenhum alerta no momento.</p>}</div></Card>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><h2 className="font-display font-bold">Visão por departamento</h2><p className="text-xs text-muted-foreground">Dados reais de funcionários e horas extras</p><div className="mt-4 grid grid-cols-2 gap-3">{departments.map(d => <div key={d.name} className="rounded-xl border p-4"><p className="text-xs font-semibold">{d.name}</p><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><span>{d.employees}<br /><em className="text-muted-foreground not-italic">func.</em></span><span>{fmt(d.minutes)}<br /><em className="text-muted-foreground not-italic">HE</em></span></div></div>)}{!departments.length && <p className="text-sm text-muted-foreground">Nenhum departamento com dados cadastrados.</p>}</div></Card>
            <Card className="p-5"><h2 className="font-display font-bold">Próximas ações</h2><div className="mt-4 grid gap-2"><button type="button" onClick={() => onNavigate("fechamento-ponto")} className="rounded-lg border p-3 text-left text-sm hover:bg-muted">Conferir fechamento de ponto</button><button type="button" onClick={() => onNavigate("lancamentos")} className="rounded-lg border p-3 text-left text-sm hover:bg-muted">Registrar lançamento</button><button type="button" onClick={() => onNavigate("kpis")} className="rounded-lg border p-3 text-left text-sm hover:bg-muted">Analisar KPIs</button><button type="button" onClick={() => onNavigate("relatorios")} className="rounded-lg border p-3 text-left text-sm hover:bg-muted">Gerar relatório</button></div></Card>
          </div>
        </div>
      </main>
    </div>
  );
}
