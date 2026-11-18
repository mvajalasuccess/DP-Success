import {useEffect,useState} from "react";
import {FileDown,X} from "lucide-react";
import {supabase} from "@/integrations/supabase/client";
import {useAccountIdentity} from "@/hooks/use-account-identity";
import {buildDossier,dossierSections,printDossier} from "@/lib/employee-dossier";
type Section=typeof dossierSections[number][0];
type Person={id:string;full_name:string;company_id:string|null;status:string;hire_date:string|null};
type Company={id:string;name:string};
const field="h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm";
export function EmployeeDossierExport(){
 const {role}=useAccountIdentity();
 const permitted=role==="administrador";
 const [open,setOpen]=useState(false);
 const [loading,setLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [people,setPeople]=useState<Person[]>([]);
 const [companies,setCompanies]=useState<Company[]>([]);
 const [company,setCompany]=useState("");
 const [person,setPerson]=useState("");
 const [status,setStatus]=useState("all");
 const [period,setPeriod]=useState("all");
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [sections,setSections]=useState<Section[]>(dossierSections.map(s=>s[0]));
 useEffect(()=>{if(!permitted)setOpen(false)},[permitted]);
 async function show(){
  if(!permitted)return;setOpen(true);setLoading(true);setError("");
  try{const db=supabase as any;const all=async(table:string,columns:string)=>{const out:any[]=[];for(let offset=0;;offset+=500){const {data,error}=await db.from(table).select(columns).order("id").range(offset,offset+499);if(error)throw new Error(error.message);out.push(...(data??[]));if(!data||data.length<500)return out;}};
   const [p,c]=await Promise.all([all("employees","id,full_name,company_id,status,hire_date"),all("companies","id,name")]);setPeople(p.sort((a,b)=>a.full_name.localeCompare(b.full_name,"pt-BR")));setCompanies(c.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")));
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
 }
 const filtered=people.filter(p=>(!company||company===p.company_id)&&(status==="all"||status===p.status));
 async function generate(){if(busy||!permitted)return;setError("");if(!filtered.some(p=>p.id===person)||!sections.length){setError("Selecione um funcionário e pelo menos uma seção.");return;}if(period==="custom"&&(!start||!end||start>end)){setError("Informe um período válido.");return;}setBusy(true);try{const {html}=await buildDossier(person,sections,period==="custom"?{start,end}:undefined);printDossier(html);setOpen(false);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false)}}
 if(!permitted)return null;
 return <><button type="button" onClick={()=>void show()} className="inline-flex items-center gap-2 rounded-lg bg-[#06CAA0] px-4 py-2 text-sm font-semibold text-[#082f2b]"><FileDown className="h-4 w-4"/>Exportar dossiê funcional</button>{open&&<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Exportar dossiê funcional"><div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card text-foreground shadow-xl"><div className="flex shrink-0 items-center justify-between border-b p-5"><div><h2 className="text-lg font-semibold">Exportar dossiê funcional</h2><p className="text-xs text-muted-foreground">Relatório confidencial · A4 vertical · funcionários CLT</p></div><button disabled={busy} onClick={()=>setOpen(false)} aria-label="Fechar" className="rounded-md border p-2"><X className="h-4 w-4"/></button></div><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm font-medium">Empresa<select className={field} value={company} onChange={e=>{setCompany(e.target.value);setPerson("")}}><option value="">Todas as empresas</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="grid gap-1 text-sm font-medium">Situação<select className={field} value={status} onChange={e=>{setStatus(e.target.value);setPerson("")}}><option value="all">Todos</option><option value="ativo">Ativos</option><option value="inativo">Desligados</option></select></label><label className="grid gap-1 text-sm font-medium sm:col-span-2">Funcionário<select className={field} disabled={loading} value={person} onChange={e=>setPerson(e.target.value)}><option value="">{loading?"Carregando...":"Selecione o funcionário"}</option>{filtered.map(p=><option key={p.id} value={p.id}>{p.full_name}{p.status==="inativo"?" (desligado)":""}</option>)}</select></label></div><fieldset className="space-y-2 border-t pt-3"><legend className="font-medium text-sm">Período</legend><label className="flex items-center gap-2 text-sm"><input type="radio" checked={period==="all"} onChange={()=>setPeriod("all")}/>Histórico completo registrado</label><label className="flex items-center gap-2 text-sm"><input type="radio" checked={period==="custom"} onChange={()=>setPeriod("custom")}/>Período personalizado</label>{period==="custom"&&<div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Início<input type="date" className={field} value={start} onChange={e=>setStart(e.target.value)}/></label><label className="grid gap-1 text-sm">Fim<input type="date" className={field} value={end} onChange={e=>setEnd(e.target.value)}/></label></div>}</fieldset><div className="border-t pt-3"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold">Informações do relatório</h3><button type="button" className="text-xs text-primary" onClick={()=>setSections(sections.length===dossierSections.length?[]:dossierSections.map(s=>s[0]))}>{sections.length===dossierSections.length?"Desmarcar todos":"Selecionar todos"}</button></div><div className="grid gap-3 sm:grid-cols-2">{dossierSections.map(([key,label])=><label key={key} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={sections.includes(key)} onChange={e=>setSections(old=>e.target.checked?[...old,key]:old.filter(s=>s!==key))}/>{label}</label>)}</div></div><p className="text-xs text-muted-foreground">O navegador abrirá a janela de impressão. Selecione Salvar como PDF.</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div><div className="flex shrink-0 justify-end gap-2 border-t p-4"><button disabled={busy} onClick={()=>setOpen(false)} className="rounded-md border px-4 py-2 text-sm">Cancelar</button><button disabled={busy||loading||!person||!sections.length} onClick={()=>void generate()} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"><FileDown className="h-4 w-4"/>{busy?"Preparando relatório...":"Gerar relatório PDF"}</button></div></div></div>}</>;
}
