import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Palmtree, Plus, Search, CheckCircle2, Pencil, Trash2, X, Clock3, CalendarCheck, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Vacation = { id:string; employee_id:string; title:string|null; start_date:string; end_date:string; notes:string|null; completed:boolean; completed_at:string|null; created_at:string; acquisition_start_date?:string|null; acquisition_end_date?:string|null; concession_start_date?:string|null; concession_end_date?:string|null; official_gozo_start_date?:string|null; official_gozo_end_date?:string|null; termination_paid?:boolean|null; employees?:{full_name:string}|null };
type Employee = { id:string; full_name:string; status?:string|null; termination_date?:string|null; hire_date?:string|null };
type Entitlement = { employee:Employee; acquisitionStart:string; acquisitionEnd:string; concessionStart:string; concessionEnd:string; cycle:number; status:"acquisition"|"available"|"overdue"|"scheduled"|"completed"; vacations?:Vacation[] };
const today = () => new Date().toISOString().slice(0,10);
const shiftDate = (iso:string, days:number) => { const d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const addYears = (iso:string, years:number) => { const [y,m,d]=iso.split("-").map(Number); const targetYear=y+years; const last=new Date(targetYear,m,0).getDate(); return String(targetYear)+"-"+String(m).padStart(2,"0")+"-"+String(Math.min(d,last)).padStart(2,"0"); };
const makeEntitlement = (employee:Employee, cycle:number) => { const acquisitionStart=addYears(employee.hire_date!,cycle); const nextAnniversary=addYears(employee.hire_date!,cycle+1); const concessionEnd=shiftDate(addYears(employee.hire_date!,cycle+2),-1); return { employee, cycle:cycle+1, acquisitionStart, acquisitionEnd:shiftDate(nextAnniversary,-1), concessionStart:nextAnniversary, concessionEnd }; };
const dateLabel = (v:string|null|undefined) => v ? v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4) : "—";
const calendarDayCount = (a:string,b:string) => Math.max(1,Math.round((new Date(b+"T00:00:00").getTime()-new Date(a+"T00:00:00").getTime())/86400000)+1);
const dayCount = (a:string,b:string) => {
  if (b < a) return 0;
  return Math.round((new Date(b+"T00:00:00").getTime()-new Date(a+"T00:00:00").getTime())/86400000)+1;
};
const blank = {employee_id:"",title:"",start_date:"",end_date:"",notes:"",completed:false,acquisition_start_date:"",acquisition_end_date:"",concession_start_date:"",concession_end_date:"",official_gozo_start_date:"",official_gozo_end_date:"",termination_paid:false};

export function Ferias() {
  const [periods,setPeriods]=useState<Vacation[]>([]);
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [search,setSearch]=useState("");
  const [statusFilter,setStatusFilter]=useState<"all"|"open"|"done">("open");
  const [modal,setModal]=useState(false);
  const [editing,setEditing]=useState<Vacation|null>(null);
  const [form,setForm]=useState(blank);
  const [extraBlocks,setExtraBlocks]=useState<Array<{start_date:string;end_date:string;notes:string}>>([]);
  const [blocksExpanded,setBlocksExpanded]=useState(false);
  const [saving,setSaving]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState<Vacation|null>(null);

  async function load() {
    setLoading(true); setError("");
    const [v,e]=await Promise.all([
      (supabase as any).from("vacation_periods").select("*,employees(full_name)").order("start_date",{ascending:true}),
      (supabase as any).from("employees").select("id,full_name,status,termination_date,hire_date").order("full_name"),
    ]);
    if(v.error){setError(v.error.message.includes("vacation_periods")||v.error.code==="42P01"?"A tabela de férias ainda não foi criada no banco de dados. A migração precisa ser aplicada.":v.error.message);}
    if(e.error && !v.error)setError(e.error.message);
    setPeriods(v.data??[]); setEmployees(e.data??[]); setLoading(false);
  }
  useEffect(()=>{void load()},[]);

  const visible=useMemo(()=>periods.filter(p=>{
    const name=(p.employees?.full_name||employees.find(e=>e.id===p.employee_id)?.full_name||"").toLocaleLowerCase("pt-BR");
    const q=(name+" "+(p.title||"")+" "+(p.notes||"")).toLocaleLowerCase("pt-BR");
    return (!search||q.includes(search.toLocaleLowerCase("pt-BR")))&&(statusFilter==="all"||(statusFilter==="done"?(p.completed||p.termination_paid):(!p.completed&&!p.termination_paid)));
  }),[periods,employees,search,statusFilter]);
  const counts={total:periods.length,open:periods.filter(p=>!p.completed&&!p.termination_paid).length,done:periods.filter(p=>p.completed||p.termination_paid).length,upcoming:periods.filter(p=>!p.completed&&!p.termination_paid&&p.start_date>=today()).length};
  // Agrupa todos os blocos salvos do mesmo funcionário e período aquisitivo em um único card.
  const visibleGroups=useMemo(()=>{
    const groups=new Map<string,Vacation[]>();
    periods.forEach(p=>{
      const key=p.acquisition_start_date
        ? p.employee_id+"::"+p.acquisition_start_date
        : p.employee_id+"::sem-periodo::"+(p.title||p.id);
      groups.set(key,[...(groups.get(key)||[]),p]);
    });
    return [...groups.entries()]
      .filter(([,blocks])=>blocks.some(p=>visible.some(v=>v.id===p.id)))
      .map(([key,blocks])=>({key,blocks:blocks.sort((a,b)=>a.start_date.localeCompare(b.start_date))}));
  },[periods,visible]);

  function openNew(){setEditing(null);setForm({...blank});setExtraBlocks([]);setBlocksExpanded(true);setModal(true);setError("")}
  function openEdit(p:Vacation){setEditing(p);setForm({employee_id:p.employee_id,title:p.title||"",start_date:p.start_date,end_date:p.end_date,notes:p.notes||"",completed:p.completed,acquisition_start_date:p.acquisition_start_date||"",acquisition_end_date:p.acquisition_end_date||"",concession_start_date:p.concession_start_date||"",concession_end_date:p.concession_end_date||"",official_gozo_start_date:p.official_gozo_start_date||"",official_gozo_end_date:p.official_gozo_end_date||"",termination_paid:Boolean(p.termination_paid)});setExtraBlocks([]);setBlocksExpanded(false);setModal(true);setError("")}
  async function save(){
    if(!form.employee_id||!form.start_date||!form.end_date){setError("Preencha funcionário, início e fim do período.");return}
    if(form.end_date<form.start_date){setError("A data final não pode ser anterior à data inicial.");return}
    if(extraBlocks.some(b=>!b.start_date||!b.end_date)){setError("Preencha as datas de início e fim de todos os blocos adicionais.");return}
    if(extraBlocks.some(b=>b.end_date<b.start_date)){setError("Em cada bloco adicional, a data final deve ser igual ou posterior à inicial.");return}
    if(Boolean(form.official_gozo_start_date)!==Boolean(form.official_gozo_end_date)){setError("Preencha as duas datas do Período de Gozo Oficial ou deixe ambas vazias.");return}
    if(form.official_gozo_start_date&&form.official_gozo_end_date&&form.official_gozo_end_date<form.official_gozo_start_date){setError("A data final do gozo oficial não pode ser anterior à data inicial.");return}
    if(employees.find(e=>e.id===form.employee_id)?.hire_date&&(!form.acquisition_start_date||!form.acquisition_end_date)){setError("Preencha o início e o fim do período aquisitivo.");return}
    if(form.acquisition_start_date&&form.acquisition_end_date&&form.acquisition_end_date<form.acquisition_start_date){setError("O fim do período aquisitivo não pode ser anterior ao início.");return}
    if(form.acquisition_end_date){form.concession_start_date=shiftDate(form.acquisition_end_date,1);form.concession_end_date=shiftDate(addYears(form.concession_start_date,1),-1)}
    setSaving(true);setError("");
    const payload={employee_id:form.employee_id,title:((!form.title||form.title.startsWith("Período aquisitivo ·")||/^Férias\\s*[·-]\\s*período aquisitivo/i.test(form.title))&&form.acquisition_start_date&&form.acquisition_end_date?"Período aquisitivo · "+dateLabel(form.acquisition_start_date)+" a "+dateLabel(form.acquisition_end_date):(form.title.trim()||null)),start_date:form.start_date,end_date:form.end_date,notes:form.notes.trim()||null,completed:form.completed,completed_at:form.completed?(editing?.completed_at||new Date().toISOString()):null,acquisition_start_date:form.acquisition_start_date||null,acquisition_end_date:form.acquisition_end_date||null,concession_start_date:form.concession_start_date||null,concession_end_date:form.concession_end_date||null,official_gozo_start_date:form.official_gozo_start_date||null,official_gozo_end_date:form.official_gozo_end_date||null};
    const result=editing?await(supabase as any).from("vacation_periods").update(payload).eq("id",editing.id):await(supabase as any).from("vacation_periods").insert({...payload,created_by:(await supabase.auth.getSession()).data.session?.user.id||null});
    if(result.error){setError(result.error.message);setSaving(false);return}
    if(extraBlocks.length){
      const sharedPayload={employee_id:form.employee_id,title:payload.title,completed:false,completed_at:null,acquisition_start_date:form.acquisition_start_date||null,acquisition_end_date:form.acquisition_end_date||null,concession_start_date:form.concession_start_date||null,concession_end_date:form.concession_end_date||null,official_gozo_start_date:form.official_gozo_start_date||null,official_gozo_end_date:form.official_gozo_end_date||null,termination_paid:Boolean(form.termination_paid)};
      const sessionUserId=(await supabase.auth.getSession()).data.session?.user.id||null;
      const {error:blocksError}=await(supabase as any).from("vacation_periods").insert(extraBlocks.map(b=>({...sharedPayload,start_date:b.start_date,end_date:b.end_date,notes:b.notes.trim()||null,created_by:sessionUserId})));
      if(blocksError){setError("O período principal foi salvo, mas houve erro ao adicionar os novos blocos: "+blocksError.message);setSaving(false);await load();return}
    }
    // Mantém os metadados e o gozo oficial iguais em todos os blocos do mesmo período.
    if(form.acquisition_start_date){
      const siblingIds=[...new Set(periods.filter(p=>p.employee_id===form.employee_id&&p.id!==editing?.id&&(
        p.acquisition_start_date===form.acquisition_start_date||
        (editing?.acquisition_start_date&&p.employee_id===editing.employee_id&&p.acquisition_start_date===editing.acquisition_start_date)
      )).map(p=>p.id))];
      if(siblingIds.length){
        const {error:syncError}=await(supabase as any).from("vacation_periods").update({
          acquisition_start_date:form.acquisition_start_date,
          acquisition_end_date:form.acquisition_end_date||null,
          concession_start_date:form.concession_start_date||null,
          concession_end_date:form.concession_end_date||null,
          official_gozo_start_date:form.official_gozo_start_date||null,
          official_gozo_end_date:form.official_gozo_end_date||null,
        }).in("id",siblingIds);
        if(syncError){setError("O bloco foi salvo, mas não foi possível sincronizar os dados do período: "+syncError.message);setSaving(false);await load();return}
      }
    }
    setSaving(false);setModal(false);await load();
  }
  async function markTerminationPaid(entitlement:Entitlement){
    setError("");
    const related=periods.filter(p=>p.employee_id===entitlement.employee.id&&p.acquisition_start_date===entitlement.acquisitionStart);
    if(related.some(p=>p.termination_paid)){
      const ids=related.map(p=>p.id);
      const {error:e}=await(supabase as any).from("vacation_periods").update({termination_paid:false}).in("id",ids);
      if(e){setError(e.message);return}
      await load();
      return;
    }
    if(related.length){
      const {error:e}=await(supabase as any).from("vacation_periods").update({termination_paid:true}).in("id",related.map(p=>p.id));
      if(e){setError(e.message);return}
      await load();
      return;
    }
    const sessionUserId=(await supabase.auth.getSession()).data.session?.user.id||null;
    const anchorDate=entitlement.employee.termination_date||today();
    const {error:e}=await(supabase as any).from("vacation_periods").insert({
      employee_id:entitlement.employee.id,
      title:"Pago em rescisão · período aquisitivo "+dateLabel(entitlement.acquisitionStart)+" a "+dateLabel(entitlement.acquisitionEnd),
      start_date:anchorDate,
      end_date:anchorDate,
      notes:"Registro de controle: férias proporcionais pagas na rescisão. Datas do registro não representam gozo de férias.",
      completed:true,
      completed_at:new Date().toISOString(),
      acquisition_start_date:entitlement.acquisitionStart,
      acquisition_end_date:entitlement.acquisitionEnd,
      concession_start_date:entitlement.concessionStart,
      concession_end_date:entitlement.concessionEnd,
      official_gozo_start_date:null,
      official_gozo_end_date:null,
      termination_paid:true,
      created_by:sessionUserId
    });
    if(e){setError(e.message);return}
    await load();
  }

  async function remove(){
    if(!confirmDelete)return;
    const {error:e}=await(supabase as any).from("vacation_periods").delete().eq("id",confirmDelete.id);
    if(e)setError(e.message);else{setConfirmDelete(null);await load()}
  }
  const entitlements=useMemo<Entitlement[]>(()=>{
    const current=today();
    return employees.filter(e=>e.hire_date&&!periods.some(p=>p.employee_id===e.id&&p.termination_paid)).flatMap(employee=>{
      const cycles:Entitlement[]=[];
      for(let n=0;n<60;n++){
        const raw=makeEntitlement(employee,n);
        if(raw.acquisitionStart>addYears(current,1)) break;
        const vacations=periods.filter(p=>p.employee_id===employee.id&&p.acquisition_start_date===raw.acquisitionStart);
        const official=vacations.find(p=>p.official_gozo_start_date&&p.official_gozo_end_date);
        const officialDays=official?dayCount(official.official_gozo_start_date!,official.official_gozo_end_date!):0;
        const status:Entitlement["status"]=officialDays>=30?"completed":official?"scheduled":current<raw.concessionStart?"acquisition":current<=raw.concessionEnd?"available":"overdue";
        cycles.push({...raw,status,vacations});
      }
      const pending=cycles.find(x=>x.status!=="completed");
      return pending?[pending]:[];
    }).sort((a,b)=>a.concessionEnd.localeCompare(b.concessionEnd));
  },[employees,periods]);
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
<div className="border-b p-4 sm:p-5"><h2 className="font-display text-lg font-semibold">Acompanhamento automático por funcionário</h2><p className="mt-1 text-sm text-muted-foreground">O saldo de dias programados considera exclusivamente o Período de Gozo Oficial. Os blocos cadastrados são apenas informativos.</p></div>
{entitlements.length===0?<p className="p-6 text-sm text-muted-foreground">Não há funcionários com data de admissão válida para calcular os períodos.</p>:<div className="divide-y">{entitlements.map(e=><article key={e.employee.id+"-"+e.acquisitionStart} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{e.employee.full_name}</h3><span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold "+(e.status==="overdue"?"bg-red-100 text-red-800":e.status==="available"?"bg-emerald-100 text-emerald-800":e.status==="scheduled"?"bg-sky-100 text-sky-800":"bg-amber-100 text-amber-800")}>{e.status==="overdue"?"Prazo vencido":e.status==="available"?"Direito adquirido":e.status==="scheduled"?"Férias programadas":"Em aquisição"}</span></div><p className="mt-1 text-sm text-muted-foreground">Aquisitivo: {dateLabel(e.acquisitionStart)} a {dateLabel(e.acquisitionEnd)}</p><p className="text-sm text-muted-foreground">Concessivo: {dateLabel(e.concessionStart)} a {dateLabel(e.concessionEnd)}</p>{e.vacations&&e.vacations.some(p=>p.official_gozo_start_date&&p.official_gozo_end_date)&&(()=>{const official=e.vacations!.find(p=>p.official_gozo_start_date&&p.official_gozo_end_date)!;const days=dayCount(official.official_gozo_start_date!,official.official_gozo_end_date!);return <p className="mt-1 text-xs text-muted-foreground">Gozo oficial: {dateLabel(official.official_gozo_start_date)} a {dateLabel(official.official_gozo_end_date)} · {days} de 30 dias considerados · {Math.max(0,30-days)} dias restantes</p>})()}{e.status==="available"&&<p className="mt-1 text-xs font-medium text-emerald-700">Aviso para o RH: este funcionário já pode sair de férias.</p>}{e.status==="overdue"&&<p className="mt-1 text-xs font-medium text-red-700">Atenção: o prazo concessivo calculado já terminou.</p>}</div><div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">{e.status!=="completed"&&<button type="button" onClick={()=>{openNew();setForm(f=>({...f,employee_id:e.employee.id,acquisition_start_date:e.acquisitionStart,acquisition_end_date:e.acquisitionEnd,concession_start_date:e.concessionStart,concession_end_date:e.concessionEnd,title:"Férias · período aquisitivo "+dateLabel(e.acquisitionStart)+" a "+dateLabel(e.acquisitionEnd)}));}} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">{e.status==="scheduled"?"Adicionar bloco":"Programar férias"}</button>}<button type="button" onClick={()=>void markTerminationPaid(e)} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">{e.vacations?.some(p=>p.termination_paid)?"Desfazer":"Pago em rescisão"}</button></div></article>)}</div>}
</section>
<section className="mt-6 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h2 className="font-display text-lg font-semibold">Planejamento de férias</h2><p className="mt-1 text-sm text-muted-foreground">Cada bloco pode ser ajustado ou concluído individualmente; os blocos do mesmo período aquisitivo compartilham o mesmo saldo.</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input aria-label="Buscar férias" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar funcionário ou observação" className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm sm:w-64"/></div><select aria-label="Filtrar períodos" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)} className="h-10 rounded-lg border bg-background px-3 text-sm"><option value="open">Em aberto</option><option value="done">Concluídos</option><option value="all">Todos os períodos</option></select></div></div>
        {error&&!modal&&<div role="alert" className="m-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
        {loading?<div className="p-12 text-center text-sm text-muted-foreground">Carregando períodos...</div>:visibleGroups.length===0?<div className="flex flex-col items-center px-6 py-14 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><CalendarDays className="h-7 w-7"/></div><h3 className="mt-4 font-semibold">{periods.length===0?"Vamos planejar as primeiras férias?":"Nenhum período encontrado"}</h3><p className="mt-1 max-w-md text-sm text-muted-foreground">{periods.length===0?"Adicione um período, escolha o funcionário e informe as datas para começar seu planejamento.":"Experimente alterar o filtro ou a busca."}</p>{periods.length===0&&<button onClick={openNew} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4"/>Cadastrar primeiro período</button>}</div>:<div className="divide-y">{visibleGroups.map(group=>{
          const blocks=group.blocks;
          const first=blocks[0];
          const officialBlock=blocks.find(p=>p.official_gozo_start_date&&p.official_gozo_end_date);
          const totalDays=officialBlock?dayCount(officialBlock.official_gozo_start_date!,officialBlock.official_gozo_end_date!):0;
          const paidInTermination=blocks.some(p=>p.termination_paid);
          const allCompleted=totalDays>=30;
          return <article key={group.key} className={`p-4 transition-colors hover:bg-muted/20 sm:p-5 ${allCompleted?"opacity-80":""}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-4"><div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${allCompleted?"bg-emerald-100 text-emerald-700":"bg-[#e7f8f2] text-[#087a62]"}`}>{allCompleted?<CheckCircle2 className="h-6 w-6"/>:<Palmtree className="h-6 w-6"/>}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{employeeName(first)}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${paidInTermination?"bg-amber-100 text-amber-900":allCompleted?"bg-emerald-100 text-emerald-800":blocks.some(p=>p.completed)?"bg-sky-100 text-sky-800":"bg-amber-100 text-amber-800"}`}>{paidInTermination?"Pago em rescisão":allCompleted?"Concluído":blocks.some(p=>p.completed)?"Parcialmente concluído":"Em aberto"}</span><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold">{blocks.length} bloco(s)</span></div>
                {first.acquisition_start_date&&<><p className="mt-1 text-sm text-muted-foreground">Período aquisitivo: {dateLabel(first.acquisition_start_date)} a {dateLabel(first.acquisition_end_date)}</p>{first.concession_start_date&&first.concession_end_date&&<p className="text-sm text-muted-foreground">Período concessivo: {dateLabel(first.concession_start_date)} a {dateLabel(first.concession_end_date)}</p>}<p className="mt-1 text-sm font-medium text-emerald-800">Período de Gozo Oficial: {officialBlock?.official_gozo_start_date&&officialBlock?.official_gozo_end_date?dateLabel(officialBlock.official_gozo_start_date)+" a "+dateLabel(officialBlock.official_gozo_end_date):"Não informado"}</p></>}
                {first.title&&!/^Férias\s*[·-]\s*período aquisitivo\b/i.test(first.title)&&<p className="mt-1 text-sm text-muted-foreground">{first.title}</p>}
                <p className="mt-2 text-sm text-muted-foreground">{officialBlock?`${totalDays} dias considerados exclusivamente pelo Gozo Oficial · ${Math.max(0,30-totalDays)} dias restantes`:"Nenhum dia contabilizado: informe o Período de Gozo Oficial."}</p>
              </div></div>
              <div className="shrink-0 text-xs text-muted-foreground">Blocos reunidos neste período</div>
            </div>
            <div className="mt-4 space-y-3 border-l-2 border-emerald-100 pl-4 sm:ml-6">
              {blocks.map((p,index)=><div key={p.id} className="rounded-xl border bg-background p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bloco {index+1}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${p.completed?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800"}`}>{p.completed?"Concluído":"Em aberto"}</span></div><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4"/> {dateLabel(p.start_date)} a {dateLabel(p.end_date)}</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4"/> {calendarDayCount(p.start_date,p.end_date)} dias corridos · informativo</span></div>{p.notes&&<p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{p.notes}</p>}</div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end"><span className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">Informativo</span><button type="button" onClick={()=>openEdit(p)} aria-label="Editar bloco informativo" className="flex h-9 w-9 items-center justify-center rounded-lg border hover:bg-muted"><Pencil className="h-4 w-4"/></button><button type="button" onClick={()=>setConfirmDelete(p)} aria-label="Excluir bloco informativo" className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4"/></button></div>
                </div>
              </div>)}
            </div>
          </article>;
        })}</div>}
      </section>
      <p className="mt-4 text-xs text-muted-foreground">Esta tela é um controle de planejamento. Ela não altera fechamento de ponto, banco de horas, folha ou cálculos históricos.</p>
    </main>

    {modal&&<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><section role="dialog" aria-modal="true" aria-labelledby="vacation-modal-title" className="my-auto w-full max-w-xl rounded-2xl border bg-card shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Planejamento de pessoas</p><h2 id="vacation-modal-title" className="mt-1 font-display text-xl font-semibold">{editing?"Editar período":"Adicionar período de férias"}</h2><p className="mt-1 text-sm text-muted-foreground">Cadastre cada bloco separadamente e vincule todos ao mesmo período aquisitivo.</p></div><button type="button" onClick={()=>setModal(false)} aria-label="Fechar" className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5"/></button></div><div className="grid gap-4 p-5 sm:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Funcionário<select value={form.employee_id} onChange={e=>{setForm({...form,employee_id:e.target.value,acquisition_start_date:"",acquisition_end_date:"",concession_start_date:"",concession_end_date:""});setExtraBlocks([])}} className="h-11 rounded-lg border bg-background px-3 font-normal" required><option value="">Selecione o funcionário</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name}{e.termination_date?" · Inativo":""}</option>)}</select></label>
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2"><div className="rounded-xl border p-4"><p className="font-semibold">Período aquisitivo</p><p className="mb-3 mt-1 text-xs text-muted-foreground">Edite as datas conforme o período real, inclusive quando houver recesso de fim de ano.</p><div className="grid gap-3"><label className="grid gap-1.5 text-sm font-medium">Data de início<input type="date" value={form.acquisition_start_date} onChange={e=>{const start=e.target.value;setForm(f=>({...f,acquisition_start_date:start,acquisition_end_date:f.acquisition_end_date&&f.acquisition_end_date<start?"":f.acquisition_end_date,...((f.title.startsWith("Período aquisitivo ·")||/^Férias\\s*[·-]\\s*período aquisitivo/i.test(f.title))||!f.title?{title:start?"Período aquisitivo · "+dateLabel(start)+" a "+dateLabel(f.acquisition_end_date):""}:{})}))}} className="h-11 rounded-lg border bg-background px-3 font-normal"/></label><label className="grid gap-1.5 text-sm font-medium">Data final<input type="date" value={form.acquisition_end_date} min={form.acquisition_start_date||undefined} onChange={e=>{const end=e.target.value;setForm(f=>({...f,acquisition_end_date:end,concession_start_date:end?shiftDate(end,1):"",concession_end_date:end?shiftDate(addYears(shiftDate(end,1),1),-1):"",title:(!f.title||f.title.startsWith("Período aquisitivo ·")||/^Férias\\s*[·-]\\s*período aquisitivo/i.test(f.title))?(f.acquisition_start_date&&end?"Período aquisitivo · "+dateLabel(f.acquisition_start_date)+" a "+dateLabel(end):""):f.title}))}} className="h-11 rounded-lg border bg-background px-3 font-normal"/></label></div></div><div className="rounded-xl border bg-muted/20 p-4"><p className="font-semibold">Período concessivo</p><p className="mb-3 mt-1 text-xs text-muted-foreground">Calculado automaticamente: começa no dia seguinte ao fim do aquisitivo e dura 1 ano.</p><div className="grid gap-3"><label className="grid gap-1.5 text-sm font-medium">Data de início<input type="date" value={form.acquisition_end_date?shiftDate(form.acquisition_end_date,1):""} readOnly className="h-11 rounded-lg border bg-background px-3 font-normal text-muted-foreground"/></label><label className="grid gap-1.5 text-sm font-medium">Data final<input type="date" value={form.acquisition_end_date?shiftDate(addYears(shiftDate(form.acquisition_end_date,1),1),-1):""} readOnly className="h-11 rounded-lg border bg-background px-3 font-normal text-muted-foreground"/></label></div></div></div><label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Identificação do período<input value={(form.acquisition_start_date&&form.acquisition_end_date&&(!form.title||form.title.startsWith("Período aquisitivo ·")||/^Férias\\s*[·-]\\s*período aquisitivo/i.test(form.title)))?"Período aquisitivo · "+dateLabel(form.acquisition_start_date)+" a "+dateLabel(form.acquisition_end_date):form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Gerada a partir do período aquisitivo" className="h-11 rounded-lg border bg-background px-3 font-normal"/></label>
      <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 sm:col-span-2"><div><p className="font-semibold text-emerald-900">Período de Gozo Oficial</p><p className="mt-1 text-xs text-muted-foreground">Somente estas datas são usadas no cálculo dos dias de férias.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Data de início oficial<input type="date" value={form.official_gozo_start_date} onChange={e=>setForm({...form,official_gozo_start_date:e.target.value})} className="h-11 rounded-lg border bg-background px-3 font-normal"/></label><label className="grid gap-1.5 text-sm font-medium">Data final oficial<input type="date" value={form.official_gozo_end_date} min={form.official_gozo_start_date||undefined} onChange={e=>setForm({...form,official_gozo_end_date:e.target.value})} className="h-11 rounded-lg border bg-background px-3 font-normal"/></label></div>{form.official_gozo_start_date&&form.official_gozo_end_date&&form.official_gozo_end_date>=form.official_gozo_start_date&&<p className="text-sm font-semibold text-emerald-900">{dayCount(form.official_gozo_start_date,form.official_gozo_end_date)} dias considerados no gozo oficial</p>}</div>
      {!blocksExpanded&&<label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Observações<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Observação do bloco informativo (opcional)" className="rounded-lg border bg-background px-3 py-2 font-normal"/></label>}
      <div className="rounded-xl border sm:col-span-2"><div className="flex items-center justify-between gap-3 p-4"><div><p className="font-semibold">Bloco Informativo 1</p><p className="mt-1 text-xs text-muted-foreground">Este é o primeiro bloco do período. Você pode informar as datas e adicionar observações; ele não altera o cálculo do gozo oficial.</p></div><button type="button" onClick={()=>setBlocksExpanded(v=>!v)} aria-expanded={blocksExpanded} className="inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">{blocksExpanded?<X className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}{blocksExpanded?"Ocultar informações":"Mostrar informações"}</button></div>
      {blocksExpanded&&<div className="space-y-4 border-t p-4"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Data de início do bloco informativo<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className="h-11 rounded-lg border bg-background px-3 font-normal" required/></label><label className="grid gap-1.5 text-sm font-medium">Data final do bloco informativo<input type="date" value={form.end_date} min={form.start_date||undefined} onChange={e=>setForm({...form,end_date:e.target.value})} className="h-11 rounded-lg border bg-background px-3 font-normal" required/></label></div>
      <div className="grid gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-semibold">Adicionar outros blocos informativos</p><p className="mt-1 text-xs text-muted-foreground">Adicione outros blocos ao mesmo período aquisitivo.</p></div><button type="button" onClick={()=>setExtraBlocks(blocks=>[...blocks,{start_date:"",end_date:"",notes:""}])} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4"/>Adicionar bloco</button></div>{extraBlocks.map((block,index)=><div key={index} className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2"><div className="flex items-center justify-between sm:col-span-2"><p className="text-sm font-semibold">Bloco Informativo {index+2}</p><button type="button" onClick={()=>setExtraBlocks(blocks=>blocks.filter((_,i)=>i!==index))} className="rounded-lg p-1.5 text-red-700 hover:bg-red-50" aria-label={"Remover bloco informativo "+(index+2)}><Trash2 className="h-4 w-4"/></button></div><label className="grid gap-1.5 text-sm font-medium">Data de início<input type="date" value={block.start_date} onChange={e=>setExtraBlocks(blocks=>blocks.map((b,i)=>i===index?{...b,start_date:e.target.value}:b))} className="h-11 rounded-lg border bg-background px-3 font-normal" required/></label><label className="grid gap-1.5 text-sm font-medium">Data final<input type="date" min={block.start_date||undefined} value={block.end_date} onChange={e=>setExtraBlocks(blocks=>blocks.map((b,i)=>i===index?{...b,end_date:e.target.value}:b))} className="h-11 rounded-lg border bg-background px-3 font-normal" required/></label><label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Observação do bloco (opcional)<input value={block.notes} onChange={e=>setExtraBlocks(blocks=>blocks.map((b,i)=>i===index?{...b,notes:e.target.value}:b))} className="h-10 rounded-lg border bg-background px-3 font-normal"/></label></div>)}</div></div>}
      </div>
      {blocksExpanded&&<label className="grid gap-1.5 text-sm font-medium sm:col-span-2">Observações<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Anotações sobre o período (opcional)" className="rounded-lg border bg-background px-3 py-2 font-normal"/></label>}
      <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.completed} onChange={e=>setForm({...form,completed:e.target.checked})} className="h-4 w-4 rounded"/>Marcar este período como concluído</label>
      {error&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      </div><div className="flex flex-col-reverse gap-2 border-t p-5 sm:flex-row sm:justify-end"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancelar</button><button type="button" disabled={saving} onClick={()=>void save()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving?"Salvando...":"Salvar período"}</button></div></section></div>}
    {confirmDelete&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-700"><Trash2 className="h-5 w-5"/></div><h2 className="mt-4 font-display text-xl font-semibold">Excluir este período?</h2><p className="mt-2 text-sm text-muted-foreground">O período de {employeeName(confirmDelete)} ({dateLabel(confirmDelete.start_date)} a {dateLabel(confirmDelete.end_date)}) será removido permanentemente.</p><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setConfirmDelete(null)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" onClick={()=>void remove()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Excluir período</button></div></section></div>}
  </div>;
}
