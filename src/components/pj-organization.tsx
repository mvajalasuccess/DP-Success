import {pjDocumentCategories,pjCategory,pjCategoryLabel,pjDocKey,pjRecordCategory} from "@/lib/pj-document-categories";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { DocumentAuditImport } from "@/components/document-audit-import";
import type { AuditRow } from "@/lib/document-audit-import";

type Person={id:string;full_name:string;company_id:string|null;start_date:string;end_date:string|null;status:string};
type Entry={id:string;person_id:string;start_date?:string;end_date?:string;category?:string;document_name?:string;is_standard?:boolean;completed_on?:string|null;due_date?:string|null;signature_status?:string;notes?:string|null;no_due_date?:boolean;imported_from_audit?:boolean};
type Catalog={id:string;category:string;name:string;active:boolean};
type Rule={person_id:string;catalog_id:string;is_applicable:boolean};
const categories=[...pjDocumentCategories];
const blank={person_id:"",start_date:"",end_date:"",category:"Pessoais",document_name:"",is_standard:false,completed_on:"",due_date:"",signature_status:"pending",notes:"",no_due_date:false};
const dateLabel=(v?:string|null)=>v?v.split("-").reverse().join("/"):"—";
const db=supabase as any;

export function PjOrganization({mode,onImport}:{mode:"documents"|"recesses";onImport?:(rows:AuditRow[])=>Promise<{imported:number;skipped:number;warnings:string[]}>}){
  const docs=mode==="documents", table=docs?"pj_documents":"pj_recesses";
  const [people,setPeople]=useState<Person[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [catalog,setCatalog]=useState<Catalog[]>([]);
  const [rules,setRules]=useState<Rule[]>([]);
  const [catalogOpen,setCatalogOpen]=useState(false);
  const [catalogCategory,setCatalogCategory]=useState<string>("Pessoais");
  const [catalogName,setCatalogName]=useState("");
  const [notice,setNotice]=useState("");
  const [companies,setCompanies]=useState<{id:string;name:string}[]>([]);
  const [company,setCompany]=useState("");
  const [person,setPerson]=useState("");
  const [open,setOpen]=useState(false);
  const [collapsed,setCollapsed]=useState<string[]>([]);
  const [newCategory,setNewCategory]=useState<string|null>(null);
  const [custom,setCustom]=useState(false);
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
    try{const [p,e,c,cat,req]=await Promise.all([allRows("pj_people"),allRows(table),allRows("companies"),docs?allRows("pj_document_catalog"):Promise.resolve([]),docs?allRows("pj_document_requirements"):Promise.resolve([])]);setPeople(p);setEntries(e);setCompanies(c);setCatalog(cat.filter(x=>x.active&&pjRecordCategory(x.category,x.name)!=="NFs"));setRules(req);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  useEffect(()=>{void load();},[mode]);
  const today=new Date().toISOString().slice(0,10);
  const active=(p:Person)=>p.status==="ativo"&&(!p.end_date||p.end_date>today);
  const visible=people.filter(p=>active(p)&&(!company||p.company_id===company)).sort((a,b)=>a.full_name.localeCompare(b.full_name,"pt-BR"));
  const visibleIds=new Set(visible.map(p=>p.id));
  const displayed=entries.filter(e=>visibleIds.has(e.person_id)&&(!person||e.person_id===person)).sort((a,b)=>(a.document_name??a.start_date??"").localeCompare(b.document_name??b.start_date??"","pt-BR")||(b.completed_on??b.due_date??"").localeCompare(a.completed_on??a.due_date??""));
  function edit(e?:Entry,category?:string,name?:string){
    setCustom(!e&&!name);setNewCategory(null);
    setEditing(e?.id??null);setForm({...blank,person_id:e?.person_id??person,start_date:e?.start_date??"",end_date:e?.end_date??"",category:docs?pjRecordCategory(e?.category??category??"Pessoais",e?.document_name??name):e?.category??category??"Pessoais",document_name:e?.document_name??name??"",is_standard:e?.is_standard??(!!name&&applicable(catalog.find(x=>pjCategory(x.category)===pjCategory(category)&&pjDocKey(x.name)===pjDocKey(name))?.id??"")),completed_on:e?.completed_on??"",due_date:e?.due_date??"",signature_status:e?.signature_status??"pending",notes:e?.notes??"",no_due_date:e?.no_due_date??false});setError("");setOpen(true);
  }
  async function save(){
    if(!visibleIds.has(form.person_id)){setError("Selecione um prestador ativo.");return;}
    if(docs?!form.document_name.trim():!form.start_date||!form.end_date||form.end_date<form.start_date){setError("Confira os campos obrigatórios e as datas.");return;}
    const payload=docs?{person_id:form.person_id,category:pjRecordCategory(form.category,form.document_name),document_name:form.document_name.trim(),is_standard:pjRecordCategory(form.category,form.document_name)==="NFs"?false:form.is_standard,completed_on:form.completed_on||null,due_date:form.no_due_date?null:form.due_date||null,no_due_date:form.no_due_date,signature_status:form.signature_status,notes:form.notes.trim()||null}:{person_id:form.person_id,start_date:form.start_date,end_date:form.end_date,notes:form.notes.trim()||null};
    setBusy(true);setError("");
    try{const q=editing?db.from(table).update(payload).eq("id",editing):db.from(table).insert(payload);const {error}=await q.select("id").single();if(error)throw new Error(error.message);setOpen(false);await load();}
    catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function remove(e:Entry){
    if(!window.confirm("Excluir definitivamente este registro PJ?"))return;
    setBusy(true);try{const {data,error}=await db.from(table).delete().eq("id",e.id).select("id");if(error||!data?.length)throw new Error(error?.message||"Sem permissão para excluir.");setOpen(false);await load();}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  async function importDocs(rows:AuditRow[]){
    if(!onImport)throw new Error("Importação PJ indisponível nesta tela.");
    const result=await onImport(rows.filter(r=>r.link==="PJ"));await load();return result;
  }
  async function deleteImports(){
    if(busy)return;setBusy(true);setError("");setNotice("");
    let removed=0;try{
      const all:Entry[]=await allRows("pj_documents");
      const ids=all.filter(r=>r.imported_from_audit||/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.id)).map(r=>r.id);
      if(!ids.length){setNotice("Nenhuma importação PJ identificada.");return;}
      if(!window.confirm("Excluir "+ids.length+" documentos importados PJ de todas as empresas? A ação é definitiva. Documentos manuais e catálogo serão preservados."))return;
      for(let i=0;i<ids.length;i+=100){const {data,error}=await db.from("pj_documents").delete().in("id",ids.slice(i,i+100)).select("id");if(error)throw new Error(error.message);removed+=data?.length??0;}
      await load();setNotice(removed+" documentos importados PJ excluídos.");if(removed!==ids.length)setError("Alguns registros não foram excluídos; confira as permissões.");
    }catch(e){if(removed)await load();setError(removed+" registros excluídos. "+String(e));}finally{setBusy(false);}
  }
  const applicable=(id:string)=>rules.find(r=>r.person_id===person&&r.catalog_id===id)?.is_applicable??true;
  async function setRule(item:Catalog,value:boolean){
    if(!person||busy)return;setBusy(true);try{
      const {error}=await db.from("pj_document_requirements").upsert({person_id:person,catalog_id:item.id,is_applicable:value},{onConflict:"person_id,catalog_id"});if(error)throw new Error(error.message);await load();
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }
  async function addCatalog(){
    const name=catalogName.trim();if(!name||busy)return;if(pjRecordCategory(catalogCategory,name)==="NFs"){setError("Notas fiscais são registros avulsos, não documentos padrão.");return;}setBusy(true);try{
      const existing=catalog.find(x=>pjCategory(x.category)===catalogCategory&&pjDocKey(x.name)===pjDocKey(name));
      if(existing){setError("Documento já cadastrado nesta seção.");return;}
      const {error}=await db.from("pj_document_catalog").upsert({category:catalogCategory,name,active:true},{onConflict:"category,name"});if(error)throw new Error(error.message);setCatalogName("");await load();
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }
  async function deactivate(item:Catalog){
    if(busy||!confirm("Desativar este item da lista padrão? Registros individuais serão preservados."))return;
    setBusy(true);try{const {error}=await db.from("pj_document_catalog").update({active:false}).eq("id",item.id).select("id").single();if(error)throw new Error(error.message);await load();}catch(e){setError(String(e))}finally{setBusy(false)}
  }
  const field="rounded-lg border bg-background px-3 py-2 text-sm";
  const normalizeCategory=pjCategory;
  const categoryLabel=pjCategoryLabel;
  const sectionNames=categories;
  const catalogNames=(category:string)=>catalog.filter(e=>pjCategory(e.category)===category).map(e=>e.name).sort((a,b)=>a.localeCompare(b,"pt-BR",{sensitivity:"base"}));
  const dueState=(d:string)=>d<today?"Vencido":d<=new Date(Date.now()+30*86400000).toISOString().slice(0,10)?"Próximo do vencimento":"Em dia";
  async function standard(e:Entry,value:boolean){setBusy(true);setError("");try{const {error}=await db.from("pj_documents").update({is_standard:value}).eq("id",e.id).eq("person_id",e.person_id).select("id").single();if(error)throw new Error(error.message);setEntries(old=>old.map(r=>r.id===e.id?{...r,is_standard:value}:r));}catch(e){setError(String(e));}finally{setBusy(false)}}
  return <div className="mt-5 space-y-3">
    <Card className="p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">{docs?"Documentos dos prestadores PJ":"Recessos PJ"}</h2><p className="text-xs text-muted-foreground">Controle contratual separado dos registros CLT.</p></div><div className="flex flex-wrap gap-2">{docs&&<DocumentAuditImport employees={people.map(p=>({id:p.id,link:"PJ" as const,full_name:p.full_name,status:p.status,hire_date:p.start_date,termination_date:p.end_date}))} onImport={importDocs}/>} {docs&&<button data-role-sensitive type="button" disabled={busy} onClick={()=>void deleteImports()} className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10">Excluir importações PJ</button>} {!docs&&<button data-role-sensitive type="button" onClick={()=>edit()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">Programar recesso</button>}</div></div>
    <div className="mt-4 flex flex-wrap gap-4"><label className="grid min-w-[200px] gap-1 text-sm"><span className="text-muted-foreground">Empresa</span><select value={company} onChange={e=>{setCompany(e.target.value);setPerson("");setNewCategory(null);}} className="h-10 rounded-md border bg-background px-3"><option value="">Todas as empresas</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="grid min-w-[260px] gap-1 text-sm"><span className="text-muted-foreground">Funcionário</span><select value={person} onChange={e=>{setPerson(e.target.value);setNewCategory(null);}} className="h-10 rounded-md border bg-background px-3"><option value="">{docs?"Selecione o prestador":"Todos os prestadores ativos"}</option>{visible.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label></div></Card>
    {error&&<p className="text-sm text-destructive">{error}</p>}{notice&&<p className="text-sm text-primary">{notice}</p>}
    {docs?(!person?<Card className="p-10 text-center text-sm text-muted-foreground">Selecione um funcionário para visualizar o checklist de documentos, exames e treinamentos.</Card>:sectionNames.map(category=>{
      const records=displayed.filter(e=>pjRecordCategory(e.category,e.document_name)===category).sort((a,b)=>(a.document_name||"").localeCompare(b.document_name||"","pt-BR",{sensitivity:"base"})||(b.completed_on||b.due_date||"").localeCompare(a.completed_on||a.due_date||""));
      const names=catalogNames(category);
      const missing=catalog.filter(x=>pjCategory(x.category)===category&&!records.some(r=>pjDocKey(r.document_name)===pjDocKey(x.name)));
      const list=[...records.map(r=>({name:r.document_name||"",record:r,item:undefined as Catalog|undefined})),...missing.map(item=>({name:item.name,record:undefined as Entry|undefined,item}))].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR",{sensitivity:"base"}));
      return <Card key={category} className="overflow-visible"><div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3"><div className="flex items-center gap-2"><button type="button" aria-label={collapsed.includes(category)?"Expandir seção":"Minimizar seção"} aria-expanded={!collapsed.includes(category)} onClick={()=>setCollapsed(old=>old.includes(category)?old.filter(v=>v!==category):[...old,category])} className="rounded-sm p-1 hover:bg-muted"><ChevronDown className={"h-4 w-4 transition-transform "+(collapsed.includes(category)?"-rotate-90":"")}/></button><div><h3 className="font-semibold">{categoryLabel(category)}</h3><p className="text-xs text-muted-foreground">{list.length} item(ns)</p></div></div><div className="relative"><button data-role-sensitive type="button" aria-expanded={newCategory===category} onClick={()=>setNewCategory(old=>old===category?null:category)} className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4"/>Criar novo registro</button>{newCategory===category&&<div className="absolute right-0 top-full z-30 mt-1 max-h-64 min-w-[240px] overflow-y-auto rounded-md border bg-background p-1 shadow-lg">{names.map(name=><button data-role-sensitive key={name} type="button" onClick={()=>edit(undefined,category,name)} className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted">{name}</button>)}<button data-role-sensitive type="button" onClick={()=>edit(undefined,category)} className="mt-1 block w-full rounded-sm border-t px-3 py-2 text-left text-sm font-medium hover:bg-muted">Outro</button></div>}</div></div>
      {!collapsed.includes(category)&&<div className="overflow-x-auto"><table className="w-full min-w-[1120px] table-fixed text-left text-sm"><thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="w-[280px] px-5 py-3">Documento, exame ou treinamento</th><th className="w-[120px] px-5 py-3 text-center">Padrão?</th><th className="w-[200px] px-5 py-3">Data de vencimento</th><th className="w-[130px] px-5 py-3 text-center">Assinado?</th><th className="w-[250px] px-5 py-3">Observação</th><th data-role-sensitive className="w-[140px] px-5 py-3 text-center">Ação</th></tr></thead><tbody className="divide-y">{list.map(({record:e,item})=>e?<tr key={e.id}><td className="px-5 py-4 font-medium">{e.document_name}</td><td className="px-5 py-4 text-center"><select disabled={busy||category==="NFs"} aria-label={"Padrão para "+e.document_name} value={category!=="NFs"&&e.is_standard?"sim":"nao"} onChange={v=>void standard(e,v.target.value==="sim")} className="h-9 min-w-[76px] rounded-md border bg-background px-3 text-xs"><option value="sim">Sim</option><option value="nao">Não</option></select></td><td className="px-5 py-4">{e.no_due_date?<span className="text-muted-foreground">Sem vencimento</span>:e.due_date?dateLabel(e.due_date):<span className="text-muted-foreground">Não informado</span>}{!e.no_due_date&&e.due_date&&<span className={"ml-2 text-xs "+(dueState(e.due_date)==="Vencido"?"text-rose-600":dueState(e.due_date)==="Próximo do vencimento"?"text-amber-600":"text-emerald-600")}>{dueState(e.due_date)}</span>}</td><td className="px-5 py-4 text-center"><span className={e.signature_status==="signed"?"font-medium text-emerald-600":"text-muted-foreground"}>{e.signature_status==="signed"?"Sim":e.signature_status==="not_applicable"?"Dispensa assinatura":"Não"}</span></td><td className="px-5 py-4"><span className="block max-w-[280px] whitespace-normal break-words text-xs text-muted-foreground">{e.notes||"—"}</span></td><td data-role-sensitive className="whitespace-nowrap px-5 py-4 text-center"><button data-role-sensitive onClick={()=>edit(e)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Editar registro</button></td></tr>:item?<tr key={item.id}><td className="px-5 py-4 font-medium">{item.name}</td><td className="px-5 py-4 text-center"><select disabled={busy} className="h-9 min-w-[76px] rounded-md border bg-background px-3 text-xs" value={applicable(item.id)?"sim":"nao"} onChange={e=>void setRule(item,e.target.value==="sim")}><option value="sim">Sim</option><option value="nao">Não</option></select></td><td className="px-5 py-4 text-muted-foreground">Não informado</td><td className="px-5 py-4 text-center text-muted-foreground">Não</td><td className="px-5 py-4">—</td><td data-role-sensitive className="px-5 py-4 text-center"><button data-role-sensitive onClick={()=>edit(undefined,category,item.name)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"><Plus className="mr-1 inline h-3.5 w-3.5"/>Cadastrar</button></td></tr>:null)}{!list.length&&<tr><td colSpan={6} className="px-5 py-6 text-center text-sm text-muted-foreground">Nenhum registro nesta seção.</td></tr>}</tbody></table></div>}</Card>;
    })):<Card><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/50"><tr>{(docs?["Prestador","Categoria","Documento","Padrão?","Realização","Vencimento","Assinado?","Observação","Ações"]:["Prestador","Início","Fim","Dias corridos","Observação","Ações"]).map(h=><th data-role-sensitive={h === "Ações" ? "" : undefined} className="p-3" key={h}>{h}</th>)}</tr></thead><tbody className="divide-y">{displayed.map(e=><tr key={e.id}><td className="p-3">{people.find(p=>p.id===e.person_id)?.full_name}</td>{docs?<><td className="p-3">{e.category}</td><td className="p-3">{e.document_name}</td><td className="p-3">{e.is_standard?"Sim":"Não"}</td><td className="p-3">{dateLabel(e.completed_on)}</td><td className="p-3">{dateLabel(e.due_date)}</td><td className="p-3">{e.signature_status==="signed"?"Sim":e.signature_status==="not_applicable"?"Dispensa assinatura":"Não"}</td></>:<><td className="p-3">{dateLabel(e.start_date)}</td><td className="p-3">{dateLabel(e.end_date)}</td><td className="p-3">{Math.round((Date.parse(e.end_date??"")-Date.parse(e.start_date??""))/86400000)+1}</td></>}<td className="p-3">{e.notes||"—"}</td><td data-role-sensitive className="p-3"><button data-role-sensitive onClick={()=>edit(e)} className="rounded-sm border px-2 py-1">Editar registro</button></td></tr>)}</tbody></table>{!displayed.length&&<p className="p-5 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p>}</div></Card>}
    {docs&&<Card className="overflow-hidden"><button type="button" aria-expanded={catalogOpen} onClick={()=>setCatalogOpen(v=>!v)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div><h2 className="font-semibold">Gerenciar lista padrão PJ</h2><p className="mt-1 text-xs text-muted-foreground">{catalog.length} tipos cadastrados</p></div><ChevronDown className={"h-4 w-4 transition-transform "+(catalogOpen?"rotate-180":"")}/></button>{catalogOpen&&<div className="border-t p-4"><div className="flex flex-wrap gap-2"><select value={catalogCategory} onChange={e=>setCatalogCategory(e.target.value)} className={field}>{categories.filter(v=>v!=="NFs").map(v=><option key={v} value={v}>{categoryLabel(v)}</option>)}</select><input value={catalogName} onChange={e=>setCatalogName(e.target.value)} placeholder="Nome do documento" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"/><button data-role-sensitive disabled={busy} onClick={()=>void addCatalog()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="mr-1 inline h-4 w-4"/>Adicionar item</button></div><div className="mt-3 divide-y">{catalog.slice().sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(item=><div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{item.name}<span className="ml-2 text-xs text-muted-foreground">{categoryLabel(pjCategory(item.category))}</span></span><button data-role-sensitive disabled={busy} onClick={()=>void deactivate(item)} className="rounded-md border px-3 py-1.5 text-xs text-destructive">Desativar</button></div>)}</div></div>}</Card>}
    {open&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="max-h-[90vh] w-full max-w-xl space-y-5 overflow-auto p-4 sm:p-6"><h2 className="text-xl font-bold">{docs?(editing?"Editar documento, exame ou treinamento":"Registrar documento, exame ou treinamento"):(editing?"Editar registro":"Novo registro PJ")}</h2><label className="grid gap-1 text-sm">Funcionário<select className={field} value={form.person_id} onChange={e=>setForm({...form,person_id:e.target.value})}><option value="">Selecione</option>{visible.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
    {docs?<><label className="grid gap-1 text-sm">Categoria<select className={field} value={form.category} onChange={e=>{setForm({...form,category:e.target.value,document_name:""});setCustom(true);}}>{[...new Set([...categories,form.category])].map(v=><option key={v}>{v}</option>)}</select></label><label className="grid gap-1 text-sm">Documento padrão<select className={field} value={custom?"__other":form.document_name} onChange={e=>{setCustom(e.target.value==="__other");setForm({...form,document_name:e.target.value==="__other"?"":e.target.value});}}><option value="">Selecione um documento</option>{[...new Set([...catalogNames(normalizeCategory(form.category)),...(!custom&&form.document_name?[form.document_name]:[])])].map(name=><option key={name}>{name}</option>)}<option value="__other">Outro</option></select></label>{custom&&<label className="grid gap-1 text-sm">Nome do documento, exame ou treinamento *<input className={field} value={form.document_name} onChange={e=>setForm({...form,document_name:e.target.value})}/></label>}<label className="grid gap-1 text-sm">Padrão?<select className={field} disabled={pjRecordCategory(form.category,form.document_name)==="NFs"} value={pjRecordCategory(form.category,form.document_name)!=="NFs"&&form.is_standard?"sim":"nao"} onChange={e=>setForm({...form,is_standard:e.target.value==="sim"})}><option value="sim">Sim</option><option value="nao">Não</option></select></label><label className="grid gap-1 text-sm">Assinado?<select value={form.signature_status==="signed"?"sim":"nao"} disabled={form.signature_status==="not_applicable"} className={field+" disabled:opacity-50"} onChange={e=>setForm({...form,signature_status:e.target.value==="sim"?"signed":"pending"})}><option value="sim">Sim</option><option value="nao">Não</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.signature_status==="not_applicable"} onChange={e=>setForm({...form,signature_status:e.target.checked?"not_applicable":"pending"})}/> Este documento não precisa de assinatura</label><div className="grid gap-x-6 gap-y-5 sm:grid-cols-2"><label className="grid gap-1 text-sm">Última realização<input type="date" className={field} value={form.completed_on} onChange={e=>setForm({...form,completed_on:e.target.value})}/></label><label className="grid gap-1 text-sm">Data de vencimento<input type="date" disabled={form.no_due_date} className={field} value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.no_due_date} onChange={e=>setForm({...form,no_due_date:e.target.checked,due_date:e.target.checked?"":form.due_date})}/> Este documento não possui data de vencimento</label></>:<><label className="grid gap-1 text-sm">Início<input type="date" className={field} value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/></label><label className="grid gap-1 text-sm">Fim<input type="date" className={field} value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></label></>}
    <label className="grid gap-1 text-sm">Observação<textarea className={field} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>{error&&<p className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap justify-between gap-2">{editing?<button data-role-sensitive type="button" disabled={busy} onClick={()=>{const row=entries.find(e=>e.id===editing);if(row)void remove(row);}} className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10">Excluir registro</button>:<span/>}<div className="flex gap-2"><button disabled={busy} onClick={()=>setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button><button data-role-sensitive disabled={busy} onClick={()=>void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{editing?"Salvar alterações":"Salvar"}</button></div></div></Card></div>}
  </div>;
}
