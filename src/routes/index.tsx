import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, Building2, ChevronDown, Clock3, FileText, Gauge, LogOut, Users, WalletCards, Save, TrendingUp, Settings } from "lucide-react";
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

const peopleNav: Array<[string, ScreenKey]> = [
  ["Funcionários", "funcionarios"],
];

const managementNav: Array<[string, ScreenKey]> = [
  ["Dashboard", "dashboard"],
  ["KPIs", "kpis"],
  ["Comparativos", "comparativos"],
  ["Relatórios", "relatorios"],
];

const closingNav: Array<[string, ScreenKey]> = [
  ["Fechamento", "fechamento-ponto"],
  ["Lançamentos", "lancamentos"],
  ["Banco de Horas", "banco-horas"],
  ["Faltas", "ocorrencias"],
  ["Declarações e Atestados", "atestados"],
];

const companyNav: Array<[string, ScreenKey]> = [
  ["Cargos", "cargos"],
  ["Departamentos", "departamentos"],
  ["Jornadas", "jornadas-escalas"],
];

        <nav className={`flex-1 overflow-y-auto p-3 ${collapsed ? "space-y-2" : "space-y-4"}`}>
          {!collapsed && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Funcionários</div>}
          <div className="space-y-1">
            {peopleNav.map(([label, key]) => (
              <button key={key} type="button" onClick={() => go(key)} className={buttonClass(key)} title={collapsed ? label : undefined}>
                <Users className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </button>
            ))}
          </div>

          {!collapsed && <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Gestão</div>}
          <div className="space-y-1">
            {managementNav.map(([label, key]) => (
              <button key={key} type="button" onClick={() => go(key)} className={buttonClass(key)} title={collapsed ? label : undefined}>
                {key === "dashboard" || key === "kpis" ? <Gauge className="h-4 w-4 shrink-0" /> : key === "comparativos" ? <Users className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                {!collapsed && <span>{label}</span>}
              </button>
            ))}
          </div>

          {!collapsed && <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Fechamento de Ponto</div>}
          <div className="space-y-1">
            {closingNav.map(([label, key]) => (
              <button key={key} type="button" onClick={() => go(key)} className={buttonClass(key)} title={collapsed ? label : undefined}>
                {key === "fechamento-ponto" ? <Clock3 className="h-4 w-4 shrink-0" /> : key === "banco-horas" ? <WalletCards className="h-4 w-4 shrink-0" /> : key === "ocorrencias" ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <FileText className="h-4 w-4 shrink-0" />}
                {!collapsed && <span>{label}</span>}
              </button>
            ))}
          </div>

          {!collapsed && <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Empresa</div>}
          <div className="space-y-1">
            {companyNav.map(([label, key]) => (
              <button key={key} type="button" onClick={() => go(key)} className={buttonClass(key)} title={collapsed ? label : undefined}>
                <Building2 className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{label}</span>}
              </button>
            ))}
          </div>

          {!collapsed && <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-foreground/40">Tarefas</div>}
          <button type="button" onClick={() => go("tarefas")} className={buttonClass("tarefas")} title={collapsed ? "Tarefas" : undefined}>
            <FileText className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Tarefas</span>}
          </button>
        </nav>
        <SidebarProfile collapsed={collapsed} onNavigate={go} />teFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { AlertTriangle, Building2, ChevronDown, Clock3, FileText, Gauge, LogOut, Users, WalletCards, Save, TrendingUp, Settings } from "lucide-react";
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

const peopleNav: Array<[string, ScreenKey]> = [
  ["Funcionários", "funcionarios"],
];

const managementNav: Array<[string, ScreenKey]> = [
  ["Dashboard", "dashboard"],
  ["KPIs", "kpis"],
  ["Comparativos", "comparativos"],
  ["Relatórios", "relatorios"],
];

const closingNav: Array<[string, ScreenKey]> = [
  ["Fechamento", "fechamento-ponto"],
  ["Lançamentos", "lancamentos"],
  ["Banco de Horas", "banco-horas"],
  ["Faltas", "ocorrencias"],
  ["Declarações e Atestados", "atestados"],
];

const companyNav: Array<[string, ScreenKey]> = [
  ["Cargos", "cargos"],
  ["Departamentos", "departamentos"],
  ["Jornadas", "jornadas-escalas"],
];


