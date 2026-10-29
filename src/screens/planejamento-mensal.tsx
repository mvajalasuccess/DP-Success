import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Cake, CalendarCheck, Stethoscope, GraduationCap, Palmtree, RefreshCw, AlertCircle } from "lucide-react";
import { ScreenBrand } from "@/components/screen-brand";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type EventItem = { id: string; date: string; title: string; detail: string; kind: "birthday" | "holiday" | "vacation" | "training" | "exam" | "task" };
const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const dateKey = (y:number,m:number,d:number) => String(y)+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
const dateLabel = (v:string) => { const p=v.slice(0,10).split("-"); return p[2]+"/"+p[1]+"/"+p[0]; };
const labels = {birthday:"Aniversário",holiday:"Feriado",vacation:"Férias",training:"Treinamento",exam:"Exame",task:"Prazo / tarefa"};
function EventIcon({kind}:{kind:EventItem["kind"]}) {
  const cls="h-4 w-4 shrink-0";
  if(kind==="birthday") return <Cake className={cls}/>;
  if(kind==="holiday") return <CalendarCheck className={cls}/>;
  if(kind==="vacation") return <Palmtree className={cls}/>;
  if(kind==="training") return <GraduationCap className={cls}/>;
  if(kind==="exam") return <Stethoscope className={cls}/>;
  return <CalendarDays className={cls}/>;
}

export function PlanejamentoMensal() {
  const [month,setMonth]=useState(new Date().getMonth());
  const [year,setYear]=useState(new Date().getFullYear());
  const [selectedDay,setSelectedDay]=useState(dateKey(new Date().getFullYear(),new Date().getMonth(),new Date().getDate()));
  const [events,setEvents]=useState<EventItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");

  async function load() {
    setLoading(true); setError("");
    const [emp,hol,tasks,docs,vacations]=await Promise.all([
      (supabase as any).from("employees").select("*").order("full_name"),
      (supabase as any).from("holidays").select("*"),
      (supabase as any).from("tasks").select("id,title,category,due_date,status").neq("status","done").not("due_date","is",null),
      (supabase as any).from("employee_document_records").select("id,employee_id,document_name,due_date,status,employees(full_name),employee_document_catalog(alert_days,category)").not("due_date","is",null).eq("status","active"),
      (supabase as any).from("vacation_periods").select("id,employee_id,acquisition_start_date,official_gozo_start_date,official_gozo_end_date,employees(full_name)").not("official_gozo_start_date","is",null).not("official_gozo_end_date","is",null)
    ]);
    if(emp.error || hol.error || tasks.error || docs.error || vacations.error) setError("Algumas informações não puderam ser carregadas. Verifique os cadastros e as permissões.");
    const all:EventItem[]=[];
    (emp.data||[]).forEach((e:any)=>{
      const dob=e.birth_date||e.date_of_birth||e.birthdate||e.data_nascimento;
      if(dob && e.status!=="inativo" && String(dob).slice(5,7)===String(month+1).padStart(2,"0"))
        all.push({id:"b-"+e.id,date:String(year)+"-"+String(dob).slice(5,10),title:e.full_name||"Funcionário",detail:"Aniversário",kind:"birthday"});
    });
    (hol.data||[]).forEach((h:any)=>{
      const raw=h.holiday_date||h.date||h.day; if(!raw || h.is_demo===true) return;
      const v=String(raw).slice(0,10); const recurring=h.recurring===true||h.is_recurring===true;
      const d=recurring?String(year)+"-"+v.slice(5,10):v;
      if(d.slice(0,4)===String(year) && Number(d.slice(5,7))===month+1)
        all.push({id:"h-"+(h.id||d),date:d,title:h.name||h.title||h.description||"Feriado",detail:"Feriado cadastrado",kind:"holiday"});
    });
    (tasks.data||[]).forEach((t:any)=>{
      const d=String(t.due_date||"").slice(0,10);
      if(d.slice(0,4)===String(year)&&Number(d.slice(5,7))===month+1)
        all.push({id:"t-"+t.id,date:d,title:t.title||"Prazo",detail:t.category||"Tarefa",kind:"task"});
    });
    (docs.data||[]).forEach((doc:any)=>{
      const d=String(doc.due_date||"").slice(0,10);
      if(d.slice(0,4)!==String(year)||Number(d.slice(5,7))!==month+1) return;
      const label=String(doc.document_name||"Documento");
      const normalized=label.toLocaleLowerCase("pt-BR");
      const category=String(doc.employee_document_catalog?.category||"").toLocaleLowerCase("pt-BR");
      const kind:EventItem["kind"]=category.includes("trein")||normalized.includes("trein")||normalized.includes("curso")? "training" : category.includes("exame")||normalized.includes("exame")||normalized.includes("aso")? "exam" : "task";
      const days=Math.ceil((new Date(d+"T00:00:00").getTime()-new Date(dateKey(new Date().getFullYear(),new Date().getMonth(),new Date().getDate())+"T00:00:00").getTime())/86400000);
      const alertDays=Number(doc.employee_document_catalog?.alert_days??30);
      const person=doc.employees?.full_name ? " · "+doc.employees.full_name : "";
      all.push({id:"doc-"+doc.id,date:d,title:"Vencimento: "+label,detail:(days<0?"Vencido":days<=alertDays?"Próximo do vencimento":"Vencimento agendado")+person,kind});
    });
    const officialVacationKeys=new Set<string>();
    (vacations.data||[]).forEach((v:any)=>{
      const start=String(v.official_gozo_start_date||"").slice(0,10); const end=String(v.official_gozo_end_date||"").slice(0,10);
      if(!start||!end||end<start) return;
      const officialKey=String(v.employee_id)+"|"+String(v.acquisition_start_date||"")+"|"+start+"|"+end;
      if(officialVacationKeys.has(officialKey)) return;
      officialVacationKeys.add(officialKey);
      const monthStart=dateKey(year,month,1); const monthEnd=dateKey(year,month,new Date(year,month+1,0).getDate());
      if(end<monthStart||start>monthEnd) return;
      const first=start<monthStart?monthStart:start; const last=end>monthEnd?monthEnd:end;
      const firstDate=new Date(first+"T12:00:00"); const lastDate=new Date(last+"T12:00:00");
      for(const d=new Date(firstDate);d<=lastDate;d.setDate(d.getDate()+1)){
        const date=dateKey(d.getFullYear(),d.getMonth(),d.getDate());
        all.push({id:"vac-"+v.id+"-"+date,date,title:"Férias · "+(v.employees?.full_name||"Funcionário"),detail:"Período de férias · "+dateLabel(start)+" a "+dateLabel(end),kind:"vacation"});
      }
    });
    
    setEvents(all.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title)));
    setLoading(false);
  }
  useEffect(()=>{void load();},[month,year]);
  const days=new Date(year,month+1,0).getDate();
  const firstDay=new Date(year,month,1).getDay();
  const byDay=useMemo(()=>events.reduce<Record<string,EventItem[]>>((a,e)=>{(a[e.date]||(a[e.date]=[])).push(e);return a;},{}),[events]);
  const monthEvents=events.filter(e=>Number(e.date.slice(5,7))===month+1);
  const selected=byDay[selectedDay]||[];
  const today=dateKey(new Date().getFullYear(),new Date().getMonth(),new Date().getDate());
  function move(delta:number){const d=new Date(year,month+delta,1);setYear(d.getFullYear());setMonth(d.getMonth());setSelectedDay(dateKey(d.getFullYear(),d.getMonth(),1));}

  return <div className="dp-screen min-h-screen bg-background">
    <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4"><a href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a><ScreenBrand name="Planejamento Mensal" /></div></header>
    <main className="mx-auto max-w-[1350px] space-y-5 px-6 py-6">
    <div className="relative isolate mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 flex flex-wrap items-center justify-between gap-4 [&_p]:!text-white/75 [&_h1]:!text-white"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Organização do RH</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Planejamento mensal</h1><p className="mt-1 text-sm text-muted-foreground">Antecipe datas importantes, prazos e compromissos do RH.</p></div><button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4"/>Atualizar</button></div>
      {error&&<div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><AlertCircle className="h-4 w-4"/>{error}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-semibold">{months[month]} de {year}</h2><p className="text-sm text-muted-foreground">{monthEvents.length} compromisso(s) no mês</p></div><div className="flex items-center gap-2"><button aria-label="Mês anterior" onClick={()=>move(-1)} className="rounded-lg border p-2 hover:bg-muted"><ChevronLeft className="h-4 w-4"/></button><button onClick={()=>{const d=new Date();setMonth(d.getMonth());setYear(d.getFullYear());setSelectedDay(dateKey(d.getFullYear(),d.getMonth(),d.getDate()));}} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Hoje</button><button aria-label="Próximo mês" onClick={()=>move(1)} className="rounded-lg border p-2 hover:bg-muted"><ChevronRight className="h-4 w-4"/></button></div></div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.9fr)]">
        <Card className="p-4 sm:p-5"><div className="grid grid-cols-7 gap-1 sm:gap-2">{["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=><div key={d} className="py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>)}
          {Array.from({length:firstDay},(_,i)=><div key={"blank-"+i} className="min-h-[72px] rounded-lg bg-muted/20 sm:min-h-[96px]"/>)}
          {Array.from({length:days},(_,i)=>{const day=i+1;const key=dateKey(year,month,day);const items=byDay[key]||[];return <button key={key} onClick={()=>setSelectedDay(key)} className={"min-h-[72px] rounded-lg border p-1.5 text-left sm:min-h-[96px] sm:p-2 "+(selectedDay===key?"border-primary bg-primary/5 ring-1 ring-primary/30":"border-border/60 hover:bg-muted/50")+(today===key?" shadow-[inset_0_0_0_1px_hsl(var(--primary))]":"")}><span className={"flex h-6 w-6 items-center justify-center rounded-full text-xs "+(today===key?"bg-primary text-primary-foreground":"font-medium")}>{day}</span><div className="mt-1 space-y-1">{items.slice(0,2).map(e=><span key={e.id} className={"block truncate rounded px-1 py-0.5 text-[9px] sm:text-[10px] "+(e.kind==="birthday"?"bg-pink-500/10 text-pink-700 dark:text-pink-300":e.kind==="holiday"?"bg-amber-500/10 text-amber-700 dark:text-amber-300":"bg-primary/10 text-primary")}>{e.title}</span>)}{items.length>2&&<span className="block text-[9px] text-muted-foreground">+{items.length-2} mais</span>}</div></button>})}
        </div><div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-xs text-muted-foreground"><span>Aniversários</span><span>Feriados</span><span className="text-emerald-700">Férias</span><span>Prazos e tarefas</span></div></Card>
        <div className="space-y-4"><Card className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Agenda do dia</p><h3 className="mt-1 text-lg font-semibold">{dateLabel(selectedDay)}</h3></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs">{selected.length}</span></div><div className="mt-4 space-y-2">{loading?<p className="py-6 text-center text-sm text-muted-foreground">Carregando agenda...</p>:selected.length===0?<p className="py-8 text-center text-sm text-muted-foreground">Nenhum compromisso cadastrado para este dia.</p>:selected.map(e=><div key={e.id} className="flex items-start gap-3 rounded-xl border p-3"><span className="mt-0.5 rounded-lg bg-muted p-2"><EventIcon kind={e.kind}/></span><div><p className="text-sm font-medium">{e.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{labels[e.kind]} · {e.detail}</p></div></div>)}</div></Card>
        <Card className="p-5"><h3 className="font-semibold">Resumo do mês</h3><div className="mt-3 grid grid-cols-2 gap-3">{([{kind:"birthday",label:"Aniversários"},{kind:"holiday",label:"Feriados"},{kind:"vacation",label:"Férias"},{kind:"training",label:"Treinamentos"},{kind:"exam",label:"Exames"},{kind:"task",label:"Prazos"}] as const).map(x=><div key={x.kind} className="rounded-xl bg-muted/40 p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><EventIcon kind={x.kind}/>{x.label}</div><p className="mt-2 text-xl font-semibold">{monthEvents.filter(e=>e.kind===x.kind).length}</p></div>)}</div><p className="mt-3 text-xs leading-relaxed text-muted-foreground">As férias aparecem nos dias correspondentes conforme as datas efetivas cadastradas na tela Férias. Nenhum dado fictício é criado.</p></Card></div>
      </div>
      <Card className="overflow-hidden"><div className="border-b px-5 py-4"><h3 className="font-semibold">Todos os compromissos do mês</h3><p className="mt-1 text-xs text-muted-foreground">Selecione um compromisso para abrir o dia correspondente.</p></div>{loading?<div className="p-8 text-center text-sm text-muted-foreground">Carregando...</div>:monthEvents.length===0?<div className="p-8 text-center text-sm text-muted-foreground">Nenhum compromisso encontrado para este mês.</div>:<div className="divide-y">{monthEvents.map(e=><button key={e.id} onClick={()=>setSelectedDay(e.date)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/30"><span className="w-16 shrink-0 text-xs font-medium text-muted-foreground">{dateLabel(e.date)}</span><span className="rounded-lg bg-muted p-2"><EventIcon kind={e.kind}/></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{e.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{labels[e.kind]} · {e.detail}</span></span><ChevronRight className="h-4 w-4 text-muted-foreground"/></button>)}</div>}</Card>
    </main>
  </div>;
}
