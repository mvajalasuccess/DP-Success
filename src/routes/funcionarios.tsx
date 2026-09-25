import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Search, UserRound, BriefcaseBusiness, WalletCards } from "lucide-react";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/funcionarios")({ component: Employees });

const employees = [
  { name: "João Pereira", role: "Analista Operacional", department: "Operacional", salary: "R$ 3.200,00", bank: "+12:35", status: "Ativo" },
  { name: "Maria Santos", role: "Assistente Administrativo", department: "Administrativo", salary: "R$ 2.850,00", bank: "+08:20", status: "Ativo" },
  { name: "Carlos Lima", role: "Supervisor Comercial", department: "Comercial", salary: "R$ 4.600,00", bank: "-03:15", status: "Ativo" },
  { name: "Juliana Alves", role: "Analista Financeiro", department: "Financeiro", salary: "R$ 3.900,00", bank: "+06:40", status: "Ativo" },
];

function Employees() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4"/> Voltar ao dashboard</Link>
          <div className="text-sm font-semibold">DP Success · Cadastros</div>
        </div>
      </header>
      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div><p className="text-sm font-medium text-primary">Cadastro base</p><h1 className="mt-1 text-3xl font-bold">Funcionários</h1><p className="mt-1 text-sm text-muted-foreground">Cadastre pessoas, cargo, departamento, salário e saldo inicial do banco de horas.</p></div>
          <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4"/> Novo funcionário</button>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[["Funcionários ativos","127",UserRound],["Departamentos","8",BriefcaseBusiness],["Banco inicial lançado","96%",WalletCards]].map(([label,value,Icon])=><Card key={label as string} className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5"/></div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold">{value}</p></div></div></Card>)}
        </div>
        <Card className="mt-6 overflow-hidden">
          <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div><h2 className="font-display font-bold">Lista de funcionários</h2><p className="text-xs text-muted-foreground">Base cadastral e saldo inicial</p></div>
            <div className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 md:w-72"><Search className="h-4 w-4 text-muted-foreground"/><input className="w-full bg-transparent text-sm outline-none" placeholder="Buscar funcionário..." /></div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Cargo</th><th className="px-5 py-3">Departamento</th><th className="px-5 py-3">Salário</th><th className="px-5 py-3">Saldo inicial</th><th className="px-5 py-3">Status</th></tr></thead><tbody className="divide-y">{employees.map(e=><tr key={e.name} className="hover:bg-muted/30"><td className="px-5 py-4 font-medium">{e.name}</td><td className="px-5 py-4 text-muted-foreground">{e.role}</td><td className="px-5 py-4 text-muted-foreground">{e.department}</td><td className="px-5 py-4">{e.salary}</td><td className={`px-5 py-4 font-semibold ${e.bank.startsWith("-") ? "text-destructive" : "text-primary"}`}>{e.bank}</td><td className="px-5 py-4"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{e.status}</span></td></tr>)}</tbody></table></div>
        </Card>
      </main>
    </div>
  );
}
