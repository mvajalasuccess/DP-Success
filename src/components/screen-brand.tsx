import { BadgeDollarSign, BriefcaseBusiness, Building, CalendarClock, CalendarDays, CalendarRange, CalendarX, ChartColumn, ClipboardCheck, ClipboardList, Clock3, Contact, FileClock, FilePenLine, FileText, FolderOpen, Gauge, GitCompare, Landmark, LayoutDashboard, ListChecks, Network, Palmtree, SlidersHorizontal, Timer, Upload, UsersRound, type LucideIcon } from "lucide-react";

const screenIcons: Readonly<Partial<Record<string, LucideIcon>>> = {
  "Dashboard": LayoutDashboard,
  "KPIs": ChartColumn,
  "Comparativos": GitCompare,
  "Relatórios": FileText,
  "Passivos": Landmark,
  "Fechamento de Ponto": CalendarClock,
  "Importar cartão de ponto": Upload,
  "Lançamentos": ClipboardList,
  "Banco de Horas": Clock3,
  "Pagamentos": BadgeDollarSign,
  "Faltas e Folgas": CalendarX,
  "Declarações e Atestados": ClipboardCheck,
  "Empresas": Building,
  "Funcionários": Contact,
  "Cargos": BriefcaseBusiness,
  "Departamentos": Network,
  "Jornadas / Escalas": CalendarDays,
  "Planejamento Mensal": CalendarRange,
  "Tarefas": ListChecks,
  "Férias": Palmtree,
  "Diário de Ocorrências": ClipboardList,
  "Parâmetros": SlidersHorizontal,
  "Análise": Gauge,
  "Ponto": Timer,
  "Ponto Avulso": FileClock,
  "Cadastro": FilePenLine,
  "Organização": FolderOpen,
  "Pessoas": UsersRound,
};

const screenAliases: Readonly<Partial<Record<string, string>>> = {
  "Configurações": "Parâmetros",
  "Fechamento": "Fechamento de Ponto",
  "Importar Cartão de Ponto": "Importar cartão de ponto",
  "Importar Cartão Ponto": "Importar cartão de ponto",
  "Atestados": "Declarações e Atestados",
  "Cadastro de Pessoas": "Funcionários",
  "Recessos PJ": "Férias",
  "Sincronizar Planilha": "Importar cartão de ponto",
  "Cadastros": "Cadastro",
};

export function getScreenIcon(name: string): LucideIcon {
  return screenIcons[screenAliases[name] ?? name] ?? FileText;
}

export function ScreenBrand({ name, onDark = false }: { name: string; onDark?: boolean }) {
  const Icon = getScreenIcon(name);
  return <div className={`dp-brand${onDark ? " dp-brand-on-dark" : ""}`}>
    <span className="dp-brand-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
    <span className="dp-brand-label">DP Success • {name}</span>
  </div>;
}
