import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, CalendarRange, ChevronRight, Coins, Landmark, Palmtree, Search, UsersRound, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScreenShell, inputCls } from "@/components/screen-shell";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { calculateLiability, type LiabilityEmployee } from "@/lib/liability-estimates";
import type { Vacation } from "@/lib/vacation-periods";

type Company = { id: string; name: string };
type Estimate = ReturnType<typeof calculateLiability>;
type Metric = "fgts" | "fine" | "thirteenth" | "vacation" | "third" | "total";
type SortKey = Metric | "name";
const metrics = [
  { key: "fgts", label: "FGTS acumulado estimado", short: "FGTS acumulado", help: "Depósito mensal de 8% × meses completos de empresa.", Icon: Landmark, color: "bg-sky-100 text-sky-800" },
  { key: "fine", label: "40% do FGTS", short: "FGTS · 40%", help: "40% sobre o FGTS acumulado estimado.", Icon: Coins, color: "bg-amber-100 text-amber-800" },
  { key: "thirteenth", label: "13º proporcional", short: "13º proporcional", help: "Salário ÷ 12 × avos apurados até a data-base.", Icon: CalendarRange, color: "bg-violet-100 text-violet-800" },
  { key: "vacation", label: "Saldo de férias", short: "Férias", help: "Salário ÷ 30 × dias em aberto e proporcionais.", Icon: Palmtree, color: "bg-emerald-100 text-emerald-800" },
  { key: "third", label: "1/3 de férias", short: "1/3 de férias", help: "Valor das férias dividido por três.", Icon: Wallet, color: "bg-teal-100 text-teal-800" },
] as const;
const provisionParts = [
  { key: "fine", label: "40% do FGTS", color: "bg-amber-500" },
  { key: "thirteenth", label: "13º proporcional", color: "bg-violet-500" },
  { key: "vacation", label: "Férias", color: "bg-emerald-600" },
  { key: "third", label: "1/3 de férias", color: "bg-teal-500" },
] as const;
const field = "grid min-w-0 gap-1.5 text-sm font-medium";
const money = (cents: number | null) => cents === null ? "—" : formatCurrency(cents / 100);
const nameKey = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

async function loadRows<T>(table: "employees" | "vacation_periods" | "companies", columns: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await (supabase as any).from(table).select(columns).order("id").range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export function Passivos() {
  const [today] = useState(() => new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date()));
  const [reference, setReference] = useState(today);
  const [employees, setEmployees] = useState<LiabilityEmployee[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("ativo");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("total");
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    void Promise.all([
      loadRows<LiabilityEmployee>("employees", "id,full_name,status,hire_date,termination_date,company_id,salary"),
      loadRows<Vacation>("vacation_periods", "id,employee_id,start_date,end_date,official_gozo_start_date,official_gozo_end_date,acquisition_start_date,acquisition_end_date,concession_start_date,concession_end_date,entitled_days,days_quantity,leave_type,termination_paid,notes"),
      loadRows<Company>("companies", "id,name"),
    ]).then(([staff, records, organizations]) => {
      if (disposed) return;
      setEmployees(staff);
      setVacations(records);
      setCompanies(organizations.sort((first, second) => first.name.localeCompare(second.name, "pt-BR")));
    }).catch(() => {
      if (!disposed) setError("Não foi possível carregar salários e períodos de férias. Reabra a tela para tentar novamente.");
    }).finally(() => {
      if (!disposed) setLoading(false);
    });
    return () => { disposed = true; };
  }, []);

  const companiesById = useMemo(() => new Map(companies.map(item => [item.id, item.name])), [companies]);
  const estimates = useMemo(() => {
    const vacationsByEmployee = new Map<string, Vacation[]>();
    for (const record of vacations) {
      const existing = vacationsByEmployee.get(record.employee_id) ?? [];
      existing.push(record);
      vacationsByEmployee.set(record.employee_id, existing);
    }
    const terms = nameKey(search).split(/\s+/).filter(Boolean);
    return employees.filter(employee => {
      if (employee.hire_date && employee.hire_date > reference) return false;
      const active = employee.termination_date ? employee.termination_date >= reference : employee.status?.trim().toLowerCase() === "ativo";
      return (!company || employee.company_id === company)
        && (status === "todos" || (status === "ativo") === active)
        && terms.every(term => nameKey(employee.full_name).includes(term));
    }).map(employee => calculateLiability(employee, vacationsByEmployee.get(employee.id) ?? [], reference));
  }, [employees, vacations, company, status, search, reference]);

  const rows = [...estimates].sort((first, second) => {
    const nameOrder = first.employee.full_name.localeCompare(second.employee.full_name, "pt-BR");
    return sort === "name" ? nameOrder : (second[sort] ?? -1) - (first[sort] ?? -1) || nameOrder;
  });
  const current = rows.find(row => row.employee.id === selected);
  const sum = (key: Metric) => rows.some(row => row[key] !== null)
    ? rows.reduce((total, row) => total + (row[key] ?? 0), 0) : null;
  const missing = rows.filter(row => row.total === null).length;

  return (
    <ScreenShell section="Análise" title="Passivos" name="Passivos"
      subtitle="Provisões do quadro CLT por funcionário e data-base."
      actions={
        <div className="rounded-xl border border-white/15 bg-white/10 px-4 py-2">
          <p className="text-xs font-medium">Data-base da apuração</p>
          <p className="font-semibold tabular-nums">{formatDate(reference)}</p>
        </div>
      }>
      <div className="space-y-4">
        <Card className="grid gap-4 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          <label className={field}>Data-base
            <input type="date" className={inputCls} value={reference} min="1900-01-01" max="2099-12-31"
              onChange={event => {
                const value = event.target.value;
                if (!value) setReference(today);
                else if (value >= "1900-01-01" && value <= "2099-12-31") setReference(value);
              }} />
          </label>
          <label className={field}>Empresa
            <select className={inputCls} value={company} onChange={event => setCompany(event.target.value)}>
              <option value="">Todas as empresas</option>
              {companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className={field}>Situação na data-base
            <select className={inputCls} value={status} onChange={event => setStatus(event.target.value)}>
              <option value="ativo">Ativos</option>
              <option value="inativo">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </label>
          <label className={field}>Funcionário
            <span className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input className={inputCls + " pl-9"} type="search" value={search}
                onChange={event => setSearch(event.target.value)} placeholder="Buscar pelo nome" />
            </span>
          </label>
        </Card>

        {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
        {loading && <p role="status" className="py-8 text-center text-sm text-muted-foreground">Carregando estimativas…</p>}
        {!loading && !error && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
              {metrics.map(({ key, label, help, Icon, color }) => (
                <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)}
                  className="group flex min-w-0 flex-col items-start rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/70 aria-pressed:border-primary aria-pressed:bg-primary/10">
                  <span className={`mb-3 grid h-9 w-9 place-items-center rounded-xl ${color}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>
                  <span className="text-sm font-medium text-muted-foreground">{label}</span>
                  <span className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{money(sum(key))}</span>
                  <span className="mt-1 text-xs leading-5 text-muted-foreground">{help}</span>
                </button>
              ))}
            </div>

            <Card className="overflow-hidden rounded-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/25 p-4 sm:px-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary-strong"><UsersRound aria-hidden="true" className="h-4 w-4" /></span>
                  <div>
                    <h2 className="font-semibold">Provisões por funcionário</h2>
                    <p className="text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "funcionário" : "funcionários"} na seleção{missing > 0 ? ` · ${missing} com dados incompletos` : ""}</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <ArrowDownWideNarrow aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                  <span className="sr-only">Ordenar por</span>
                  <select className={inputCls} value={sort} onChange={event => setSort(event.target.value as SortKey)}>
                    <option value="total">Maior provisão</option>
                    <option value="name">Nome de A a Z</option>
                    {metrics.map(metric => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr>
                      <th scope="col" className="px-4 py-3 text-left">Funcionário</th>
                      <th scope="col" className="px-4 py-3 text-right">Salário base</th>
                      {metrics.map(metric => <th key={metric.key} scope="col" aria-sort={sort === metric.key ? "descending" : undefined} className="whitespace-nowrap px-4 py-3 text-right">{metric.short}</th>)}
                      <th scope="col" className="whitespace-nowrap px-4 py-3 text-right">Total provisionado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => {
                      const active = current?.employee.id === row.employee.id;
                      const organization = companiesById.get(row.employee.company_id ?? "");
                      return (
                        <tr key={row.employee.id} className={active ? "bg-primary/10" : ""}>
                          <th scope="row" className="px-4 py-3 text-left">
                            <button type="button" aria-haspopup="dialog"
                              onClick={() => setSelected(row.employee.id)}
                              className="inline-flex items-center gap-2 rounded-md text-left font-semibold hover:text-primary-strong">
                              {row.employee.full_name}<ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "rotate-90" : ""}`} />
                            </button>
                            <span className="mt-1 block text-xs font-normal text-muted-foreground">{organization ?? "Empresa não informada"}</span>
                          </th>
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(row.salary)}</td>
                          {metrics.map(metric => <td key={metric.key} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{money(row[metric.key])}</td>)}
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums">{money(row.total)}</td>
                        </tr>
                      );
                    })}
                    {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center">Nenhum funcionário encontrado para estes filtros.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Card>
            <p className="px-1 text-xs leading-5 text-muted-foreground">
              O FGTS acumulado usa o salário base cadastrado e os meses completos desde a admissão até a data-base ou o desligamento.
              O total provisionado reúne os 40% do FGTS, o 13º, as férias e o terço constitucional.
            </p>
          </>
        )}
      </div>
      <Dialog open={Boolean(current)} onOpenChange={open => { if (!open) setSelected(""); }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{current?.employee.full_name}</DialogTitle>
            <DialogDescription>Memória de cálculo em {formatDate(reference)}</DialogDescription>
          </DialogHeader>
          {current && <LiabilityDetails row={current} />}
        </DialogContent>
      </Dialog>
    </ScreenShell>
  );
}

function LiabilityDetails({ row }: { row: Estimate }) {
  const { dates, total } = row;
  return (
    <section className="grid gap-5 border-t border-border/70 pt-4 lg:grid-cols-2">
      <div className="min-w-0">
        {row.salary === null && <p className="mt-3 text-sm text-muted-foreground">Cadastre o salário base para calcular os valores.</p>}
        {!dates && <p className="mt-3 text-sm text-muted-foreground">Confira a data de admissão e, para desligados, a data de desligamento.</p>}
        {dates && (
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-background p-3">
              <dt className="text-xs text-muted-foreground">Meses de FGTS</dt>
              <dd className="mt-1 font-semibold tabular-nums">{dates.fgtsMonths}</dd>
              {row.monthlyFgts !== null && <dd className="text-xs text-muted-foreground">{money(row.monthlyFgts)} por mês</dd>}
            </div>
            <div className="rounded-lg border bg-background p-3"><dt className="text-xs text-muted-foreground">Avos de 13º</dt><dd className="mt-1 font-semibold tabular-nums">{dates.months}/12</dd></div>
            <div className="rounded-lg border bg-background p-3"><dt className="text-xs text-muted-foreground">Dias em aberto</dt><dd className="mt-1 font-semibold tabular-nums">{formatNumber(dates.openDays, 1)}</dd></div>
            <div className="rounded-lg border bg-background p-3"><dt className="text-xs text-muted-foreground">Dias proporcionais</dt><dd className="mt-1 font-semibold tabular-nums">{formatNumber(dates.proportionalDays, 1)}</dd></div>
          </dl>
        )}
        {dates && <p className="mt-2 text-xs text-muted-foreground">Cada mês com pelo menos 15 dias de vínculo na data-base conta 1 avo de 13º.</p>}
        {total !== null && total > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium">Composição de {money(total)}</p>
            <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
              {provisionParts.map(part => <div key={part.key} className={part.color} style={{ width: `${(row[part.key] ?? 0) / total * 100}%` }} />)}
            </div>
            <ul className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
              {provisionParts.map(part => <li key={part.key} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${part.color}`} />{part.label}
                <strong className="ml-auto whitespace-nowrap tabular-nums">{money(row[part.key])}</strong>
              </li>)}
            </ul>
          </div>
        )}
      </div>
      {dates && (
        <div>
          <h3 className="font-semibold">Férias por período aquisitivo</h3>
          <p className="mt-1 text-xs text-muted-foreground">O saldo desconta os blocos registrados na tela de Férias.</p>
          <ul className="mt-3 divide-y rounded-xl border bg-background">
            {dates.periods.map(period => (
              <li key={period.start} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium">{formatDate(period.start)} a {formatDate(period.end)}</p>
                  <p className="text-xs text-muted-foreground">{period.inProgress ? "Proporcional" : "Em aberto"} · {formatNumber(period.accrued, 1)} dias de direito · {formatNumber(period.registeredDays, 1)} registrados</p>
                </div>
                <span className="whitespace-nowrap rounded-full bg-primary/15 px-2 py-1 text-xs font-semibold text-primary-strong">{formatNumber(period.balanceDays, 1)} dias</span>
              </li>
            ))}
            {!dates.periods.length && <li className="px-3 py-3 text-sm text-muted-foreground">Sem dias de férias a provisionar.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
