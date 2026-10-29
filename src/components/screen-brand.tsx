import { BadgeDollarSign, BriefcaseBusiness, Building2, CalendarClock, CalendarDays, CalendarRange, CalendarX, ChartColumn, ClipboardCheck, ClipboardList, Clock3, FileText, LayoutDashboard, ListChecks, Palmtree, Settings, UsersRound, Upload, type LucideIcon } from "lucide-react";

const screenIcons: Record<string, LucideIcon> = {
  "Dashboard": LayoutDashboard, "KPIs": ChartColumn, "Comparativos": UsersRound, "Relatórios": FileText,
  "Fechamento de Ponto": CalendarClock, "Fechamento": CalendarClock, "Ponto": CalendarClock,
  "Importar Cartão de Ponto": Upload, "Importar Cartão Ponto": Upload, "Lançamentos": ClipboardList,
  "Banco de Horas": Clock3, "Pagamentos": BadgeDollarSign, "Faltas e Folgas": CalendarX,
  "Declarações e Atestados": ClipboardCheck, "Atestados": ClipboardCheck, "Empresas": Building2,
  "Funcionários": UsersRound, "Cargos": BriefcaseBusiness, "Departamentos": Building2,
  "Jornadas / Escalas": CalendarDays, "Planejamento Mensal": CalendarRange,
  "Diário de Ocorrências": ClipboardList, "Tarefas": ListChecks, "Férias": Palmtree,
  "Configurações": Settings, "Parâmetros": Settings, "Cadastros": Building2,
};

export function ScreenBrand({ name, onDark = false }: { name: string; onDark?: boolean }) {
  const Icon = screenIcons[name] ?? FileText;
  return <div className={`dp-brand${onDark ? " dp-brand-on-dark" : ""}`}>
    <span className="dp-brand-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
    <span className="dp-brand-label">DP Success • {name}</span>
  </div>;
}
