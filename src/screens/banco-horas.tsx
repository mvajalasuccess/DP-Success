import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Row = { employee_id: string; name: string; department: string; opening: number; movement: number; current: number };

function signedMinutes(kind: string, minutes: number) {
  return kind === "debito" ? -Math.abs(minutes) : Math.abs(minutes);
}

export function BankHours() {
  const [rows, setRows] = useState<Row[]>([]);
  const [competence, setCompetence] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    const { data: periods, error: pe } = await supabase.from("time_periods").select("id,reference_year,reference_month,status").order("reference_year",{ascending:false}).order("reference_month",{ascending:false}).limit(1);
    if (pe) { setError(pe.message); setLoading(false); return; }
    const comp = periods?.[0];
    setCompetence(comp);
    if (!comp) { setRows([]); setLoading(false); return; }

    const [empRes, bankRes] = await Promise.all([
      supabase.from("employees").select("id,full_name,department_id,departments(name)").eq("status","ativo").order("full_name"),
      supabase.from("bank_hours").select("employee_id,entry_date,kind,minutes,previous_balance_minutes,balance_minutes").eq("period_id",comp.id).order("entry_date",{ascending:true}).order("created_at",{ascending:true}),
    ]);
    if (empRes.error) { setError(empRes.error.message); setLoading(false); return; }
    if (bankRes.error) { setError(bankRes.error.message); setLoading(false); return; }

    const grouped = new Map<string, any[]>();
    for (const item of (bankRes.data ?? []) as any[]) {
      const list = grouped.get(item.employee_id) ?? [];
      list.push(item); grouped.set(item.employee_id,list);
    }

    setEmployees(empRes.data ?? []);
    setRows((empRes.data ?? []).map((e:any) => {
      const movements = grouped.get(e.id) ?? [];
      const movement = movements.reduce((sum:number,m:any)=>sum + signedMinutes(m.kind, Number(m.minutes||0)),0);
      const opening = movements.length ? Number(movements[0].previous_balance_minutes||0) : 0;
      const current = movements.length ? Number(movements[movements.length-1].balance_minutes||0) : opening;
      return {employee_id:e.id,name:e.full_name,department:e.departments?.name ?? "—",opening,movement,current};
    }));
    setLoading(false);
  }

  useEffect(()=>{void load();},[]);

  const visibleRows = selectedEmployeeId ? rows.filter(r => r.employee_id === selectedEmployeeId) : rows;
  const totals=useMemo(()=>visibleRows.reduce((a,r)=>({opening:a.opening+r.opening,movement:a.movement+r.movement,current:a.current+r.current}),{opening:0,movement:0,current:0}),[visibleRows]);
  const fmt=(v:number)=>{const sign=v<0?"-":"+";const abs=Math.abs(v);return `${sign}${String(Math.floor(abs/60)).padStart(2,"0")}:${String(abs%60).padStart(2,"0")}`;};

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] justify-between"><a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/> Voltar</a><span className="font-semibold">DP Success · Banco de Horas</span></div></header>
    <main className="mx-auto max-w-[1500px] px-6 py-7">
      <p className="text-sm font-medium text-primary">Operação</p><h1 className="mt-1 text-3xl font-bold">Banco de Horas</h1><p className="mt-1 text-sm text-muted-foreground">Saldo inicial, movimentações da competência e saldo atualizado.</p>
      {error&&<div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><Card className="p-5"><p className="text-xs text-muted-foreground">Saldo anterior</p><p className="mt-1 text-2xl font-bold">{loading?"…":fmt(totals.opening)}</p></Card><Card className="p-5"><p className="text-xs text-muted-foreground">Movimentação</p><p className="mt-1 text-2xl font-bold">{loading?"…":fmt(totals.movement)}</p></Card><Card className="p-5"><p className="text-xs text-muted-foreground">Saldo atual</p><p className="mt-1 text-2xl font-bold">{loading?"…":fmt(totals.current)}</p></Card></div>
      <Card className="mt-6 overflow-hidden"><div className="border-b p-5"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="font-display font-bold">Saldo por funcionário</h2><p className="text-xs text-muted-foreground">{competence?(() => {const end=new Date(competence.reference_year,competence.reference_month-1,20);const start=new Date(competence.reference_year,competence.reference_month-2,21);return `${start.toLocaleDateString("pt-BR")} → ${end.toLocaleDateString("pt-BR")}`;})():"Nenhuma competência cadastrada"}</p></div><select value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="">Todos os funcionários</option>{employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></div></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Departamento</th><th className="px-5 py-3">Saldo anterior</th><th className="px-5 py-3">Movimentação</th><th className="px-5 py-3">Saldo atual</th></tr></thead><tbody className="divide-y">{visibleRows.map(r=><tr key={r.employee_id}><td className="px-5 py-4 font-medium">{r.name}</td><td className="px-5 py-4 text-muted-foreground">{r.department}</td><td className="px-5 py-4">{fmt(r.opening)}</td><td className="px-5 py-4">{fmt(r.movement)}</td><td className={`px-5 py-4 font-bold ${r.current<0?"text-destructive":"text-primary"}`}>{fmt(r.current)}</td></tr>)}</tbody></table>{!loading&&!rows.length&&<div className="p-8 text-center text-sm text-muted-foreground">Nenhum funcionário ativo encontrado.</div>}</div></Card>
    </main>
  </div>;
}
