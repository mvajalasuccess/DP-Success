import { Link } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, CheckCircle2, LockKeyhole, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function PointClosing() {
  const [periods,setPeriods]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  async function load(){setLoading(true);const db=supabase;const {data,error}=await db.from("competencies").select("id,name,start_date,end_date,status,closed_at").order("end_date",{ascending:false});if(error)setError(error.message);else setPeriods(data??[]);setLoading(false);}
  useEffect(()=>{void load();},[]);

  async function createCompetence(){
    setSaving(true);setError("");const db=supabase;
    const {data,error}=await db.rpc("create_competence_for_date",{p_date:new Date().toISOString().slice(0,10)});
    if(error)setError(error.message);else if(!data)setError("Não foi possível criar a competência.");await load();setSaving(false);
  }

  async function closeCompetence(id:string){
    setSaving(true);setError("");const db=supabase;
    const {error}=await db.rpc("close_competence",{p_competence_id:id});
    if(error)setError(error.message);else await load();setSaving(false);
  }

  const date=(v:string)=>new Date(v+"T12:00:00").toLocaleDateString("pt-BR");
  return <div className="min-h-screen bg-background"><header className="border-b bg-background px-6 py-4"><div className="mx-auto flex max-w-[1500px] items-center justify-between"><a href="/" className="flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="h-4 w-4"/> Voltar</a><span className="text-sm font-semibold">DP Success · Ponto</span></div></header>
  <main className="mx-auto max-w-[1500px] px-6 py-7"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-sm font-medium text-primary">Operação</p><h1 className="mt-1 text-3xl font-bold">Fechamento de Ponto</h1><p className="mt-1 text-sm text-muted-foreground">Controle as competências no ciclo do dia 21 ao dia 20.</p></div><button disabled={saving} onClick={()=>void createCompetence()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"><Plus className="h-4 w-4"/> Nova competência</button></div>
  {error&&<div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
  <Card className="mt-6 p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays className="h-5 w-5"/></div><div><p className="font-semibold">Regra atual de fechamento</p><p className="text-sm text-muted-foreground">Toda competência começa no dia 21 e termina no dia 20 do mês seguinte.</p></div></div><div className="rounded-lg border px-4 py-2 text-sm font-medium">21 → 20</div></div></Card>
  <div className="mt-6 space-y-3">{loading?<Card className="p-8 text-center text-muted-foreground">Carregando competências...</Card>:periods.map(p=><Card key={p.id} className="p-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-center"><div className="flex-1"><h2 className="font-display font-bold">{p.name}</h2><p className="text-xs text-muted-foreground">{date(p.start_date)} → {date(p.end_date)}</p></div><div className="flex items-center gap-3"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${p.status==="FECHADA"?"bg-primary/10 text-primary":"bg-amber-500/10 text-amber-700"}`}>{p.status==="FECHADA"?<LockKeyhole className="h-3 w-3"/>:<CheckCircle2 className="h-3 w-3"/>}{p.status}</span>{p.status!=="FECHADA"&&<button disabled={saving} onClick={()=>void closeCompetence(p.id)} className="rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">Fechar competência</button>}</div></div></Card>)}</div></main></div>;
}