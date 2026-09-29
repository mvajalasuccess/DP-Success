import{ArrowLeft}from"lucide-react";import{Card}from"@/components/ui/card";import{useEffect,useState}from"react";import{supabase}from"@/integrations/supabase/client";
export function Comparativos(){
 const[rows,setRows]=useState<any[]>([]),[error,setError]=useState("");
 useEffect(()=>{void(async()=>{
  try{
   const db=supabase as any;
   const{data:periods,error:periodError}=await db.from("time_periods").select("id,reference_year,reference_month,start_date,end_date,status").order("start_date",{ascending:false}).limit(2);
   if(periodError)throw periodError;
   const ps=periods??[];
   if(ps.length<2){setRows([]);return;}
   const ids=ps.map((p:any)=>p.id);
   const{data:balances,error:balanceError}=await db.from("bank_hours").select("employee_id,period_id,kind,minutes").in("period_id",ids);
   if(balanceError)throw balanceError;
   const employeeIds=[...new Set((balances??[]).map((x:any)=>x.employee_id))];
   let employees:any[]=[];
   if(employeeIds.length){
    const{data,error:employeeError}=await db.from("employees").select("id,full_name").in("id",employeeIds);
    if(employeeError)throw employeeError;
    employees=data??[];
   }
   const names=new Map(employees.map((e:any)=>[e.id,e.full_name]));
   const totals=new Map<string,{previous:number,current:number}>();
   for(const b of balances??[]){
    const signed=["debito","pagamento_he"].includes(b.kind)?-Math.abs(Number(b.minutes)||0):Math.abs(Number(b.minutes)||0);
    const v=totals.get(b.employee_id)||{previous:0,current:0};
    if(b.period_id===ps[1].id)v.previous+=signed;else if(b.period_id===ps[0].id)v.current+=signed;
    totals.set(b.employee_id,v);
   }
   setRows([...totals.entries()].map(([id,v])=>({employee:names.get(id)??"Funcionário",...v,diff:v.current-v.previous})).sort((a,b)=>a.employee.localeCompare(b.employee)));
  }catch(e:any){setError(e.message??"Não foi possível carregar os comparativos.")}
 })()},[]);
 const fmt=(n:number)=>{const s=n<0?"-":"";n=Math.abs(Math.round(n));return s+Math.floor(n/60)+":"+String(n%60).padStart(2,"0")};
 return <div className="min-h-screen bg-background"><header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1500px] justify-between"><a href="/" className="text-sm text-muted-foreground">← Voltar</a><b>DP Success · Comparativos</b></div></header><main className="mx-auto max-w-[1200px] px-6 py-7"><p className="text-sm text-primary">Gestão</p><h1 className="text-3xl font-bold">Comparativos</h1><p className="mt-1 text-sm text-muted-foreground">Comparação das duas últimas competências do banco de horas.</p>{error&&<p className="mt-4 text-sm text-destructive">{error}</p>}<Card className="mt-6 overflow-hidden"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Funcionário</th><th className="px-5 py-3">Anterior</th><th className="px-5 py-3">Atual</th><th className="px-5 py-3">Variação</th></tr></thead><tbody className="divide-y">{rows.map(r=><tr key={r.employee}><td className="px-5 py-4 font-medium">{r.employee}</td><td className="px-5 py-4">{fmt(r.previous)}</td><td className="px-5 py-4">{fmt(r.current)}</td><td className="px-5 py-4 font-bold">{fmt(r.diff)}</td></tr>)}</tbody></table></Card></main></div>}