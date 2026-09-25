import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowDownRight, ArrowUpRight, Clock3 } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/banco-horas")({ component: BankHours });

const rows = [
  ["João Pereira","Operacional","+12:35","+04:20","16:55"],
  ["Maria Santos","Administrativo","+08:20","+02:10","10:30"],
  ["Carlos Lima","Comercial","-03:15","+01:40","-01:35"],
  ["Juliana Alves","Financeiro","+06:40","-00:30","06:10"],
];

function BankHours() {
 return <div className="min-h-screen bg-background"><header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] justify-between"><Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/> Voltar</Link><span className="font-semibold">DP Success · Banco de Horas</span></div></header><main className="mx-auto max-w-[1500px] px-6 py-7"><p className="text-sm font-medium text-primary">Operação</p><h1 className="mt-1 text-3xl font-bold">Banco de Horas</h1><p className="mt-1 text-sm text-muted-foreground">Acompanhe o saldo anterior, os lançamentos e o saldo atualizado.</p><div className="mt-6 grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-xs text-muted-foreground">Saldo anterior</p><p className="mt-1 text-2xl font-bold">+1.086:20</p></Card><Card className="p-5"><p className="text-xs text-muted-foreground">Movimentação</p><p className="mt-1 text-2xl font-bold">+162:10</p></Card><Card className="p-5"><p className="text-xs text-muted-foreground">Saldo atual</p><p className="mt-1 text-2xl font-bold">+1.248:30</p></Card></div><Card className="mt-6 overflow-hidden"><div className="border-b p-5"><h2 className="font-display font-bold">Saldo por funcionário</h2><p className="text-xs text-muted-foreground">Competência 21/08/2026 → 20/09/2026</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Departamento</th><th className="px-5 py-3">Saldo anterior</th><th className="px-5 py-3">Movimentação</th><th className="px-5 py-3">Saldo atual</th></tr></thead><tbody className="divide-y">{rows.map(r=><tr key={r[0]}><td className="px-5 py-4 font-medium">{r[0]}</td><td className="px-5 py-4 text-muted-foreground">{r[1]}</td><td className="px-5 py-4">{r[2]}</td><td className="px-5 py-4">{r[3]}</td><td className={`px-5 py-4 font-bold ${r[4].startsWith("-") ? "text-destructive" : "text-primary"}`}>{r[4]}</td></tr>)}</tbody></table></div></Card></main></div>;
}
