import { Link}from"@tanstack/react-router";import{ArrowLeft,TrendingUp,Users,Clock3,CalendarX2,Percent,Wallet}from"lucide-react";import{Card}from"@/components/ui/card";import{useEffect,useState}from"react";import{supabase}from"@/integrations/supabase/client";
export function fmt(n:number){const s=n<0?"-":"+";const a=Math.abs(Math.round(n));return s+Math.floor(a/60)+"h "+String(a%60).padStart(2,"0")+"m"}
function Kpis(){
 const[m,setM]=useState({employees:0,credits:0,debits:0,positive:0,negative:0,absence:0,certificates:0,absenteeism:0,overtimeValue:0}),[period,setPeriod]=useState(""),[error,setError]=useState("");
 useEffect(()=>{void(async()=>{
  const db=supabase;
  const {data:comp,error:ce}=await db.from("competencies").select("id,name,start_date,end_date").order("end_date",{ascending:false}).limit(1).maybeSingle();
  if(ce){setError(ce.message);return}
  if(comp)setPeriod(comp.name);
  const [e,m,o,a,params]=await Promise.all([
   db.from("employees").select("id,current_bank_minutes,initial_bank_minutes,work_schedule_id").eq("active",true),
   db.from("bank_movements").select("minutes").eq("competence_id",comp?.id??"00000000-0000-0000-0000-000000000000"),
   db.from("occurrences").select("minutes,type,occurrence_date").gte("occurrence_date",comp?.start_date??"1900-01-01").lte("occurrence_date",comp?.end_date??"1900-01-01"),
   db.from("medical_certificates").select("id").gte("start_date",comp?.start_date??"1900-01-01").lte("start_date",comp?.end_date??"1900-01-01"),
   db.from("calculation_parameters").select("code,rate_factor").in("code",["ABS_FALTA","ABS_ATRASO","ABS_SAIDA_ANTECIPADA","ABS_ATESTADO"])
  ]);
  const err=[e,m,o,a,params].find(x=>x.error);if(err){setError(err.error.message);return}
  const employees=e.data??[],mov=m.data??[],occ=o.data??[],p=new Map<string,number>((params.data??[]).map((x:any)=>[x.code,Number(x.rate_factor)]));
  const credits=mov.filter((x:any)=>x.minutes>0).reduce((s:number,x:any)=>s+x.minutes,0);
  const debits=mov.filter((x:any)=>x.minutes<0).reduce((s:number,x:any)=>s+Math.abs(x.minutes),0);
  const positive=employees.filter((x:any)=>(x.current_bank_minutes??x.initial_bank_minutes??0)>0).length;
  const negative=employees.filter((x:any)=>(x.current_bank_minutes??x.initial_bank_minutes??0)<0).length;
  const absence=occ.reduce((s:number,x:any)=>{const code=x.type==="Falta"?"ABS_FALTA":x.type==="Atraso"?"ABS_ATRASO":x.type==="Saída antecipada"?"ABS_SAIDA_ANTECIPADA":"";return s+((code&&p.get(code)!==0)?(x.minutes||0):0)},0);
  let scheduled=0;
  if(comp){
    const start=new Date(comp.start_date+"T12:00:00"),end=new Date(comp.end_date+"T12:00:00");
    const weekdays=Math.max(1,Array.from({length:Math.floor((end.getTime()-start.getTime())/86400000)+1},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d.getDay()}).filter(d=>d!==0&&d!==6).length);
    const schedules=await Promise.all(employees.map((x:any)=>x.work_schedule_id?db.from("work_schedules").select("weekly_minutes").eq("id",x.work_schedule_id).maybeSingle():Promise.resolve({data:null})));
    scheduled=schedules.reduce((s:number,x:any)=>s+(x.data?.weekly_minutes?x.data.weekly_minutes/5*weekdays:0),0);
  }
  setM({employees:employees.length,credits,debits,positive,negative,absence,certificates:(a.data??[]).length,absenteeism:scheduled?absence/scheduled*100:0,overtimeValue:0});
 })()},[]);
 return <div className="min-h-screen bg-background"><header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] justify-between"><a href="/" className="text-sm text-muted-foreground"><ArrowLeft className="inline h-4 w-4 mr-1"/>Voltar</a><b>DP Success · KPIs</b></div></header>
 <main className="mx-auto max-w-[1500px] px-6 py-7"><p className="text-sm text-primary">Gestão</p><h1 className="text-3xl font-bold">KPIs de RH e DP</h1><p className="mt-1 text-sm text-muted-foreground">{period||"Competência atual"}</p>{error&&<p className="mt-4 text-sm text-destructive">{error}</p>}
 <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
 <Card className="p-5"><Users className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Funcionários ativos</p><p className="text-2xl font-bold">{m.employees}</p></Card>
 <Card className="p-5"><TrendingUp className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Créditos</p><p className="text-2xl font-bold">{fmt(m.credits)}</p></Card>
 <Card className="p-5"><Clock3 className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Débitos</p><p className="text-2xl font-bold">{fmt(-m.debits)}</p></Card>
 <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Atestados registrados</p><p className="text-2xl font-bold">{m.certificates}</p></Card>
 <Card className="p-5"><Wallet className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Funcionários com saldo positivo</p><p className="text-2xl font-bold">{m.positive}</p><p className="text-xs text-muted-foreground">{m.negative} com saldo negativo</p></Card>
 <Card className="p-5"><Percent className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Absenteísmo por faltas</p><p className="text-2xl font-bold">{m.absenteeism.toFixed(2)}%</p></Card>
 </div>
 <Card className="mt-6 p-6"><p className="text-sm text-muted-foreground">Faltas registradas: <b>{Math.floor(m.absence/60)}h {m.absence%60}m</b>. O percentual considera faltas em relação às horas previstas de segunda a sexta da jornada cadastrada. Certificados e atrasos ainda podem ser incluídos conforme a parametrização de absenteísmo.</p></Card>
 </main></div>
}