import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { DocumentAuditImport } from "@/components/document-audit-import";
import type { AuditRow } from "@/lib/document-audit-import";

type Person={id:string;full_name:string;company_id:string|null;start_date:string;end_date:string|null;status:string};
type Entry={id:string;person_id:string;start_date?:string;end_date?:string;category?:string;document_name?:string;is_standard?:boolean;completed_on?:string|null;due_date?:string|null;signature_status?:string;notes?:string|null};
const categories=["Pessoais","Contratação","Responsabilidades anuais","Medicina e Segurança do Trabalho","Recibos","Cartão de Ponto","Advertências","Vales avulsos, acordos diversos","Diversos"];
const blank={person_id:"",start_date:"",end_date:"",category:"Pessoais",document_name:"",is_standard:false,completed_on:"",due_date:"",signature_status:"pending",notes:""};
const dateLabel=(v?:string|null)=>v?v.split("-").reverse().join("/"):"—";
const db=supabase as any;

export function PjOrganization({mode}:{mode:"documents"|"recesses"}){
  const docs=mode==="documents", table=docs?"pj_documents":"pj_recesses";
  const [people,setPeople]=useState<Person[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [companies,setCompanies]=useState<{id:string;name:string}[]>([]);
  const [company,setCompany]=useState("");
  const [person,setPerson]=useState("");
  const [open,setOpen]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [form,setForm]=useState(blank);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function allRows(name:string){
    const rows:any[]=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await db.from(name).select("*").order("id").range(offset,offset+499);
      if(error)throw new Error(error.message);
      rows.push(...(data??[]));if(!data||data.length<500)return rows;
    }
  }
  async function load(){
    setError("");
    try{const [p,e,c]=await Promise.all([allRows("pj_people"),allRows(table),allRows("companies")]);setPeople(p);setEntries(e);setCompanies(c);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  useEffect(()=>{void load();},[mode]);
  const today=new Date().toISOString().slice(0,10);
  const active=(p:Person)=>p.status==="ativo"&&(!p.end_date||p.end_date>today);
  const visible=people.filter(p=>active(p)&&(!company||p.company_id===company)).sort((a,b)=>a.full_name.localeCompare(b.full_name,"pt-BR"));
  const visibleIds=new Set(visible.map(p=>p.id));
  const displayed=entries.filter(e=>visibleIds.has(e.person_id)&&(!person||e.person_id===person)).sort((a,b)=>(a.document_name??a.start_date??"").localeCompare(b.document_name??b.start_date??"","pt-BR")||(b.completed_on??b.due_date??"").localeCompare(a.completed_on??a.due_date??""));
  function edit(e?:Entry){
    setEditing(e?.id??null);setForm({...blank,person_id:e?.person_id??person,start_date:e?.start_date??"",end_date:e?.end_date??"",category:e?.category??"Pessoais",document_name:e?.document_name??"",is_standard:e?.is_standard??false,completed_on:e?.completed_on??"",due_date:e?.due_date??"",signature_status:e?.signature_status??"pending",notes:e?.notes??""});setError("");setOpen(true);
  }
  async function save(){
    if(!visibleIds.has(form.person_id)){setError("Selecione um prestador ativo.");return;}
    if(docs?!form.document_name.trim():!form.start_date||!form.end_date||form.end_date<form.start_date){setError("Confira os campos obrigatórios e as datas.");return;}
    const payload=docs?{person_id:form.person_id,category:form.category,document_name:form.document_name.trim(),is_standard:form.is_standard,completed_on:form.completed_on||null,due_date:form.due_date||null,signature_status:form.signature_status,notes:form.notes.trim()||null}:{person_id:form.person_id,start_date:form.start_date,end_date:form.end_date,notes:form.notes.trim()||null};
    setBusy(true);setError("");
    try{const q=editing?db.from(table).update(payload).eq("id",editing):db.from(table).insert(payload);const {error}=await q.select("id").single();if(error)throw new Error(error.message);setOpen(false);await load();}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function remove(e:Entry){
    if(!window.confirm("Excluir definitivamente este registro PJ?"))return;
    setBusy(true);try{const {data,error}=await db.from(table).delete().eq("id",e.id).select("id");if(error||!data?.length)throw new Error(error?.message||"Sem permissão para excluir.");await load();}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function importDocs(rows:AuditRow[]){
    const fresh:Person[]=await allRows("pj_people");
    const ids=new Set(fresh.filter(active).map(p=>p.id));
    const previous:Entry[]=await allRows("pj_documents");
    const pending:any[]=[];let skipped=0;
    for(const row of rows){
      if(row.destination!=="documents"||row.employeeStatus!=="matched"||!row.employeeId||!ids.has(row.employeeId)||row.issue||row.isStandard===null){skipped++;continue;}
      const same=(e:Entry)=>e.person_id===row.employeeId&&e.category===row.category&&e.document_name?.trim().toLocaleLowerCase("pt-BR")===row.documentName.trim().toLocaleLowerCase("pt-BR")&&(e.completed_on??null)===row.completedOn&&(e.due_date??null)===row.dueDate&&(e.notes??"")===row.originalComment;
      if(previous.some(same)||pending.some(same)){skipped++;continue;}
      const signed=/\bassinad[oa]\b/i.test(row.originalComment)&&!/(?:não|nao|sem)\s+assinad[oa]/i.test(row.originalComment);
      pending.push({person_id:row.employeeId,category:row.category,document_name:row.documentName,is_standard:row.isStandard,completed_on:row.completedOn,due_date:row.dueDate,signature_status:signed?"signed":"pending",notes:row.originalComment||null});
    }
    if(pending.length){const {error}=await db.from("pj_documents").insert(pending);if(error)throw new Error(error.message);}
    await load();return {imported:pending.length,skipped,warnings:[]};
  }
  const field="rounded-sm border bg-background px-3 py-2 text-sm";
  return <Card className="mt-5 space-y-4 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{docs?"Documentos dos prestadores PJ":"Recessos PJ"}</h2><p className="text-xs text-muted-foreground">Controle contratual separado dos registros CLT.</p></div><div className="flex flex-wrap gap-2">{docs&&<DocumentAuditImport employees={people.map(p=>({id:p.id,full_name:p.full_name,status:p.status,hire_date:p.start_date,termination_date:p.end_date}))} onImport={importDocs}/>}<button type="button" onClick={()=>edit()} className="rounded-sm bg-primary px-3 py-2 text-sm text-primary-foreground">{docs?"Novo documento":"Programar recesso"}</button></div></div>
    <div className="flex flex-wrap gap-2"><select value={company} onChange={e=>{setCompany(e.target.value);setPerson("");}} className={field}><option value="">Todas as empresas</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select value={person} onChange={e=>setPerson(e.target.value)} className={field}><option value="">Todos os prestadores ativos</option>{visible.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></div>
    {error&&<p className="text-sm text-destructive">{error}</p>}
    <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr>{(docs?["Prestador","Categoria","Documento","Padrão?","Realização","Vencimento","Assinado?","Observação","Ações"]:["Prestador","Início","Fim","Dias corridos","Observação","Ações"]).map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y">{displayed.map(e=><tr key={e.id}><td className="p-3">{people.find(p=>p.id===e.person_id)?.full_name}</td>{docs?<><td className="p-3">{e.category}</td><td className="p-3">{e.document_name}</td><td className="p-3">{e.is_standard?"Sim":"Não"}</td><td className="p-3">{dateLabel(e.completed_on)}</td><td className="p-3">{dateLabel(e.due_date)}</td><td className="p-3">{e.signature_status==="signed"?"Sim":e.signature_status==="not_applicable"?"Não se aplica":"Não"}</td></>:<><td className="p-3">{dateLabel(e.start_date)}</td><td className="p-3">{dateLabel(e.end_date)}</td><td className="p-3">{Math.round((Date.parse(e.end_date??"")-Date.parse(e.start_date??""))/86400000)+1}</td></>}<td className="p-3">{e.notes||"—"}</td><td className="p-3"><button onClick={()=>edit(e)} className="rounded-sm border px-2 py-1">Editar registro</button></td></tr>)}</tbody></table>{!displayed.length&&<p className="p-5 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>}</div>
    {open&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="max-h-[90vh] w-full max-w-xl space-y-3 overflow-auto p-5"><h3 className="font-semibold">{editing?"Editar registro":"Novo registro PJ"}</h3><label className="grid gap-1 text-sm">Prestador<select className={field} value={form.person_id} onChange={e=>setForm({...form,person_id:e.target.value})}><option value="">Selecione</option>{visible.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
    {docs?<><label className="grid gap-1 text-sm">Categoria<select className={field} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><label className="grid gap-1 text-sm">Documento<input className={field} value={form.document_name} onChange={e=>setForm({...form,document_name:e.target.value})}/></label><label className="flex gap-2 text-sm"><input type="checkbox" checked={form.is_standard} onChange={e=>setForm({...form,is_standard:e.target.checked})}/>Documento padrão</label><label className="grid gap-1 text-sm">Realização<input type="date" className={field} value={form.completed_on} onChange={e=>setForm({...form,completed_on:e.target.value})}/></label><label className="grid gap-1 text-sm">Vencimento<input type="date" className={field} value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label><label className="grid gap-1 text-sm">Assinatura<select value={form.signature_status} className={field} onChange={e=>setForm({...form,signature_status:e.target.value})}><option value="pending">Não</option><option value="signed">Sim</option><option value="not_applicable">Não se aplica</option></select></label></>:<><label className="grid gap-1 text-sm">Início<input type="date" className={field} value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label className="grid gap-1 text-sm">Fim<input type="date" className={field} value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></label></>}
    <label className="grid gap-1 text-sm">Observação<textarea className={field} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>{error&&<p className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap justify-between gap-2">{editing?<button type="button" disabled={busy} onClick={()=>{const row=entries.find(e=>e.id===editing);if(row)void remove(row).then(()=>setOpen(false));}} className="text-sm text-destructive">Excluir registro</button>:<span/>}<div className="flex gap-2"><button disabled={busy} onClick={()=>setOpen(false)} className="rounded-sm border px-3 py-2">Cancelar</button><button disabled={busy} onClick={()=>void save()} className="rounded-sm bg-primary px-3 py-2 text-primary-foreground">Salvar</button></div></div></Card></div>}
  </Card>;
}
