import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, LockKeyhole, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/fechamento-ponto")({ component: PointClosing });

const periods = [
  { label: "Setembro/2026", start: "21/08/2026", end: "20/09/2026", employees: 127, status: "Em andamento", hours: "386h" },
  { label: "Agosto/2026", start: "21/07/2026", end: "20/08/2026", employees: 126, status: "Fechada", hours: "341h" },
  { label: "Julho/2026", start: "21/06/2026", end: "20/07/2026", employees: 124, status: "Fechada", hours: "329h" },
];

function PointClosing() {
  return <div className="min-h-screen bg-background">
    <header className="border-b bg-background px-6 py-4"><div className="mx-auto flex max-w-[1500px] items-center justify-between"><Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/> Voltar</Link><span className="text-sm font-semibold">DP Success · Ponto</span></div></header>
    <main className="mx-auto max-w-[1500px] px-6 py-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-medium text-primary">Operação</p><h1 className="mt-1 text-3xl font-bold">Fechamento de Ponto</h1><p className="mt-1 text-sm text-muted-foreground">Controle as competências no ciclo do dia 21 ao dia 20.</p></div><button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4"/> Nova competência</button></div>
      <Card className="mt-6 p-5"><div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5"/></div><div><p className="font-semibold">Regra atual de fechamento</p><p className="text-sm text-muted-foreground">Toda competência começa no dia 21 e termina no dia 20 do mês seguinte.</p></div></div><div className="rounded-lg border px-4 py-2 text-sm font-medium">21 → 20</div></div></Card>
      <div className="mt-6 space-y-3">{periods.map(p=><Card key={p.label} className="p-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-center"><div className="flex flex-1 items-center gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted"><Clock3 className="h-5 w-5"/></div><div><h2 className="font-display font-bold">{p.label}</h2><p className="text-xs text-muted-foreground">{p.start} → {p.end}</p></div></div><div className="grid grid-cols-3 gap-8 text-sm"><div><p className="text-xs text-muted-foreground">Funcionários</p><strong>{p.employees}</strong></div><div><p className="text-xs text-muted-foreground">Horas extras</p><strong>{p.hours}</strong></div><div><p className="text-xs text-muted-foreground">Status</p><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${p.status === "Fechada" ? "bg-primary/10 text-primary" : "bg-amber-500/10 text-amber-700"}`}>{p.status === "Fechada" ? <LockKeyhole className="h-3 w-3"/> : <CheckCircle2 className="h-3 w-3"/>}{p.status}</span></div></div></div></Card>)}</div>
    </main>
  </div>;
}
