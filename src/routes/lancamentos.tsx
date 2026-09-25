import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Search, Clock3, Moon, CalendarDays, ArrowDownUp } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/lancamentos")({ component: Launches });

const types = [
  { label: "Hora extra 60%", icon: Clock3 },
  { label: "Hora extra noturna", icon: Moon },
  { label: "Adicional noturno 20%", icon: Moon },
  { label: "Domingo / feriado 100%", icon: CalendarDays },
  { label: "Interjornada 50%", icon: ArrowDownUp },
  { label: "Crédito / débito", icon: ArrowDownUp },
];

const rows = [
  ["João Pereira","20/09/2026","Hora extra 60%","+02:30","Crédito"],
  ["Maria Santos","19/09/2026","Hora extra noturna","+01:45","Crédito"],
  ["Carlos Lima","18/09/2026","Débito de horas","-01:00","Débito"],
  ["Juliana Alves","17/09/2026","Domingo / feriado 100%","+04:00","Crédito"],
];

function Launches() {
  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] items-center justify-between"><Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/> Voltar</Link><span className="font-semibold">DP Success · Lançamentos</span></div></header>
    <main className="mx-auto max-w-[1500px] px-6 py-7">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-medium text-primary">Operação</p><h1 className="mt-1 text-3xl font-bold">Lançamentos</h1><p className="mt-1 text-sm text-muted-foreground">Registre créditos, débitos e adicionais vinculados à competência.</p></div><button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4"/> Novo lançamento</button></div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{types.map(({label: x,icon:Icon})=><Card key={x} className="p-4"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4"/></div><span className="text-sm font-medium">{x}</span></div></Card>)}</div>
      <Card className="mt-6 overflow-hidden"><div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between"><div><h2 className="font-display font-bold">Lançamentos da competência</h2><p className="text-xs text-muted-foreground">21/08/2026 → 20/09/2026</p></div><div className="flex items-center gap-2 rounded-lg border px-3 py-2 md:w-72"><Search className="h-4 w-4 text-muted-foreground"/><input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar funcionário..." /></div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Data</th><th className="px-5 py-3">Tipo</th><th className="px-5 py-3">Horas</th><th className="px-5 py-3">Movimento</th></tr></thead><tbody className="divide-y">{rows.map(r=><tr key={r.join("-")}><td className="px-5 py-4 font-medium">{r[0]}</td><td className="px-5 py-4 text-muted-foreground">{r[1]}</td><td className="px-5 py-4">{r[2]}</td><td className={`px-5 py-4 font-bold ${r[3].startsWith("-")?"text-destructive":"text-primary"}`}>{r[3]}</td><td className="px-5 py-4 text-xs">{r[4]}</td></tr>)}</tbody></table></div></Card>
    </main>
  </div>;
}
