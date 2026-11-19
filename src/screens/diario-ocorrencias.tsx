// @ts-nocheck -- compact legacy code; strict index-signature checks disabled until refactor
import {pjRecordCategory,pjDocKey} from "@/lib/pj-document-categories";
import { EmployeeDossierExport } from "@/components/employee-dossier-export";
import { EmployeeAssetsAccess } from "@/components/employee-assets-access";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, ClipboardList, Plus, RefreshCw, Star, Trash2, Pencil, BookOpen, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAccountIdentity } from "@/hooks/use-account-identity";
import { CompanyFilter } from "@/components/company-filter";

import { ScreenBrand } from "@/components/screen-brand";
import { CareerHistory } from "@/components/career-history";
import { PjOrganization } from "@/components/pj-organization";
import { DocumentAuditImport } from "@/components/document-audit-import";
import { auditTrainingKey, isAuditEmployeeActive, type AuditRow } from "@/lib/document-audit-import";
type Employee = { id: string; full_name: string; status?: string; company_id?: string | null; hire_date?: string | null; termination_date?: string | null };
type LifeEvent = { id: string; employee_id: string; event_date: string; period_id?: string|null; category: string; direction: "positive"|"negative"|"neutral"; title: string; description: string|null; score: number; is_star: boolean; status: "active"|"void"; employees?: { full_name: string }|null };
type DocRecord = { id: string; employee_id: string; document_name: string; catalog_id?: string|null; is_standard?: boolean; no_due_date?: boolean; has_documentation?: boolean; delivery_status?: "not_delivered"|"delivered"; signature_status?: "not_applicable"|"pending"|"signed"; last_completed_on: string|null; due_date: string|null; notes: string|null; status: string; category?: string|null; is_custom?: boolean; employees?: { full_name: string }|null };
type DocRequirement = { id?: string; employee_id: string; catalog_id: string; is_applicable: boolean; is_required: boolean; requires_signature: boolean };
const CUSTOM_DOC="__outro__";
const normCat=(v:string|null|undefined)=>v==="Documentos Pessoais"?"Pessoais":v==="Contrato"?"Contratação":v==="Responsabilidades Anuais"?"Responsabilidades anuais":(v||"Diversos");
type DocCatalog = { id: string; name: string; category: string; alert_days: number; active: boolean };
type ChecklistTemplate = { id: string; process_type: "onboarding"|"offboarding"; title: string; position: number; active: boolean };
const tabs = [{id:"diario",label:"Ocorrências",icon:BookOpen},{id:"documentos",label:"Documentos e vencimentos",icon:CalendarClock},{id:"checklists",label:"Onboarding e demissão",icon:ClipboardList},{id:"career",label:"Evolução Funcional e Salarial",icon:BookOpen},] as const;
const today = () => new Date().toISOString().slice(0,10);
const dateLabel = (v?: string|null) => v ? v.slice(0,10).split("-").reverse().join("/") : "—";
const emptyEvent = {employee_id:"",event_date:today(),category:"Geral",direction:"positive" as "positive"|"negative"|"neutral",title:"",description:"",is_star:false};
const emptyDoc = {employee_id:"",document_name:"",no_due_date:false,has_documentation:"true",delivery_status:"not_delivered" as "not_delivered"|"delivered",signature_status:"pending" as "not_applicable"|"pending"|"signed",last_completed_on:"",due_date:"",notes:""};
export function DiarioOcorrencias() {
  const {role}=useAccountIdentity();
  const canManageEvents=role==="administrador";
  const [tab,setTab]=useState<(typeof tabs)[number]["id"]>(()=>sessionStorage.getItem("dp-career-employee")?"career":"diario");
  const [documentLink,setDocumentLink]=useState<"clt"|"pj">("clt");
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [events,setEvents]=useState<LifeEvent[]>([]);
  const [periods,setPeriods]=useState<{id:string;start_date:string;end_date:string}[]>([]);
  const [documents,setDocuments]=useState<DocRecord[]>([]);
  const [requirements,setRequirements]=useState<DocRequirement[]>([]);
  const [requirementEmployee,setRequirementEmployee]=useState("");
  const [docCatalog,setDocCatalog]=useState<DocCatalog[]>([]);
  const [catalogName,setCatalogName]=useState("");
  const [catalogCategory,setCatalogCategory]=useState("Diversos");
  const [catalogOpen,setCatalogOpen]=useState(false);
    const [selectedDocCategory,setSelectedDocCategory]=useState("");
  const [openNewRecordCategory,setOpenNewRecordCategory]=useState<string|null>(null);
  const [collapsedDocCategories,setCollapsedDocCategories]=useState<string[]>([]);
  const [selectedCatalog,setSelectedCatalog]=useState("");
  const [templates,setTemplates]=useState<ChecklistTemplate[]>([]);
  const [loading,setLoading]=useState(false);
  const [removingImportedDocuments,setRemovingImportedDocuments]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [companyFilter,setCompanyFilter]=useState("");
  const [statusFilter,setStatusFilter]=useState<"ativo"|"inativo"|"todos">("ativo");
  const [employeeFilter,setEmployeeFilter]=useState("todos");
  const [periodFilter,setPeriodFilter]=useState("todos");
  const [eventOpen,setEventOpen]=useState(false);
  const [editingEvent,setEditingEvent]=useState<LifeEvent|null>(null);
  const [eventForm,setEventForm]=useState(emptyEvent);
  const [docOpen,setDocOpen]=useState(false);
  const [docForm,setDocForm]=useState(emptyDoc);
  const [editingDoc,setEditingDoc]=useState<DocRecord|null>(null);
  const [templateTitle,setTemplateTitle]=useState("");
  const [templateType,setTemplateType]=useState<"onboarding"|"offboarding">("onboarding");
  const [selectedEmployee,setSelectedEmployee]=useState("");
  const [processType,setProcessType]=useState<"onboarding"|"offboarding">("onboarding");
  const [processSteps,setProcessSteps]=useState<string[]>([]);
  const [stepTitle,setStepTitle]=useState("");

  const visibleEmployees=useMemo(()=>employees.filter(e=>(!companyFilter||e.company_id===companyFilter)&&(statusFilter==="todos"||e.status===statusFilter)),[employees,companyFilter,statusFilter]);
  const visibleIds=new Set(visibleEmployees.map(e=>e.id));
  const visibleEvents=events.filter(e=>visibleIds.has(e.employee_id)&&(employeeFilter==="todos"||e.employee_id===employeeFilter)&&(periodFilter==="todos"||e.period_id===periodFilter));
  const scoreTotals=visibleEvents.filter(e=>e.status==="active").reduce((acc,e)=>{if(e.direction==="positive")acc.positive+=e.score;if(e.direction==="negative")acc.negative+=e.score;if(e.direction==="positive"&&e.score>0)acc.stars+=1;return acc;},{positive:0,negative:0,stars:0});
  const filteredDocs=documents.filter(d=>visibleIds.has(d.employee_id)&&(employeeFilter==="todos"||d.employee_id===employeeFilter));
  const dueState=(d:DocRecord)=>{if(!d.due_date)return "Sem vencimento";const days=Math.ceil((new Date(d.due_date+"T00:00:00").getTime()-new Date(today()+"T00:00:00").getTime())/86400000);return days<0?"Vencido":days<=30?"Próximo do vencimento":"Em dia";};
  const employeeDocRequirements=docCatalog.map(item=>requirements.find(r=>r.employee_id===requirementEmployee&&r.catalog_id===item.id)??{employee_id:requirementEmployee,catalog_id:item.id,is_applicable:true,is_required:false,requires_signature:false});
  const applicableEmployeeDocRequirements=employeeDocRequirements.filter(r=>r.is_applicable);
  const requiredDocSummary=applicableEmployeeDocRequirements.filter(r=>r.is_required).map(r=>{const records=documents.filter(d=>d.employee_id===requirementEmployee&&d.catalog_id===r.catalog_id).sort((a,b)=>(b.last_completed_on||"").localeCompare(a.last_completed_on||""));const latest=records[0];const regular=!!latest&&latest.has_documentation!==false&&latest.delivery_status==="delivered"&&(!r.requires_signature||latest.signature_status==="signed"||latest.signature_status==="not_applicable");return {requirement:r,latest,regular};});
  const regularRequiredCount=requiredDocSummary.filter(x=>x.regular).length;

  async function load(){
    setLoading(true);setError("");setNotice("");
    const [e,o,d,t,cat,p,req]=await Promise.all([
      (supabase as any).from("employees").select("id,full_name,status,company_id,hire_date,termination_date").order("full_name"),
      (supabase as any).from("employee_life_events").select("*,employees(full_name)").order("event_date",{ascending:false}),
      (supabase as any).from("employee_document_records").select("*,employees(full_name)").order("due_date"),
      (supabase as any).from("employee_checklist_templates").select("*").order("position").order("title"),
      (supabase as any).from("employee_document_catalog").select("*").eq("active",true).order("category").order("name"),
      (supabase as any).from("time_periods").select("id,start_date,end_date").order("start_date",{ascending:false}),
      (supabase as any).from("employee_document_requirements").select("*")
    ]);
    if(e.error) setError("Não foi possível carregar funcionários: "+e.error.message);
    else setEmployees(e.data??[]);
    if(o.error||d.error||t.error||cat.error||p.error) setError("O módulo está no repositório, mas parte das tabelas pode ainda não estar aplicada no Supabase. Detalhe: "+(o.error||d.error||t.error||cat.error||p.error).message);
    if(req.error) setError("A configuração individual de documentos ainda não está disponível no banco. Aplique a nova migração do módulo. Detalhe: "+req.error.message);
    setEvents(o.data??[]);setDocuments(d.data??[]);setTemplates(t.data??[]);setDocCatalog(cat.data??[]);setPeriods(p.data??[]);setRequirements(req.data??[]);
    if(periodFilter==="todos"){const current=(p.data??[]).find((item:any)=>item.start_date<=today()&&item.end_date>=today());if(current)setPeriodFilter(current.id);}
    setLoading(false);
  }
  useEffect(()=>{void load();},[]);
  function openNewEvent(){if(!canManageEvents)return;setEditingEvent(null);setEventForm({...emptyEvent,employee_id:employeeFilter!=="todos"?employeeFilter:""});setError("");setEventOpen(true);}
  function editEvent(e:LifeEvent){if(!canManageEvents)return;setEditingEvent(e);setEventForm({employee_id:e.employee_id,event_date:e.event_date,category:e.category,direction:e.direction,title:e.title,description:e.description??"",is_star:e.direction==="positive"&&e.score>0});setEventOpen(true);setError("");}
  async function saveEvent(){
    if(!canManageEvents){setError("Sua conta não tem permissão para esta ação.");return;}
    if(loading)return;
    if(!eventForm.employee_id||!eventForm.event_date||!eventForm.title.trim()){setError("Preencha funcionário, data e título da ocorrência.");return;}
    setLoading(true);const user=await (supabase as any).auth.getUser();
    if(user.error||!user.data?.user?.id){setLoading(false);setError("Sessão inválida. Entre novamente.");return;}
    const period=periods.find(p=>eventForm.event_date>=p.start_date&&eventForm.event_date<=p.end_date);
    const hasStar = eventForm.direction === "positive" && eventForm.is_star;
    const score = eventForm.direction === "negative" || hasStar ? 1 : 0;
    const payload={employee_id:eventForm.employee_id,event_date:eventForm.event_date,period_id:period?.id??null,category:eventForm.category.trim()||"Geral",direction:eventForm.direction,title:eventForm.title.trim(),description:eventForm.description.trim()||null,score,is_star:hasStar,source:"manual",...(editingEvent?{}:{created_by:user.data.user.id})};
    const result=editingEvent?await (supabase as any).from("employee_life_events").update(payload).eq("id",editingEvent.id):await (supabase as any).from("employee_life_events").insert(payload);
    setLoading(false);if(result.error){setError(/row-level security/i.test(result.error.message)?"Sua conta não tem permissão para salvar esta ocorrência. Verifique as permissões e a migração do Diário de Ocorrências.":result.error.message);return;}setEventOpen(false);setNotice("Ocorrência salva.");await load();
  }
  async function deleteEvent(e:LifeEvent){
    if(!canManageEvents)return;
    const employeeName=e.employees?.full_name||employees.find(x=>x.id===e.employee_id)?.full_name||"este funcionário";
    if(!window.confirm(`Excluir definitivamente a ocorrência "${e.title}" de ${employeeName}? Esta ação não pode ser desfeita.`))return;
    setError("");setNotice("");
    const {error}=await (supabase as any).from("employee_life_events").delete().eq("id",e.id);
    if(error){setError("Não foi possível excluir a ocorrência: "+error.message);return;}
    setNotice("Ocorrência excluída.");
    await load();
  }
  async function saveCatalog(){
    if(!catalogName.trim()){setError("Informe o nome do documento padrão.");return;}
    const {error}=await (supabase as any).from("employee_document_catalog").insert({name:catalogName.trim(),category:catalogCategory,active:true});
    if(error){setError(error.message);return;}setCatalogName("");setCatalogCategory("Diversos");setNotice("Documento adicionado à lista padrão.");await load();
  }
  async function removeCatalog(item:DocCatalog){
    if(!window.confirm(`Desativar "${item.name}" da lista padrão?`))return;
    const {error}=await (supabase as any).from("employee_document_catalog").update({active:false}).eq("id",item.id);
    if(error)setError(error.message);else{setNotice("Item desativado.");await load();}
  }
  function editDoc(d:DocRecord){
    if(d.is_custom){setEditingDoc(d);setSelectedDocCategory(normCat(d.category));setSelectedCatalog(CUSTOM_DOC);setDocForm({employee_id:d.employee_id,document_name:d.document_name,has_documentation:String(d.has_documentation??true),delivery_status:d.delivery_status??"delivered",signature_status:d.signature_status??"pending",last_completed_on:d.last_completed_on??"",due_date:d.due_date??"",no_due_date:d.no_due_date??false,notes:d.notes??""});setError("");setDocOpen(true);return;}
    const catalog=docCatalog.find(item=>item.id===d.catalog_id)||docCatalog.find(item=>item.name===d.document_name);
    setEditingDoc(d);setSelectedDocCategory(catalog?.category??"");setSelectedCatalog(catalog?.id??"");
    setDocForm({employee_id:d.employee_id,document_name:d.document_name,has_documentation:String(d.has_documentation??true),delivery_status:d.delivery_status??"delivered",signature_status:d.signature_status??"pending",last_completed_on:d.last_completed_on??"",due_date:d.due_date??"",no_due_date:d.no_due_date??false,notes:d.notes??""});
    setError("");setDocOpen(true);
  }
  async function importMixedAuditDocuments(rows: AuditRow[]) {
    const clt=rows.filter(r=>r.link!=="PJ"),pj=rows.filter(r=>r.link==="PJ");
    const result=clt.length?await importAuditDocuments(clt):{imported:0,skipped:0,warnings:[] as string[]};
    if(!pj.length)return result;
    try{
      const db=supabase as any;
      const ids=[...new Set(pj.map(r=>r.employeeId).filter(Boolean))];
      const activeIds=new Set<string>();
      for(let i=0;i<ids.length;i+=100){
        const {data,error}=await db.from("pj_people").select("id,full_name,status,start_date,end_date").in("id",ids.slice(i,i+100));
        if(error)throw new Error(error.message);
        for(const p of data??[])if(isAuditEmployeeActive({id:p.id,full_name:p.full_name,status:p.status,hire_date:p.start_date,termination_date:p.end_date}))activeIds.add(p.id);
      }
      const existing:any[]=[];
      for(let i=0;i<ids.length;i+=100)for(let offset=0;;offset+=500){
        const {data,error}=await db.from("pj_documents").select("*").in("person_id",ids.slice(i,i+100)).order("id").range(offset,offset+499);
        if(error)throw new Error(error.message);existing.push(...(data??[]));if(!data||data.length<500)break;
      }
      const canonical=(s:unknown)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g," ");
      const pending:any[]=[];
      for(const row of pj){
        if(row.destination!=="documents"||row.employeeStatus!=="matched"||!row.employeeId||!activeIds.has(row.employeeId)||row.issue||row.isStandard===null){result.skipped++;continue;}
        const match=(d:any)=>d.person_id===row.employeeId&&pjRecordCategory(d.category,d.document_name)===pjRecordCategory(row.category,row.documentName)&&canonical(d.document_name)===canonical(row.documentName)&&(d.completed_on??null)===row.completedOn&&(d.due_date??null)===row.dueDate;
        if(existing.some(match)||pending.some(match)){result.skipped++;continue;}
        const comment=row.originalComment.trim(),normalized=canonical(comment);
        const signed=/\bassinad[oa]\b/.test(normalized)&&!/\b(?:nao|sem)\s+assinad[oa]/.test(normalized);
        const identity=JSON.stringify(["PJ",row.employeeId,pjRecordCategory(row.category,row.documentName),canonical(row.documentName),row.completedOn,row.dueDate]);
        const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(identity)));digest[6]=(digest[6]&15)|80;digest[8]=(digest[8]&63)|128;
        const hex=Array.from(digest.slice(0,16),x=>x.toString(16).padStart(2,"0")).join("");const id=hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
        pending.push({id,imported_from_audit:true,person_id:row.employeeId,category:pjRecordCategory(row.category,row.documentName),document_name:row.documentName,is_standard:pjRecordCategory(row.category,row.documentName)==="NFs"?false:row.isStandard,completed_on:row.completedOn,due_date:row.dueDate,signature_status:signed?"signed":"pending",notes:comment||null});
      }
      if(pending.length){const {data,error}=await db.from("pj_documents").upsert(pending,{onConflict:"id",ignoreDuplicates:true}).select("id");if(error)throw new Error(error.message);result.imported+=data?.length??0;result.skipped+=pending.length-(data?.length??0);}
      const catalogRows=[...new Map(pj.filter(r=>pjRecordCategory(r.category,r.documentName)!=="NFs"&&r.isStandard&&r.employeeId&&activeIds.has(r.employeeId)).map(r=>[pjRecordCategory(r.category,r.documentName)+"|"+pjDocKey(r.documentName),{category:pjRecordCategory(r.category,r.documentName),name:r.documentName.trim()}])).values()];
      if(catalogRows.length){const {error}=await db.from("pj_document_catalog").upsert(catalogRows,{onConflict:"category,name",ignoreDuplicates:true});if(error)result.warnings.push("Catálogo PJ: "+error.message);}
    }catch(e){result.warnings.push("Importação PJ não concluída: "+(e instanceof Error?e.message:String(e))); }
    return result;
  }
  async function importAuditDocuments(rows: AuditRow[]) {
    const db = supabase as any;
    const { data: auth, error: authError } = await db.auth.getUser();
    if (authError || !auth?.user?.id) throw new Error("Sessão inválida. Entre novamente no sistema.");
    const candidates = rows.filter(r => r.destination === "documents" && r.employeeStatus === "matched" && r.employeeId && !r.issue && r.isStandard !== null);
    const ids = [...new Set(candidates.map(r => r.employeeId!))];
    const activeIds = new Set<string>();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { data, error } = await db.from("employees").select("id,full_name,status,hire_date,termination_date").in("id", ids.slice(offset, offset + 100));
      if (error) throw new Error("Não foi possível validar funcionários ativos: " + error.message);
      for (const employee of data ?? []) if (isAuditEmployeeActive(employee)) activeIds.add(employee.id);
    }
    const safeRows = candidates.filter(r => activeIds.has(r.employeeId!));
    const canonical = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
    const warnings: string[] = [];
    let imported = 0, skipped = rows.length - safeRows.length;
    const selectedIds = [...new Set(safeRows.map(r => r.employeeId!))];
    if (!selectedIds.length) return { imported, skipped, warnings };
    // Fetch fresh existing records, including all pages, before inserting anything.
    async function readAll(table: string, filter?: string[]) {
      const all: any[] = [];
      for (let offset = 0; ; offset += 500) {
        let query = db.from(table).select("*").order("id");
        if (filter) query = query.in("employee_id", filter);
        const { data, error } = await query.range(offset, offset + 499);
        if (error) throw new Error(error.message);
        all.push(...(data ?? []));
        if (!data || data.length < 500) return all;
      }
    }
    const [existing, catalog, existingRules] = await Promise.all([
      readAll("employee_document_records", selectedIds),
      readAll("employee_document_catalog"),
      readAll("employee_document_requirements", selectedIds),
    ]);
    const pending: any[] = [];
    const rules = new Map<string, any>();
    const seen = new Map<string, number>();
    for (const row of safeRows) {
      const inCategory = catalog.filter(item => item.active && canonical(normCat(item.category)) === canonical(normCat(row.category)));
      const exact = inCategory.filter(item => canonical(item.name) === canonical(row.documentName));
      const trainingKey = auditTrainingKey(row.documentName);
      const aliases = trainingKey ? inCategory.filter(item => auditTrainingKey(item.name) === trainingKey) : [];
      // Exact title takes precedence; an ambiguous alias must not discard a training record.
      const item = exact.length === 1 ? exact[0] : exact.length === 0 && aliases.length === 1 ? aliases[0] : undefined;
      if (!item && (exact.length > 1 || aliases.length > 1)) warnings.push(row.employeeName + " — " + row.documentName + ": mantido como documento personalizado para não misturar certificados distintos.");
      const name = item?.name ?? row.documentName;
      const comment = row.originalComment.trim();
      const commentKey = canonical(comment);
      const signed = /\bassinad[oa]\b/.test(commentKey) && !/\b(?:nao|sem)\s+assinad[oa]/.test(commentKey);
      const delivered = signed || /\b(?:entregue|realizad[oa]|emitid[oa]|concluid[oa])\b/.test(commentKey) && !/\b(?:nao|sem)\s+(?:entregue|realizado|emitido|concluido)\b/.test(commentKey);
      const noDue = /\b(?:sem vencimento|nao possui vencimento|nao se aplica vencimento)\b/.test(commentKey);
      const sameDocument = (d: any) => d.employee_id === row.employeeId && ((item && d.catalog_id === item.id) || (canonical(d.document_name) === canonical(name) && canonical(normCat(d.category ?? (catalog.find(x => x.id === d.catalog_id)?.category))) === canonical(normCat(row.category))));
      const sameRecord = existing.some(d => sameDocument(d) && (d.last_completed_on ?? null) === row.completedOn && (d.due_date ?? null) === row.dueDate);
      if (sameRecord) { skipped++; continue; }
      // Stable ID by content + occurrence number prevents duplicate writes on retry.
      const identity = JSON.stringify([row.employeeId, canonical(row.category), canonical(name), row.completedOn, row.dueDate, commentKey]);
      const ordinal = (seen.get(identity) ?? 0) + 1;
      seen.set(identity, ordinal);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity + "|" + ordinal)));
      digest[6] = (digest[6] & 15) | 80; digest[8] = (digest[8] & 63) | 128;
      const hex = Array.from(digest.slice(0,16), x => x.toString(16).padStart(2,"0")).join("");
      const id = hex.slice(0,8)+"-"+hex.slice(8,12)+"-"+hex.slice(12,16)+"-"+hex.slice(16,20)+"-"+hex.slice(20);
      pending.push({ id, employee_id: row.employeeId, catalog_id: item?.id ?? null, category: normCat(row.category), is_custom: !item, is_standard: row.isStandard, document_name: name, has_documentation: delivered, delivery_status: delivered ? "delivered" : "not_delivered", signature_status: signed ? "signed" : "pending", last_completed_on: row.completedOn, due_date: row.dueDate, no_due_date: !row.dueDate && noDue, notes: comment || null, created_by: auth.user.id });
      if (item) {
        const key = row.employeeId + "|" + item.id;
        const old = existingRules.find(r => r.employee_id === row.employeeId && r.catalog_id === item.id);
        if (old) {
          if (old.is_applicable !== row.isStandard) warnings.push(row.employeeName + " — " + name + ": padrão já cadastrado preservado.");
        } else if (!rules.has(key)) {
          rules.set(key, { employee_id: row.employeeId, catalog_id: item.id, is_applicable: row.isStandard, is_required: false, requires_signature: false });
        }
      }
    }
    // One insert-only request for records: no updates to existing rows.
    if (pending.length) {
      const { data, error } = await db.from("employee_document_records").upsert(pending, { onConflict: "id", ignoreDuplicates: true }).select("id");
      if (error) throw new Error("Documentos não gravados: " + error.message);
      imported = data?.length ?? 0;
      skipped += pending.length - imported;
    }
    if (rules.size) {
      const { error } = await db.from("employee_document_requirements").upsert([...rules.values()], { onConflict: "employee_id,catalog_id", ignoreDuplicates: true });
      if (error) warnings.push("Documentos gravados, mas a configuração de padrão não foi concluída: " + error.message);
    }
    await load();
    return { imported, skipped, warnings };
  }
  async function saveDoc(){
    // Renova a sessão antes de gravar: um token expirado faz o banco recusar a gravação.
    await (supabase as any).auth.refreshSession().catch(()=>null);
    if(selectedCatalog===CUSTOM_DOC){
      const name=(docForm.document_name||"").trim();
      if(!docForm.employee_id||!selectedDocCategory){setError("Selecione o funcionário e a categoria.");return;}
      if(!name){setError("Informe o nome do documento, exame ou treinamento.");return;}
      const payload={employee_id:docForm.employee_id,catalog_id:null,category:selectedDocCategory,is_custom:true,is_standard:editingDoc?.is_standard??false,document_name:name,has_documentation:docForm.has_documentation==="true",delivery_status:docForm.delivery_status,signature_status:docForm.signature_status,last_completed_on:docForm.last_completed_on||null,due_date:docForm.no_due_date?null:(docForm.due_date||null),no_due_date:docForm.no_due_date,notes:docForm.notes.trim()||null};
      const result=editingDoc
        ? await (supabase as any).from("employee_document_records").update(payload).eq("id",editingDoc.id)
        : await (supabase as any).from("employee_document_records").insert({...payload,created_by:(await (supabase as any).auth.getUser()).data?.user?.id??null});
      if(result.error){setError(/row-level security/i.test(result.error.message)?"Sua sessão não tem permissão de edição. Saia e entre novamente com uma conta Administradora.":result.error.message);return;}
      setDocOpen(false);setDocForm(emptyDoc);setSelectedDocCategory("");setSelectedCatalog("");setEditingDoc(null);setNotice(editingDoc?"Documento atualizado.":"Documento registrado.");await load();return;
    }
    const chosen=docCatalog.find(c=>c.id===selectedCatalog);
    const documentName=chosen?.name??"";
    if(!docForm.employee_id||!chosen){setError("Selecione o funcionário e um documento da lista padrão.");return;}
    const payload={employee_id:docForm.employee_id,catalog_id:chosen.id,document_name:documentName,has_documentation:docForm.has_documentation==="true",delivery_status:docForm.delivery_status,signature_status:docForm.signature_status,last_completed_on:docForm.last_completed_on||null,due_date:docForm.no_due_date?null:(docForm.due_date||null),no_due_date:docForm.no_due_date,notes:docForm.notes.trim()||null};
    const result=editingDoc
      ? await (supabase as any).from("employee_document_records").update(payload).eq("id",editingDoc.id)
      : await (supabase as any).from("employee_document_records").insert({...payload,created_by:(await (supabase as any).auth.getUser()).data?.user?.id??null});
    if(result.error){setError(/row-level security/i.test(result.error.message)?"Sua sessão não tem permissão de edição. Saia e entre novamente com uma conta Administradora.":result.error.message);return;}
    setDocOpen(false);setDocForm(emptyDoc);setSelectedDocCategory("");setSelectedCatalog("");setEditingDoc(null);setNotice(editingDoc?"Documento atualizado.":"Documento registrado.");await load();
  }
  async function saveCustomStandard(records:DocRecord[],isStandard:boolean){
    const ids=records.map(record=>record.id);
    if(!ids.length)return;
    const {error}=await (supabase as any).from("employee_document_records").update({is_standard:isStandard}).in("id",ids);
    if(error){setError("Não foi possível atualizar o padrão deste documento: "+error.message);return;}
    setDocuments(current=>current.map(record=>ids.includes(record.id)?{...record,is_standard:isStandard}:record));
    setNotice("Configuração de padrão atualizada.");
  }
  async function saveRequirement(catalogId:string,patch:Partial<DocRequirement>={}){
    if(!requirementEmployee){setError("Selecione um funcionário para configurar os documentos.");return;}
    const current=requirements.find(r=>r.employee_id===requirementEmployee&&r.catalog_id===catalogId);
    const payload={employee_id:requirementEmployee,catalog_id:catalogId,is_applicable:current?.is_applicable??true,is_required:current?.is_required??false,requires_signature:current?.requires_signature??false,...patch};
    const {error}=await (supabase as any).from("employee_document_requirements").upsert(payload,{onConflict:"employee_id,catalog_id"});
    if(error){setError(error.message);return;}
    setNotice("Configuração individual atualizada.");
    await load();
  }
  async function removeImportedDocuments(){
    if(removingImportedDocuments)return;
    setRemovingImportedDocuments(true);setError("");setNotice("");
    const db=supabase as any;
    let removed=0;
    try{
      // All employees and companies, regardless of the current screen filters.
      // Audit importer uses deterministic UUID v5; manually created rows use database-generated v4.
      const ids:string[]=[];
      for(let offset=0;;offset+=500){
        const {data,error}=await db.from("employee_document_records").select("id").order("id").range(offset,offset+499);
        if(error)throw new Error(error.message);
        ids.push(...(data??[]).map((d:{id:string})=>d.id).filter((id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)));
        if(!data||data.length<500)break;
      }
      if(!ids.length){setNotice("Nenhum documento importado identificado no sistema.");return;}
      if(!window.confirm("ATENÇÃO: excluir "+ids.length+" documentos importados CLT de TODOS os funcionários e empresas? Esta ação é definitiva. Documentos manuais e configurações individuais de padrão serão preservados."))return;
      for(let offset=0;offset<ids.length;offset+=100){
        const batch=ids.slice(offset,offset+100);
        const {data,error}=await db.from("employee_document_records").delete().in("id",batch).select("id");
        if(error)throw new Error(error.message);
        removed+=data?.length??0;
      }
      await load();
      if(removed!==ids.length)setError(removed+" de "+ids.length+" registros excluídos. Os demais não foram removidos; verifique as permissões.");
      else setNotice(removed+" documentos importados excluídos de todos os funcionários.");
    }catch(e){
      if(removed)await load();
      setError("Exclusão interrompida. "+removed+" registros excluídos. "+(e instanceof Error?e.message:String(e)));
    }finally{setRemovingImportedDocuments(false);}
  }
  async function removeDoc(d:DocRecord){if(!window.confirm(`Excluir o registro de "${d.document_name}"? Esta ação não poderá ser desfeita.`))return;const {data,error}=await (supabase as any).from("employee_document_records").delete().eq("id",d.id).select("id");if(error||!data?.length){setError(error?.message||"Registro não excluído. Verifique sua permissão.");return;}setDocOpen(false);setEditingDoc(null);setDocForm(emptyDoc);await load();setNotice("Registro excluído.");}
  async function deleteChecklistStep(stepId:string){
    if(!window.confirm("Excluir definitivamente esta etapa do checklist?"))return;
    setError("");setNotice("");
    const {error}=await (supabase as any).from("employee_checklist_steps").delete().eq("id",stepId);
    if(error){setError("Não foi possível excluir a etapa: "+error.message);return;}
    setNotice("Etapa excluída.");await loadProcessSteps();
  }
  async function addTemplate(){
    if(!templateTitle.trim()){setError("Informe o nome da etapa.");return;}
    const {error}=await (supabase as any).from("employee_checklist_templates").insert({process_type:templateType,title:templateTitle.trim(),position:templates.filter(t=>t.process_type===templateType).length});
    if(error)setError(error.message);else{setTemplateTitle("");setNotice("Etapa adicionada ao modelo.");await load();}
  }
  async function editTemplate(t:ChecklistTemplate){const next=window.prompt("Editar etapa",t.title);if(!next?.trim())return;const {error}=await (supabase as any).from("employee_checklist_templates").update({title:next.trim()}).eq("id",t.id);if(error)setError(error.message);else await load();}
  async function deleteTemplate(t:ChecklistTemplate){if(!window.confirm("Remover esta etapa dos modelos futuros? Os checklists já iniciados não são alterados."))return;const {error}=await (supabase as any).from("employee_checklist_templates").update({active:false}).eq("id",t.id);if(error)setError(error.message);else await load();}
  async function startProcess(){
    if(!selectedEmployee){setError("Selecione um funcionário para iniciar o checklist.");return;}
    const steps=templates.filter(t=>t.process_type===processType&&t.active);
    if(!steps.length){setError("Cadastre ao menos uma etapa ativa para este tipo de processo.");return;}
    const {data:userData}=await (supabase as any).auth.getUser();
    const {data:instance,error}=await (supabase as any).from("employee_checklist_instances").insert({employee_id:selectedEmployee,process_type:processType}).select("id").single();
    if(error){setError(error.message);return;}
    const {error:stepError}=await (supabase as any).from("employee_checklist_steps").insert(steps.map(t=>({instance_id:instance.id,template_id:t.id,title_snapshot:t.title,position:t.position})));
    if(stepError){setError(stepError.message);return;}setNotice("Checklist criado com uma cópia das etapas atuais.");await load();
  }
  async function toggleStep(stepId:string,status:string){const next=status==="completed"?"pending":"completed";const {error}=await (supabase as any).from("employee_checklist_steps").update({status:next,completed_at:next==="completed"?today():null}).eq("id",stepId);if(error)setError(error.message);else setNotice("Etapa atualizada.");}
  async function loadProcessSteps(){if(!selectedEmployee){setError("Selecione um funcionário.");return;}const {data,error}=await (supabase as any).from("employee_checklist_instances").select("id,process_type,started_at,status,employee_checklist_steps(id,title_snapshot,status,position)").eq("employee_id",selectedEmployee).eq("process_type",processType).order("started_at",{ascending:false});if(error){setError(error.message);return;}setProcessSteps((data??[]).flatMap((i:any)=>(i.employee_checklist_steps??[]).map((s:any)=>({...s,instanceId:i.id,started_at:i.started_at}))));}
  async function addStepToExisting(){if(!selectedEmployee||!stepTitle.trim()){setError("Selecione o funcionário e informe a etapa.");return;}const {data:instances,error}=await (supabase as any).from("employee_checklist_instances").select("id").eq("employee_id",selectedEmployee).eq("process_type",processType).eq("status","in_progress").order("started_at",{ascending:false}).limit(1);if(error||!instances?.length){setError(error?.message||"Não há checklist em andamento para este funcionário e processo.");return;}const {error:insertError}=await (supabase as any).from("employee_checklist_steps").insert({instance_id:instances[0].id,title_snapshot:stepTitle.trim(),position:processSteps.length});if(insertError)setError(insertError.message);else{setStepTitle("");await loadProcessSteps();}}

  return <div className="dp-screen min-h-screen bg-background">
    <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4"><a href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a><ScreenBrand name="Diário de Ocorrências" /></div></header>
    <main className="dp-screen-content mx-auto max-w-[1500px] space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-[1500px] relative isolate mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 flex flex-wrap items-center justify-between gap-4 [&_p]:!text-white/75 [&_h1]:!text-white"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Organização do RH</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-[30px]">Diário de Ocorrências</h1><p className="mt-1 text-sm text-muted-foreground">Registro da trajetória funcional, documentos e processos.</p></div><div className="flex flex-wrap items-center gap-2"><button onClick={()=>void load()} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"><RefreshCw className="h-4 w-4"/>Atualizar</button><EmployeeDossierExport/></div></div>
      {(error||notice)&&<div className={"rounded-lg border p-3 text-sm "+(error?"border-destructive/30 text-destructive":"border-primary/30 text-primary")}>{error||notice}</div>}
      <Card className="p-5"><div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="grid min-w-0 gap-1.5 text-sm"><span className="text-muted-foreground">Empresa</span><CompanyFilter className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" value={companyFilter} onChange={v=>{setCompanyFilter(v);setEmployeeFilter("todos");}}/></label><label className="grid min-w-0 gap-1.5 text-sm"><span className="text-muted-foreground">Situação do funcionário</span><select className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" value={statusFilter} onChange={e=>{setStatusFilter(e.target.value as "ativo"|"inativo"|"todos");setEmployeeFilter("todos");}}><option value="ativo">Ativos</option><option value="inativo">Inativos</option><option value="todos">Todos</option></select></label><label className="grid min-w-0 gap-1.5 text-sm"><span className="text-muted-foreground">Funcionário</span><select className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)}><option value="todos">Todos os funcionários</option>{visibleEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label><label className="grid min-w-0 gap-1.5 text-sm"><span className="text-muted-foreground">Competência (21 a 20)</span><select className="h-9 w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1" value={periodFilter} onChange={e=>setPeriodFilter(e.target.value)}><option value="todos">Todas as competências</option>{periods.map(p=><option key={p.id} value={p.id}>{dateLabel(p.start_date)} a {dateLabel(p.end_date)}</option>)}</select></label></div></Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Card className="p-4"><p className="text-sm text-muted-foreground">Pontos positivos</p><p className="mt-1 text-2xl font-semibold text-emerald-600">{scoreTotals.positive}</p></Card><Card className="p-4"><p className="text-sm text-muted-foreground">Pontos negativos</p><p className="mt-1 text-2xl font-semibold text-rose-600">{scoreTotals.negative}</p></Card><Card className="p-4"><p className="text-sm text-muted-foreground">Saldo de pontos</p><p className="mt-1 text-2xl font-semibold">{scoreTotals.positive-scoreTotals.negative}</p></Card><Card className="p-4"><p className="text-sm text-muted-foreground">Destaques com estrela</p><p className="mt-1 flex items-center gap-2 text-2xl font-semibold"><Star className="h-5 w-5 fill-amber-400 text-amber-500"/>{scoreTotals.stars}</p></Card></div>
      <div className="flex flex-wrap gap-2 border-b pb-3">{tabs.map(t=>{const Icon=t.icon;return <button key={t.id} onClick={()=>setTab(t.id)} className={"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm "+(tab===t.id?"bg-primary text-primary-foreground":"border hover:bg-muted")}><Icon className="h-4 w-4"/>{t.label}</button>})}</div>
      {loading&&<p className="text-sm text-muted-foreground">Carregando dados...</p>}
      {tab==="career"&&<CareerHistory initialEmployee={sessionStorage.getItem("dp-career-employee")||""}/>}
      {tab==="diario"&&<Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Ocorrências por funcionário e competência</h2><p className="text-xs text-muted-foreground">{visibleEvents.length} registro(s) no filtro atual</p></div>{canManageEvents&&<button data-role-sensitive onClick={openNewEvent} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="mr-1 inline h-4 w-4"/>Nova ocorrência</button>}</div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/70 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Funcionário</th><th className="px-4 py-3">Tipo / categoria</th><th className="px-4 py-3">Ocorrência</th><th className="px-4 py-3">Pontuação</th><th className="px-4 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">{visibleEvents.length===0&&<tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">Nenhuma ocorrência nesta competência.</td></tr>}{visibleEvents.map(e=><tr key={e.id} className={e.status==="void"?"opacity-50":"hover:bg-muted/25"}><td className="whitespace-nowrap px-4 py-3">{dateLabel(e.event_date)}</td><td className="px-4 py-3 font-medium">{e.employees?.full_name||employees.find(x=>x.id===e.employee_id)?.full_name||"—"}</td><td className="px-4 py-3"><span className={e.direction==="positive"?"text-emerald-600":e.direction==="negative"?"text-rose-600":"text-muted-foreground"}>{e.direction==="positive"?"Positiva":e.direction==="negative"?"Negativa":"Informativa"}</span>{e.direction!=="neutral"&&e.category!=="Geral"&&<p className="text-xs text-muted-foreground">{e.category}</p>}</td><td className="max-w-[320px] px-4 py-3"><p className="font-medium">{e.title}</p><p className="text-xs text-muted-foreground">{e.description}</p>{e.status==="void"&&<p className="text-xs text-destructive">Cancelada</p>}</td><td className="px-4 py-3">{e.direction!=="neutral"&&(e.status==="void"?"—":<span className="inline-flex items-center gap-1">{e.direction==="positive"&&<Star aria-hidden="true" className={e.score>0?"size-4 fill-emerald-500 text-emerald-500":"size-4 text-muted-foreground"}/>}{e.score===0?0:(e.direction==="negative"?"−":"+")+e.score}</span>)}</td><td className="whitespace-nowrap px-4 py-3 text-right">{canManageEvents&&<><button data-role-sensitive title="Editar ocorrência" aria-label={`Editar ocorrência: ${e.title}`} onClick={()=>editEvent(e)} className="mr-1 rounded-md border p-2"><Pencil className="h-4 w-4"/></button><button data-role-sensitive title="Excluir definitivamente" aria-label={`Excluir ocorrência: ${e.title}`} onClick={()=>void deleteEvent(e)} className="rounded-md border p-2 text-destructive"><Trash2 className="h-4 w-4"/></button></>}</td></tr>)}</tbody></table></div></Card>}
      {tab==="documentos"&&<div className="flex gap-2"><button className={"rounded-sm border px-4 py-2 text-sm "+(documentLink==="clt"?"bg-primary text-primary-foreground":"")} onClick={()=>setDocumentLink("clt")}>Documentos CLT</button><button className={"rounded-sm border px-4 py-2 text-sm "+(documentLink==="pj"?"bg-primary text-primary-foreground":"")} onClick={()=>setDocumentLink("pj")}>Documentos PJ</button></div>}
      {tab==="documentos"&&documentLink==="pj"&&<PjOrganization mode="documents" onImport={importMixedAuditDocuments}/>}
      {tab==="documentos"&&documentLink==="clt"&&<div className="space-y-4">
        <Card className="p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="font-semibold">Documentação do funcionário</h2><p className="mt-1 text-sm text-muted-foreground">Checklist único por categoria. Marque se o item é padrão para o funcionário e acompanhe vencimento e assinatura.</p></div>
            <label className="grid min-w-[260px] gap-1 text-sm"><span className="text-muted-foreground">Funcionário</span><select value={requirementEmployee} onChange={e=>setRequirementEmployee(e.target.value)} className="h-10 rounded-md border bg-background px-3"><option value="">Selecione o funcionário</option>{visibleEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label><DocumentAuditImport employees={employees.map(e=>({id:e.id,full_name:e.full_name,status:e.status,hire_date:e.hire_date,termination_date:e.termination_date}))} includePj onImport={importMixedAuditDocuments}/><button data-role-sensitive type="button" disabled={loading||removingImportedDocuments} onClick={()=>void removeImportedDocuments()} className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10">{removingImportedDocuments?"Excluindo importações...":"Excluir importações CLT"}</button>
          </div>
          {requirementEmployee&&<div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border px-3 py-2"><strong>{docCatalog.length}</strong> itens no catálogo</span>
            <span className="rounded-md border px-3 py-2"><strong>{docCatalog.filter(item=>(requirements.find(r=>r.employee_id===requirementEmployee&&r.catalog_id===item.id)?.is_applicable??true)).length+new Set(documents.filter(d=>d.employee_id===requirementEmployee&&d.is_custom&&d.is_standard).map(d=>normCat(d.category)+"::"+d.document_name.trim().toLowerCase())).size}</strong> padrões para este funcionário</span>
            <span className="rounded-md border px-3 py-2"><strong>{documents.filter(d=>d.employee_id===requirementEmployee&&d.signature_status==="signed").length}</strong> assinados</span>
          </div>}
        </Card>
        {!requirementEmployee?<Card className="p-10 text-center text-sm text-muted-foreground">Selecione um funcionário para visualizar o checklist de documentos, exames e treinamentos.</Card>:docCatalog.length===0?<Card className="p-8 text-center text-sm text-muted-foreground">Ainda não há itens na lista padrão. Abra o gerenciamento do catálogo abaixo para cadastrar os documentos.</Card>:<div className="space-y-3">
          {Array.from(new Set([...docCatalog.map(item=>item.category||"Diversos"),...documents.filter(d=>d.is_custom&&d.employee_id===requirementEmployee&&!docCatalog.some(c=>normCat(c.category)===normCat(d.category))).map(d=>normCat(d.category))]))
          .sort((a,b)=>{
            const order=["Pessoais","Contratação","Responsabilidades anuais","Medicina e Segurança do Trabalho","Recibos","Cartão de Ponto","Advertências","Vales avulsos, acordos diversos","Diversos"];
            const aliases=(v:string)=>v==="Documentos Pessoais"?"Pessoais":v==="Contrato"?"Contratação":v==="Responsabilidades Anuais"?"Responsabilidades anuais":v;
            return order.indexOf(aliases(a)) - order.indexOf(aliases(b));
          }).map(category=>{
            const items=docCatalog.filter(item=>(item.category||"Diversos")===category);
            const sortRecords=(a:DocRecord,b:DocRecord)=>(b.last_completed_on||b.due_date||"").localeCompare(a.last_completed_on||a.due_date||"")||a.id.localeCompare(b.id);
            const sortedDocumentRows=[
              ...items.flatMap(item=>{
                const records=documents.filter(d=>d.employee_id===requirementEmployee&&!d.is_custom&&(d.catalog_id===item.id||(!d.catalog_id&&d.document_name===item.name))).sort(sortRecords);
                return records.length?records.map(record=>({kind:"catalog" as const,item,record})): [{kind:"catalog" as const,item,record:undefined}];
              }),
              ...documents.filter(d=>d.is_custom&&d.employee_id===requirementEmployee&&normCat(d.category)===normCat(category)).sort(sortRecords).map(record=>({kind:"custom" as const,record}))
            ].sort((a,b)=>{
              const nameA=a.kind==="catalog"?a.item.name:a.record.document_name;
              const nameB=b.kind==="catalog"?b.item.name:b.record.document_name;
              return nameA.localeCompare(nameB,"pt-BR",{sensitivity:"base"})||(a.record&&b.record?sortRecords(a.record,b.record):0);
            });
            const openCustom=()=>{setEditingDoc(null);setDocForm({...emptyDoc,employee_id:requirementEmployee,document_name:""});setSelectedDocCategory(normCat(category));setSelectedCatalog(CUSTOM_DOC);setError("");setDocOpen(true);setOpenNewRecordCategory(null);};
            const categoryLabel=category==="Pessoais"?"Documentos Pessoais":category==="Contratação"?"Contrato":category==="Responsabilidades anuais"?"Responsabilidades Anuais":category;
            return <Card key={category} className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3"><div className="flex items-center gap-2"><button type="button" aria-label={collapsedDocCategories.includes(category)?"Expandir seção":"Minimizar seção"} aria-expanded={!collapsedDocCategories.includes(category)} onClick={()=>setCollapsedDocCategories(current=>current.includes(category)?current.filter(value=>value!==category):[...current,category])} className="rounded-sm p-1 hover:bg-muted" title={collapsedDocCategories.includes(category)?"Expandir seção":"Minimizar seção"}><ChevronDown className={"h-4 w-4 transition-transform "+(collapsedDocCategories.includes(category)? "-rotate-90":"")}/></button><div><h3 className="font-semibold">{categoryLabel}</h3><p className="text-xs text-muted-foreground">{sortedDocumentRows.length} item(ns)</p></div></div><div className="relative"><button data-role-sensitive type="button" aria-label={`Criar novo registro em ${categoryLabel}`} aria-expanded={openNewRecordCategory===category} onClick={()=>setOpenNewRecordCategory(current=>current===category?null:category)} className="inline-flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4"/>Criar novo registro</button>{openNewRecordCategory===category&&<div className="absolute right-0 top-full z-30 mt-1 max-h-64 min-w-[240px] overflow-y-auto rounded-md border bg-background p-1 shadow-lg">{items.length>0?items.map(item=><button key={item.id} type="button" onClick={()=>{setEditingDoc(null);setDocForm({...emptyDoc,employee_id:requirementEmployee});setSelectedDocCategory(item.category==="Documentos Pessoais"?"Pessoais":item.category==="Contrato"?"Contratação":item.category==="Responsabilidades Anuais"?"Responsabilidades anuais":item.category);setSelectedCatalog(item.id);setError("");setDocOpen(true);setOpenNewRecordCategory(null);}} className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-muted">{item.name}</button>):<p className="px-3 py-2 text-xs text-muted-foreground">Nenhum item cadastrado nesta seção.</p>}<button data-role-sensitive type="button" onClick={openCustom} className="mt-1 block w-full rounded-sm border-t px-3 py-2 text-left text-sm font-medium hover:bg-muted">Outro</button></div>}</div></div>
              {!collapsedDocCategories.includes(category)&&<>
              <div className="overflow-x-auto"><table className="w-full min-w-[1120px] table-fixed text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="w-[280px] px-5 py-3">Documento, exame ou treinamento</th><th className="w-[120px] px-5 py-3 text-center">Padrão?</th><th className="w-[200px] px-5 py-3">Data de vencimento</th><th className="w-[130px] px-5 py-3 text-center">Assinado?</th><th className="w-[250px] px-5 py-3">Observação</th><th className="w-[140px] px-5 py-3 text-center">Ação</th></tr></thead>
                <tbody className="divide-y">{sortedDocumentRows.map(row=>{
                  if(row.kind==="catalog"){
                    const item=row.item;
                    const rule=requirements.find(r=>r.employee_id===requirementEmployee&&r.catalog_id===item.id);
                    const isStandard=rule?.is_applicable??true;
                    const latest=row.record;
                    return <tr key={latest?.id??item.id} className={!isStandard?"opacity-60":""}>
                      <td className="px-5 py-4"><span className="font-medium">{item.name}</span></td>
                      <td className="px-5 py-4 text-center"><select data-role-sensitive aria-label={"Padrão para "+item.name} value={isStandard?"sim":"nao"} onChange={e=>void saveRequirement(item.id,{is_applicable:e.target.value==="sim",is_required:e.target.value==="sim"?(rule?.is_required??false):false,requires_signature:e.target.value==="sim"?(rule?.requires_signature??false):false})} className="h-9 min-w-[76px] rounded-md border bg-background px-3 text-xs"><option value="sim">Sim</option><option value="nao">Não</option></select></td>
                      <td className="px-5 py-4">{latest?.no_due_date?<span className="text-muted-foreground">Não possui vencimento</span>:latest?.due_date?dateLabel(latest.due_date):<span className="text-muted-foreground">Não informado</span>}{latest&&!latest.no_due_date&&latest.due_date&&<span className={"ml-2 text-xs "+(dueState(latest)==="Vencido"?"text-rose-600":dueState(latest)==="Próximo do vencimento"?"text-amber-600":"text-emerald-600")}>{dueState(latest)}</span>}</td>
                      <td className="px-5 py-4 text-center"><span className={latest?.signature_status==="signed"?"font-medium text-emerald-600":"text-muted-foreground"}>{latest?.signature_status==="not_applicable"?"Não se aplica":latest?.signature_status==="signed"?"Sim":"Não"}</span></td>
                      <td className="px-5 py-4"><span className="block max-w-[280px] whitespace-normal break-words text-xs text-muted-foreground">{latest?.notes||"—"}</span></td>
                      <td className="whitespace-nowrap px-5 py-4 text-center">{latest?<button data-role-sensitive onClick={()=>editDoc(latest)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Editar registro</button>:<button onClick={()=>{setEditingDoc(null);setDocForm({...emptyDoc,employee_id:requirementEmployee});setSelectedDocCategory(category);setSelectedCatalog(item.id);setDocOpen(true);}} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted"><Plus className="mr-1 inline h-3.5 w-3.5"/>Cadastrar</button>}</td>
                    </tr>;
                  }
                  const latest=row.record;
                  return <tr key={"custom-"+latest.id}>
                    <td className="px-5 py-4"><span className="font-medium">{latest.document_name}</span></td>
                    <td className="px-5 py-4 text-center"><select data-role-sensitive aria-label={"Padrão para "+latest.document_name} value={latest.is_standard?"sim":"nao"} onChange={e=>void saveCustomStandard([latest],e.target.value==="sim")} className="h-9 min-w-[76px] rounded-md border bg-background px-3 text-xs"><option value="sim">Sim</option><option value="nao">Não</option></select></td>
                    <td className="px-5 py-4">{latest.no_due_date?<span className="text-muted-foreground">Não possui vencimento</span>:latest.due_date?dateLabel(latest.due_date):<span className="text-muted-foreground">Não informado</span>}{!latest.no_due_date&&latest.due_date&&<span className={"ml-2 text-xs "+(dueState(latest)==="Vencido"?"text-rose-600":dueState(latest)==="Próximo do vencimento"?"text-amber-600":"text-emerald-600")}>{dueState(latest)}</span>}</td>
                    <td className="px-5 py-4 text-center"><span className={latest.signature_status==="signed"?"font-medium text-emerald-600":"text-muted-foreground"}>{latest.signature_status==="not_applicable"?"Não se aplica":latest.signature_status==="signed"?"Sim":"Não"}</span></td>
                    <td className="px-5 py-4"><span className="block max-w-[280px] whitespace-normal break-words text-xs text-muted-foreground">{latest.notes||"—"}</span></td>
                    <td className="whitespace-nowrap px-5 py-4 text-center"><button data-role-sensitive onClick={()=>editDoc(latest)} className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">Editar registro</button></td>
                  </tr>;
                })}</tbody>
              </table></div>
              </>}
            </Card>;
          })}
        </div>}
        <Card className="overflow-hidden">
          <button type="button" onClick={()=>setCatalogOpen(v=>!v)} aria-expanded={catalogOpen} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div><h2 className="font-semibold">Gerenciar lista padrão</h2><p className="mt-1 text-xs text-muted-foreground">{docCatalog.length} tipos cadastrados · adicione ou desative itens do checklist</p></div><ChevronDown className={"h-4 w-4 transition-transform "+(catalogOpen?"rotate-180":"")}/></button>
          {catalogOpen&&<div className="border-t p-4"><div className="flex flex-wrap gap-2"><select value={catalogCategory} onChange={e=>setCatalogCategory(e.target.value)} className="rounded-md border bg-background px-3 py-2 text-sm"><option>Pessoais</option><option>Contratação</option><option>Responsabilidades anuais</option><option>Medicina e Segurança do Trabalho</option><option>Recibos</option><option>Cartão de Ponto</option><option>Advertências</option><option>Vales avulsos, acordos diversos</option><option>Diversos</option></select><input value={catalogName} onChange={e=>setCatalogName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void saveCatalog();}} placeholder="Nome do documento, exame ou treinamento" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"/><button data-role-sensitive onClick={()=>void saveCatalog()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"><Plus className="mr-1 inline h-4 w-4"/>Adicionar item</button></div><div className="mt-3 divide-y">{docCatalog.map(item=><div key={item.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span>{item.name}<span className="ml-2 text-xs text-muted-foreground">{item.category}</span></span><button data-role-sensitive onClick={()=>void removeCatalog(item)} title="Desativar item do catálogo" className="rounded-md border p-2 text-destructive"><Trash2 className="h-4 w-4"/></button></div>)}</div></div>}
        </Card>
      </div>}
      {tab==="checklists"&&<><EmployeeAssetsAccess employees={employees} companyFilter={companyFilter}/></>}
          </main>
    {eventOpen && canManageEvents && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <Card className="max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
          <h2 className="text-xl font-bold">{editingEvent ? "Editar ocorrência" : "Nova ocorrência"}</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Funcionário<select value={eventForm.employee_id} onChange={e=>setEventForm({...eventForm,employee_id:e.target.value})} className="rounded-lg border bg-background px-3 py-2"><option value="">Selecione</option>{visibleEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Data<input type="date" value={eventForm.event_date} onChange={e=>setEventForm({...eventForm,event_date:e.target.value})} className="rounded-lg border bg-background px-3 py-2"/></label>
            <label className="grid gap-1 text-sm">Tipo<select value={eventForm.direction} onChange={e=>setEventForm({...eventForm,direction:e.target.value as LifeEvent["direction"]})} className="rounded-lg border bg-background px-3 py-2"><option value="positive">Positiva</option><option value="negative">Negativa</option><option value="neutral">Informativa (sem pontuação)</option></select></label>
            <label className="grid gap-1 text-sm">Título<input value={eventForm.title} onChange={e=>setEventForm({...eventForm,title:e.target.value})} className="rounded-lg border bg-background px-3 py-2"/></label>
            <label className="grid gap-1 text-sm sm:col-span-2">Descrição<textarea value={eventForm.description} onChange={e=>setEventForm({...eventForm,description:e.target.value})} rows={3} className="rounded-lg border bg-background px-3 py-2"/></label>
            {eventForm.direction === "positive" && (
              <div className="grid justify-items-start gap-1 text-sm sm:col-span-2">
                <span>Pontuação</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-role-sensitive
                    aria-label="Atribuir um ponto"
                    aria-pressed={eventForm.is_star}
                    onClick={() => setEventForm(current => ({ ...current, is_star: !current.is_star }))}
                    className={`rounded-md p-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${eventForm.is_star ? "text-emerald-500" : "text-muted-foreground"}`}
                  >
                    <Star className={`size-8 ${eventForm.is_star ? "fill-current" : ""}`} aria-hidden="true" />
                  </button>
                  <span>{eventForm.is_star ? "1 ponto" : "0 pontos"}</span>
                </div>
              </div>
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setEventOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button>
            <button type="button" data-role-sensitive disabled={loading} onClick={() => void saveEvent()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Salvar ocorrência</button>
          </div>
        </Card>
      </div>
    )}
    {docOpen&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-xl p-6"><h2 className="text-xl font-bold">{editingDoc?"Editar documento, exame ou treinamento":"Registrar documento, exame ou treinamento"}</h2><div className="mt-4 grid gap-3"><label className="grid gap-1 text-sm">Funcionário<select value={docForm.employee_id} onChange={e=>setDocForm({...docForm,employee_id:e.target.value})} className="rounded-lg border bg-background px-3 py-2"><option value="">Selecione</option>{visibleEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label><label className="grid gap-1 text-sm">Categoria<select required value={selectedDocCategory} onChange={e=>{setSelectedDocCategory(e.target.value);setSelectedCatalog("");}} className="rounded-lg border bg-background px-3 py-2"><option value="">Selecione a categoria</option>{["Pessoais","Contratação","Responsabilidades anuais","Medicina e Segurança do Trabalho","Recibos","Cartão de Ponto","Advertências","Vales avulsos, acordos diversos","Diversos"].map(category=><option key={category} value={category}>{category}</option>)}</select></label><label className="grid gap-1 text-sm">Documento padrão<select required value={selectedCatalog} onChange={e=>setSelectedCatalog(e.target.value)} disabled={!selectedDocCategory||!!editingDoc?.is_custom} className="rounded-lg border bg-background px-3 py-2"><option value="">{selectedDocCategory?"Selecione um documento":"Selecione primeiro a categoria"}</option>{docCatalog.filter(item=>item.category===selectedDocCategory).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}{(!editingDoc||editingDoc.is_custom)&&<option value={CUSTOM_DOC}>Outro</option>}</select>{docCatalog.length===0&&<span className="text-xs text-muted-foreground">Cadastre primeiro os documentos na lista padrão acima.</span>}{selectedDocCategory&&docCatalog.filter(item=>item.category===selectedDocCategory).length===0&&<span className="text-xs text-muted-foreground">Nenhum item cadastrado nesta categoria.</span>}</label>{selectedCatalog===CUSTOM_DOC&&<label className="grid gap-1 text-sm">Nome do documento, exame ou treinamento *<input required value={docForm.document_name} onChange={e=>setDocForm({...docForm,document_name:e.target.value})} placeholder="Digite o nome" className="rounded-lg border bg-background px-3 py-2"/><span className="text-xs text-muted-foreground">Padrão? Não — não entra na lista padrão.</span></label>}<label className="grid gap-1 text-sm">Assinado?<select value={docForm.signature_status==="signed"?"sim":"nao"} disabled={docForm.signature_status==="not_applicable"} onChange={e=>setDocForm({...docForm,signature_status:e.target.value==="sim"?"signed":"pending"})} className="rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"><option value="sim">Sim</option><option value="nao">Não</option></select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={docForm.signature_status==="not_applicable"} onChange={e=>setDocForm({...docForm,signature_status:e.target.checked?"not_applicable":"pending"})}/> Este documento não precisa de assinatura</label><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">Última realização<input type="date" value={docForm.last_completed_on} onChange={e=>setDocForm({...docForm,last_completed_on:e.target.value})} className="rounded-lg border bg-background px-3 py-2"/></label><label className="grid gap-1 text-sm">Data de vencimento<input type="date" value={docForm.due_date} disabled={docForm.no_due_date} onChange={e=>setDocForm({...docForm,due_date:e.target.value})} className="rounded-lg border bg-background px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"/></label></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={docForm.no_due_date} onChange={e=>setDocForm({...docForm,no_due_date:e.target.checked,due_date:e.target.checked?"":docForm.due_date})}/> Este documento não possui data de vencimento</label><label className="grid gap-1 text-sm">Observações<textarea value={docForm.notes} onChange={e=>setDocForm({...docForm,notes:e.target.value})} className="rounded-lg border bg-background px-3 py-2"/></label></div><div className="mt-5 flex flex-wrap items-center justify-between gap-2">{editingDoc?<button data-role-sensitive type="button" onClick={()=>void removeDoc(editingDoc)} className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10">Excluir registro</button>:<span/>}<div className="flex justify-end gap-2"><button onClick={()=>{setDocOpen(false);setEditingDoc(null);}} className="rounded-lg border px-4 py-2">Cancelar</button><button data-role-sensitive onClick={()=>void saveDoc()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">{editingDoc?"Salvar alterações":"Salvar"}</button></div></div></Card></div>}
  </div>;
}
