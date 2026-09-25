import { createFileRoute, Link } from "@tanstack/react-router";
import { Clock3, Users, WalletCards, AlertTriangle, FileText, Gauge } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/")({ component: Dashboard });

function Dashboard() {
  const metrics = [
    ["Funcionários ativos","127",Users],
    ["Horas extras","386h",Clock3],
    ["Saldo do banco","+1.248h",WalletCards],
    ["Faltas","42",AlertTriangle],
    ["Atestados","31",FileText],
    ["Absenteísmo","2,8%",Gauge],
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r bg-sidebar lg:block">
        <div className="flex h-20 items-center gap-3 border-b px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Clock3 className="h-5 w-5"/></div>
          <div><div className="font-display text-lg font-bold">DP Success</div><div className="text-[10px] uppercase tracking-widest text-muted-foreground">RH · DP · Gestão</div></div>
        </div>
        <nav className="space-y-1 p-3 text-sm">
          <div className="rounded-lg bg-sidebar-primary px-3 py-2.5 text-sidebar-primary-foreground">Dashboard</div>
          {["Funcionários","Departamentos","Cargos","Jornadas / Escalas","Fechamento de Ponto","Lançamentos","Banco de Horas","Atestados","Faltas e Ocorrências","Relatórios","Comparativos","KPIs","Configurações"].map(item=>item==="Funcionários" ? <Link key={item} to="/funcionarios" className="block rounded-lg px-3 py-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent">{item}</Link> : item==="Lançamentos" ? <Link key={item} to="/lancamentos" className="block rounded-lg px-3 py-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent">{item}</Link> : item==="Fechamento de Ponto" ? <Link key={item} to="/fechamento-ponto" className="block rounded-lg px-3 py-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent">{item}</Link> : item==="Atestados" ? <Link key={item} to="/atestados" className="block rounded-lg px-3 py-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent">{item}</Link> : item==="Faltas e Ocorrências" ? <Link key={item} to="/ocorrencias" className="block rounded-lg px-3 py-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent">{item}</Link> : item==="Comparativos" ? <Link key={item} to="/comparativos" className="block rounded-lg px-3 py-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent">{item}</Link> : item==="Banco de Horas" ? <Link key={item} to="/banco-horas" className="block rounded-lg px-3 py-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent">{item}</Link> : <div key={item} className="rounded-lg px-3 py-2.5 text-sidebar-foreground/75 hover:bg-sidebar-accent">{item}</div>)}
        </nav>
      </aside>
      <main className="lg:pl-60">
        <header className="flex h-16 items-center justify-between border-b bg-background/90 px-6">
          <span className="text-xs text-muted-foreground">RH / Visão geral</span>
          <div className="flex items-center gap-3"><div className="h-8 w-8 rounded-full bg-foreground text-center text-xs font-semibold leading-8 text-background">RH</div><span className="text-sm font-medium">Usuário RH</span></div>
        </header>
        <div className="mx-auto max-w-[1500px] px-6 py-7">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div><p className="text-sm font-medium text-primary">Visão geral da empresa</p><h1 className="mt-1 text-3xl font-bold">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe ponto, banco de horas, absenteísmo e indicadores.</p></div>
            <div className="rounded-lg border bg-card px-4 py-2 text-xs font-medium">Competência: <strong>21/08/2026 → 20/09/2026</strong></div>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            {metrics.map(([label,value,Icon])=><Card key={label} className="p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5"/></div><p className="mt-4 text-xs text-muted-foreground">{label}</p><p className="mt-1 font-display text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">competência atual</p></Card>)}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2 p-5"><h2 className="font-display font-bold">Horas extras</h2><p className="text-xs text-muted-foreground">Evolução mensal</p><div className="mt-6 flex h-48 items-end gap-3">{[42,55,48,68,61,73,66,82,91].map((h,i)=><div key={i} className="flex flex-1 flex-col items-center gap-2"><div className="w-full max-w-10 rounded-t-md bg-primary/70" style={{height:h+"%"}}/><span className="text-[10px] text-muted-foreground">{["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set"][i]}</span></div>)}</div></Card>
            <Card className="p-5"><h2 className="font-display font-bold">Alertas recentes</h2><p className="text-xs text-muted-foreground">Pontos que merecem atenção</p><div className="mt-4 space-y-3">{["Banco de horas acima do limite","Aumento de horas extras","Recorrência de faltas","Competência não fechada"].map((x,i)=><div key={x} className="flex gap-3 rounded-lg border p-3"><AlertTriangle className="mt-0.5 h-4 w-4 text-warning"/><div><p className="text-xs font-semibold">{x}</p><p className="text-[10px] text-muted-foreground">{i===3?"Setembro/2026":"Ver detalhes"}</p></div></div>)}</div></Card>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><h2 className="font-display font-bold">Funcionários com mais horas extras</h2><p className="text-xs text-muted-foreground">Competência atual</p><div className="mt-4 divide-y">{[["João Pereira","48h","+12h"],["Maria Santos","42h","+8h"],["Carlos Lima","38h","-4h"],["Juliana Alves","32h","+6h"]].map((r,i)=><div key={r[0]} className="flex items-center justify-between py-3 text-xs"><span className="w-6 text-muted-foreground">{i+1}</span><span className="flex-1 font-medium">{r[0]}</span><span className="w-16 text-right font-semibold">{r[1]}</span><span className="w-16 text-right">{r[2]}</span></div>)}</div></Card>
            <Card className="p-5"><h2 className="font-display font-bold">Visão por departamento</h2><p className="text-xs text-muted-foreground">Indicadores da competência</p><div className="mt-4 grid grid-cols-2 gap-3">{[["Operacional","42","142h","3,2%"],["Administrativo","28","98h","2,1%"],["Comercial","24","68h","2,7%"],["Financeiro","18","45h","1,9%"]].map(d=><div key={d[0]} className="rounded-xl border p-4"><p className="text-xs font-semibold">{d[0]}</p><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><span>{d[1]}<br/><em className="text-muted-foreground not-italic">func.</em></span><span>{d[2]}<br/><em className="text-muted-foreground not-italic">HE</em></span><span>{d[3]}<br/><em className="text-muted-foreground not-italic">abs.</em></span></div></div>)}</div></Card>
          </div>
        </div>
      </main>
    </div>
  );
}
