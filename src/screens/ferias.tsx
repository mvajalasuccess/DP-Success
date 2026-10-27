import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Palmtree, Plus, Search, CheckCircle2, Circle, Pencil, Trash2, X, Clock3, CalendarCheck, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Vacation = { id:string; employee_id:string; title:string|null; start_date:string; end_date:string; notes:string|null; completed:boolean; completed_at:string|null; created_at:string; acquisition_start_date?:string|null; acquisition_end_date?:string|null; concession_start_date?:string|null; concession_end_date?:string|null; employees?:{full_name:string}|null };
type Employee = { id:string; full_name:string; status?:string|null; termination_date?:string|null; hire_date?:string|null };
type Holiday = { holiday_date:string; name?:string|null };
type Entitlement = { employee:Employee; acquisitionStart:string; acquisitionEnd:string; concessionStart:string; concessionEnd:string; cycle:number; status:"acquisition"|"available"|"overdue"|"scheduled"|"completed"; vacations?:Vacation[] };
const today = () => new Date().toISOString().slice(0,10);
const shiftDate = (iso:string, days:number) => { const d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const addYears = (iso:string, years:number) => { const [y,m,d]=iso.split("-").map(Number); const targetYear=y+years; const last=new Date(targetYear,m,0).getDate(); return String(targetYear)+"-"+String(m).padStart(2,"0")+"-"+String(Math.min(d,last)).padStart(2,"0"); };
const makeEntitlement = (employee:Employee, cycle:number) => { const acquisitionStart=addYears(employee.hire_date!,cycle); const nextAnniversary=addYears(employee.hire_date!,cycle+1); const concessionEnd=shiftDate(addYears(employee.hire_date!,cycle+2),-1); return { employee, cycle:cycle+1, acquisitionStart, acquisitionEnd:shiftDate(nextAnniversary,-1), concessionStart:nextAnniversary, concessionEnd }; };
const dateLabel = (v:string|null|undefined) => v ? v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4) : "—";
const calendarDayCount = (a:string,b:string) => Math.max(1,Math.round((new Date(b+"T00:00:00").getTime()-new Date(a+"T00:00:00").getTime())/86400000)+1);
const dayCount = (a:string,b:string,holidayDates:ReadonlySet<string> = new Set<string>()) => {
  if (b < a) return 0;
  let total=0;
  const cursor=new Date(a+"T12:00:00");
  const end=new Date(b+"T12:00:00");
  while(cursor<=end){
    const date=cursor.getFullYear()+"-"+String(cursor.getMonth()+1).padStart(2,"0")+"-"+String(cursor.getDate()).padStart(2,"0");
    // Natal e Ano-Novo são feriados fixos: considerar em qualquer ano,
    // mesmo que não existam como registros na tabela de feriados.
    const fixedHoliday = date.slice(5) === "12-25" || date.slice(5) === "01-01";
    if(!holidayDates.has(date) && !fixedHoliday) total++;
    cursor.setDate(cursor.getDate()+1);
  }
  return total;
};
const blank = {employee_id:"",title:"",start_date:"",end_date:"",notes:"",completed:false,acquisition_start_date:"",acquisition_end_date:"",concession_start_date:"",concession_end_date:""};

export function Ferias() {
  const [periods,setPeriods]=useState<Vacation[]>([]);
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [holidays,setHolidays]=useState<Holiday[]>([]);
  const holidayDates=useMemo(()=>new Set(holidays.map(h=>h.holiday_date.slice(0,10))),[holidays]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|"open"|"done">("open");
  const [modal,setModal]=useState(false);
  const [editing,setEditing]=useState<Vacation|null>(null);
  const [form,setForm]=useState(blank);
  const [saving,setSaving]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState<Vacation|null>(null);

  async function load() {
    setLoading(true); setError("");
    const [v,e,h]=await Promise.all([
      (supabase as any).from("vacation_periods").select("*,employees(full_name)").order("start_date",{ascending:true}),
      (supabase as any).from("employees").select("id,full_name,status,termination_date,hire_date").order("full_name"),
      (supabase as any).from("holidays").select("holiday_date,name").order("holiday_date")
    ]);
    if(v.error){setError(v.error.message.includes("vacation_periods")||v.error.code==="42P01"?"A tabela de férias ainda não foi criada no banco de dados. A migração precisa ser aplicada.":v.error.message);}
    if(e.error && !v.error)setError(e.error.message);
    if(h.error && !v.error && !e.error)setError("Não foi possível carregar os feriados cadastrados: "+h.error.message);
    setPeriods(v.data??[]); setEmployees(e.data??[]); setHolidays(h.data??[]); setLoading(false);
  }
  useEffect(()=>{void load()},[]);

  const visible=useMemo(()=>periods.filter(p=>{
    const name=(p.employees?.full_name||employees.find(e=>e.id===p.employee_id)?.full_name||"").toLocaleLowerCase("pt-BR");
    const q=(name+" "+(p.title||"")+" "+(p.notes||"")).toLocaleLowerCase("pt-BR");
    return (!search||q.includes(search.toLocaleLowerCase("pt-BR")))&&(statusFilter==="all"||(statusFilter==="done"?p.completed:!p.completed));
  }),[periods,employees,search,statusFilter,holidayDates]);
  const counts={total:periods.length,open:periods.filter(p=>!p.completed).length,done:periods.filter(p=>p.completed).length,upcoming:periods.filter(p=>!p.completed&&p.start_date>=today()).length};

  function openNew(){setEditing(null);setForm({...blank});setModal(true);setError("")}
  function openEdit(p:Vacation){setEditing(p);setForm({employee_id:p.employee_id,title:p.title||"",start_date:p.start_date,end_date:p.end_date,notes:p.notes||"",completed:p.completed,acquisition_start_date:p.acquisition_start_date||"",acquisition_end_date:p.acquisition_end_date||"",concession_start_date:p.concession_start_date||"",concession_end_date:p.concession_end_date||""});setModal(true);setError("")}
  async function save(){
    if(!form.employee_id||!form.start_date||!form.end_date){setError("Preencha funcionário, início e fim do período.");return}
    if(form.end_date<form.start_date){setError("A data final não pode ser anterior à data inicial.");return}
    if(employees.find(e=>e.id===form.employee_id)?.hire_date&&!form.acquisition_start_date){setError("Selecione o período aquisitivo para que os blocos compartilhem o mesmo saldo de férias.");return}
    if(form.acquisition_start_date){
      const siblings=periods.filter(p=>p.employee_id===form.employee_id&&p.acquisition_start_date===form.acquisition_start_date&&p.id!==editing?.id);
      const days=dayCount(form.start_date,form.end_date,holidayDates);
      if(siblings.length>=3){setError("Este período aquisitivo já tem 3 blocos cadastrados. Não é possível adicionar um quarto bloco.");return}
      if(siblings.some(p=>form.start_date<=p.end_date&&form.end_date>=p.start_date)){setError("As datas deste bloco se sobrepõem a outro bloco de férias do mesmo período aquisitivo.");return}
      const totalDays=days+siblings.reduce((sum,p)=>sum+dayCount(p.start_date,p.end_date,holidayDates),0);
      if(totalDays>30){setError("A soma dos blocos ultrapassa 30 dias. Confira as datas e os blocos já cadastrados.");return}
      if(totalDays===30){const blockDays=[...siblings.map(p=>calendarDayCount(p.start_date,p.end_date)),calendarDayCount(form.start_date,form.end_date)];if(blockDays.some(n=>n<5)||!blockDays.some(n=>n>=14)){setError("Para completar os 30 dias fracionados, cada bloco deve ter pelo menos 5 dias corridos e um dos blocos deve ter pelo menos 14 dias corridos.");return}}
    }
    setSaving(true);setError("");
    const payload={employee_id:form.employee_id,title:form.title.trim()||null,start_date:form.start_date,end_date:form.end_date,notes:form.notes.trim()||null,completed:form.completed,completed_at:form.completed?(editing?.completed_at||new Date().toISOString()):null,acquisition_start_date:form.acquisition_start_date||null,acquisition_end_date:form.acquisition_end_date||null,concession_start_date:form.concession_start_date||null,concession_end_date:form.concession_end_date||null};
    const result=editing?await(supabase as any).from("vacation_periods").update(payload).eq("id",editing.id):await(supabase as any).from("vacation_periods").insert({...payload,created_by:(await supabase.auth.getSession()).data.session?.user.id||null});
    if(result.error){setError(result.error.message);setSaving(false);return}
    setSaving(false);setModal(false);await load();
  }
  async function toggleComplete(p:Vacation){
    setError("");
    const {error:e}=await(supabase as any).from("vacation_periods").update({completed:!p.completed,completed_at:!p.completed?new Date().toISOString():null}).eq("id",p.id);
    if(e)setError(e.message);else await load();
  }
  async function remove(){
    if(!confirmDelete)return;
    const {error:e}=await(supabase as any).from("vacation_periods").delete().eq("id",confirmDelete.id);
    if(e)setError(e.message);else{setConfirmDelete(null);await load()}
  }
  const entitlements=useMemo<Entitlement[]>(()=>{
    const current=today();
    return employees.filter(e=>e.hire_date).flatMap(employee=>{
      const cycles:Entitlement[]=[];
      for(let n=0;n<60;n++){
        const raw=makeEntitlement(employee,n);
        if(raw.acquisitionStart>addYears(current,1)) break;
        const vacations=periods.filter(p=>p.employee_id===employee.id&&p.acquisition_start_date===raw.acquisitionStart);
        const completedDays=vacations.filter(p=>p.completed).reduce((sum,p)=>sum+dayCount(p.start_date,p.end_date,holidayDates),0);
        const status:Entitlement["status"]=vacations.length>0&&completedDays>=30?"completed":vacations.length>0?"scheduled":current<raw.concessionStart?"acquisition":current<=raw.concessionEnd?"available":"overdue";
        cycles.push({...raw,status,vacations});
      }
      const pending=cycles.find(x=>x.status!=="completed");
      return pending?[pending]:[];
    }).sort((a,b)=>a.concessionEnd.localeCompare(b.concessionEnd));
  },[employees,periods,holidayDates]);
  const entitlementCounts={available:entitlements.filter(e=>e.status==="available").length,overdue:entitlements.filter(e=>e.status==="overdue").length,acquisition:entitlements.filter(e=>e.status==="acquisition").length,scheduled:entitlements.filter(e=>e.status==="scheduled").length};
  const employeeName=(p:Vacation)=>p.employees?.full_name||employees.find(e=>e.id===p.employee_id)?.full_name||"Funcionário não encontrado";

  return <div className="dp-screen min-h-screen bg-background">
    <main className="mx-auto max-w-[1450px] px-4 pb-10 pt-6 sm:px-7 sm:pt-8">
      <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-56 w-56 rounded-full bg-[#06CAA0]/20 blur-3xl"/>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10"><Palmtree className="h-6 w-6 text-[#7cebd0]"/></div><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#7cebd0]">PESSOAS • DP SUCCESS</p><h1 style={{color:"#fff",WebkitTextFillColor:"#fff"}} className="!text-white text-3xl font-semibold tracking-tight sm:text-4xl">Férias</h1><p className="mt-2 max-w-2xl text-sm text-slate-200">Organize os períodos, acompanhe o planejamento e marque cada etapa como concluída.</p></div></div>
          <button type="button" onClick={openNew} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#06CAA0] px-4 py-2.5 text-sm font-semibold text-[#082f2b] shadow-sm transition hover:bg-[#39dfb9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Plus className="h-4 w-4"/> Adicionar período</button>
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Períodos cadastrados</p><CalendarDays className="h-5 w-5 text-primary"/></div><p className="mt-3 font-display text-3xl font-semibold">{counts.total}</p><p className="mt-1 text-xs text-muted-foreground">Todos os registros</p></div>
        <div className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Em aberto</p><Clock3 className="h-5 w-5 text-amber-600"/></div><p className="mt-3 font-display text-3xl font-semibold">{counts.open}</p><p className="mt-1 text-xs text-muted-foreground">Aguardando conclusão</p></div>
        <div className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Concluídos</p><CheckCircle2 className="h-5 w-5 text-emerald-600"/></div><p className="mt-3 font-display text-3xl font-semibold">{counts.done}</p><p className="mt-1 text-xs text-muted-foreground">Períodos finalizados</p></div>
        <div className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Próximos períodos</p><CalendarCheck className="h-5 w-5 text-sky-600"/></div><p className="mt-3 font-display text-3xl font-semibold">{counts.upcoming}</p><p className="mt-1 text-xs text-muted-foreground">Com início hoje ou futuramente</p></div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
<div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Direito adquirido</p><p className="mt-2 text-2xl font-semibold text-emerald-700">{entitlementCounts.available}</p><p className="mt-1 text-xs text-muted-foreground">Podem ser programadas</p></div>
<div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Prazo concessivo vencido</p><p className="mt-2 text-2xl font-semibold text-red-700">{entitlementCounts.overdue}</p><p className="mt-1 text-xs text-muted-foreground">Exigem atenção do RH</p></div>
<div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Em aquisição</p><p className="mt-2 text-2xl font-semibold">{entitlementCounts.acquisition}</p><p className="mt-1 text-xs text-muted-foreground">Aguardando completar 12 meses</p></div>
<div className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">Férias programadas</p><p className="mt-2 text-2xl font-semibold text-sky-700">{entitlementCounts.scheduled}</p><p className="mt-1 text-xs text-muted-foreground">Vinculadas ao período aquisitivo</p></div>
</section>
<section className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-sm">
<div className="border-b p-4 sm:p-5"><h2 className="font-display text-lg font-semibold">Acompanhamento automático por funcionário</h2><p className="mt-1 text-sm text-muted-foreground">Os períodos são calculados pela data de admissão do cadastro. A conclusão das férias é registrada separadamente.</p></div>
{entitlements.length===0?<p className="p-6 text-sm text-muted-foreground">Não há funcionários com data de admissão válida para calcular os períodos.</p>:<div className="divide-y">{entitlements.map(e=><article key={e.employee.id+"-"+e.acquisitionStart} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{e.employee.full_name}</h3><span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold "+(e.status==="overdue"?"bg-red-100 text-red-800":e.status==="available"?"bg-emerald-100 text-emerald-800":e.status==="scheduled"?"bg-sky-100 text-sky-800":"bg-amber-100 text-amber-800")}>{e.status==="overdue"?"Prazo vencido":e.status==="available"?"Direito adquirido":e.status==="scheduled"?"Férias programadas":"Em aquisição"}</span></div><p className="mt-1 text-sm text-muted-foreground">Aquisitivo: {dateLabel(e.acquisitionStart)} a {dateLabel(e.acquisitionEnd)}</p><p className="text-sm text-muted-foreground">Concessivo: {dateLabel(e.concessionStart)} a {dateLabel(e.concessionEnd)}</p>{e.vacations&&e.vacations.length>0&&<p className="mt-1 text-xs text-muted-foreground">{e.vacations.length} bloco(s) · {e.vacations.reduce((sum,p)=>sum+dayCount(p.start_date,p.end_date,holidayDates),0)} de 30 dias programados · {e.vacations.filter(p=>p.completed).reduce((sum,p)=>sum+dayCount(p.start_date,p.end_date,holidayDates),0)} dias concluídos · {Math.max(0,30-e.vacations.reduce((sum,p)=>sum+dayCount(p.start_date,p.end_date,holidayDates),0))} dias restantes</p>}{e.status==="available"&&<p className="mt-1 text-xs font-medium text-emerald-700">Aviso para o RH: este funcionário já pode sair de férias.</p>}{e.status==="overdue"&&<p className="mt-1 text-xs font-medium text-red-700">Atenção: o prazo concessivo calculado já terminou.</p>}</div><div className="shrink-0">{e.status!=="completed"&&<button type="button" onClick={()=>{openNew();setForm(f=>({...f,employee_id:e.employee.id,acquisition_start_date:e.acquisitionStart,acquisition_end_date:e.acquisitionEnd,concession_start_date:e.concessionStart,concession_end_date:e.concessionEnd,title:"Férias · período aquisitivo "+dateLabel(e.acquisitionStart)+" a "+dateLabel(e.acquisitionEnd)}));}} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">{e.status==="scheduled"?"Adicionar bloco":"Programar férias"}</button>}</div></article>)}</div>}
</section>
<section className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h2 className="font-display text-lg font-semibold">Planejamento de férias</h2><p className="mt-1 text-sm text-muted-foreground">Cada bloco pode ser ajustado ou concluído individualmente; os blocos do mesmo período aquisitivo compartilham o mesmo saldo.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input aria-label="Buscar férias" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar funcionário ou observação" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm sm:w-64"/></div><select aria-label="Filtrar períodos" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)} className="h-10 rounded-lg border bg-background px-3 text-sm"><option value="open">Em aberto</option><option value="done">Concluídos</option><option value="all">Todos os períodos</option></select></div></div>
        {error&&!modal&&<div role="alert" className="m-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
        {loading?<div className="p-12 text-center text-sm text-muted-foreground">Carregando períodos...</div>:visible.length===0?<div className="flex flex-col items-center px-6 py-14 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CalendarDays className="h-7 w-7"/></div><h3 className="mt-4 font-semibold">{periods.length===0?"Vamos planejar as primeiras férias?":"Nenhum período encontrado"}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{periods.length===0?"Adicione um período, escolha o funcionário e informe as datas para começar seu planejamento.":"Experimente alterar o filtro ou a busca."}</p>{periods.length===0&&<button onClick={openNew} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4"/>Cadastrar primeiro período</button>}</div>:<div className="divide-y">{visible.map(p=><article key={p.id} className={`group flex flex-col gap-4 p-4 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${p.completed?"opacity-75":""}`}>
          <div className="flex min-w-0 items-start gap-4"><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${p.completed?"bg-emerald-100 text-emerald-700":"bg-[#e7f8f2] text-[#087a62]"}`}>{p.completed?<CheckCircle2 className="h-6 w-6"/>:<Palmtree className="h-6 w-6"/>}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-semibold ${p.completed?"line-through text-muted-foreground":""}`}>{employeeName(p)}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${p.completed?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800"}`}>{p.completed?"Concluído":"Em aberto"}</span></div>{p.title&&<p className="mt-1 text-sm text-muted-foreground">{p.title}</p>}<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4"/> {dateLabel(p.start_date)} a {dateLabel(p.end_date)}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4"/> {dayCount(p.start_date,p.end_date,holidayDates)} dias de férias (feriados cadastrados não descontam saldo)</span></div>{p.notes&&<p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}</div></div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"><button type="button" onClick={()=>void toggleComplete(p)} className={`inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition hover:bg-muted ${p.completed?"text-muted-foreground":"border-emerald-200 text-emerald-800"}`}>{p.completed?<Circle className="h-4 w-4"/>:<CheckCircle2 className="h-4 w-4"/>}{p.completed?"Reabrir":"Concluir"}</button><button type="button" onClick={()=>openEdit(p)} aria-label="Editar período" className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-muted"><Pencil className="h-4 w-4"/></button><button type="button" onClick={()=>setConfirmDelete(p)} aria-label="Excluir período" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4"/></button></div>
        </article>)}</div>}
      </section>
      <p className="mt-4 text-xs text-muted-foreground">Esta tela é um controle de planejamento. Ela não altera fechamento de ponto, banco de horas, folha ou cálculos históricos.</p>
    </main>

    {modal&&<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><section role="dialog" aria-modal="true" aria-labelledby="vacation-modal-title" className="my-auto w-full max-w-xl rounded-2xl border bg-card shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Planejamento de pessoas</p><h2 id="vacation-modal-title" className="mt-1 font-display text-xl font-semibold">{editing?"Editar período":"Adicionar período de férias"}</h2><p className="mt-1 text-sm text-muted-foreground">Cadastre cada bloco separadamente e vincule todos ao mesmo período aquisitivo. Feriados cadastrados não consomem dias do saldo de férias.</p></div><button type="button" onClick={()=>setModal(false)} aria-label="Fechar" className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5"/></button></div><div className="grid gap-4 p-5 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Funcionário<select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value,acquisition_start_date:"",acquisition_end_date:"",concession_start_date:"",concession_end_date:""})} className="h-11 rounded-lg border bg-background px-3 font-normal" required><option value="">Selecione o funcionário</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name}{e.termination_date?" · Inativo":""}</option>)}</select></label>
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Período aquisitivo a que estas férias pertencem <span className="text-xs font-normal text-muted-foreground">Selecione para vincular o planejamento ao direito correspondente.</span><select value={form.acquisition_start_date} onChange={e=>{const found=entitlements.find(x=>x.employee.id===form.employee_id&&x.acquisitionStart===e.target.value);setForm(f=>({...f,acquisition_start_date:e.target.value,acquisition_end_date:found?.acquisitionEnd||"",concession_start_date:found?.concessionStart||"",concession_end_date:found?.concessionEnd||"",title:f.title||(found?"Férias · período aquisitivo "+dateLabel(found.acquisitionStart)+" a "+dateLabel(found.acquisitionEnd):"")}));}} className="h-11 rounded-lg border bg-background px-3 font-normal"><option value="">Sem vínculo automático</option>{entitlements.filter(x=>x.employee.id===form.employee_id).map(x=><option key={x.acquisitionStart} value={x.acquisitionStart}>{dateLabel(x.acquisitionStart)} a {dateLabel(x.acquisitionEnd)} · {x.status==="available"?"Direito adquirido":x.status==="overdue"?"Prazo vencido":"Em aquisição"}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Identificação do período <span className="text-xs font-normal text-muted-foreground">Opcional</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Ex.: férias coletivas" className="h-11 rounded-lg border bg-background px-3 font-normal"/></label>
      <label className="grid gap-1.5 text-sm font-medium">Data de início<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className="h-11 rounded-lg border bg-background px-3 font-normal" required/></label>
      <label className="grid gap-1.5 text-sm font-medium">Data final<input type="date" value={form.end_date} min={form.start_date||undefined} onChange={e=>setForm({...form,end_date:e.target.value})} className="h-11 rounded-lg border bg-background px-3 font-normal" required/></label>
       {form.start_date&&form.end_date&&form.end_date>=form.start_date&&<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 sm:col-span-2"><strong>{dayCount(form.start_date,form.end_date,holidayDates)} dias de férias descontados do saldo</strong><p className="mt-1 text-xs">Período de {calendarDayCount(form.start_date,form.end_date)} dias corridos. {calendarDayCount(form.start_date,form.end_date)-dayCount(form.start_date,form.end_date,holidayDates)} feriado(s) cadastrado(s) desconsiderado(s) na contagem.</p></div>}
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Observações<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Anotações sobre o período (opcional)" className="rounded-lg border bg-background px-3 py-2 font-normal"/></label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.completed} onChange={e=>setForm({...form,completed:e.target.checked})} className="h-4 w-4 rounded"/>Marcar este período como concluído</label>
      {error&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      </div><div className="flex flex-col-reverse gap-2 border-t p-5 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancelar</button><button type="button" disabled={saving} onClick={()=>void save()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving?"Salvando...":"Salvar período"}</button></div></section></div>}
    {confirmDelete&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700"><Trash2 className="h-5 w-5"/></div><h2 className="mt-4 font-display text-xl font-semibold">Excluir este período?</h2><p className="mt-2 text-sm text-muted-foreground">O período de {employeeName(confirmDelete)} ({dateLabel(confirmDelete.start_date)} a {dateLabel(confirmDelete.end_date)}) será removido permanentemente.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setConfirmDelete(null)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" onClick={()=>void remove()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Excluir período</button></div></section></div>}
  </div>;
}
