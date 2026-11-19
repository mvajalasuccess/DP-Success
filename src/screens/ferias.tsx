import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Palmtree, Plus, Pencil, Trash2, X, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { settlementNote, isSettlementOnly } from "@/lib/vacation-settlement";
import { ScreenBrand } from "@/components/screen-brand";

type Vacation = { id:string; employee_id:string; title:string|null; start_date:string|null; end_date:string|null; notes:string|null; completed:boolean; completed_at:string|null; created_at:string; acquisition_start_date?:string|null; acquisition_end_date?:string|null; concession_start_date?:string|null; concession_end_date?:string|null; official_gozo_start_date?:string|null; official_gozo_end_date?:string|null; termination_paid?:boolean|null; leave_type?:string|null; days_quantity?:number|string|null; entitled_days?:number|string|null; employees?:{full_name:string}|null };
type Employee = { id:string; full_name:string; status?:string|null; termination_date?:string|null; hire_date?:string|null; company_id?:string|null };
type Entitlement = { employee:Employee; acquisitionStart:string; acquisitionEnd:string; concessionStart:string; concessionEnd:string; cycle:number; status:"acquisition"|"available"|"overdue"|"scheduled"|"completed"; vacations?:Vacation[]; entitledDays?:number };
const addMonths=(iso:string,months:number)=>{const [y=0,m=1,d=1]=iso.split("-").map(Number);const target=new Date(Date.UTC(y,m-1+months,1));const last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();return new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth(),Math.min(d,last))).toISOString().slice(0,10);};
const proportionalEntitlement=(start:string,end:string)=>{if(!start||!end||end<start)return 30;let months=0;let cursor=start;while(months<12){const next=addMonths(start,months+1);if(next<=end){months++;cursor=next}else break;}const remaining=Math.floor((Date.parse(end+"T00:00:00Z")-Date.parse(cursor+"T00:00:00Z"))/86400000)+1;if(remaining>=15)months++;return Math.min(30,months*2.5);};
const entitledOf=(rows:Vacation[],fallbackStart?:string,fallbackEnd?:string)=>{const v=rows.map(r=>r.entitled_days).filter(x=>x!=null&&x!=="").map(Number).filter(Number.isFinite);if(v.length)return Math.max(...v);const period=rows.find(r=>r.acquisition_start_date&&r.acquisition_end_date);const start=period?.acquisition_start_date||fallbackStart;const end=period?.acquisition_end_date||fallbackEnd;return start&&end?proportionalEntitlement(start,end):30;};
const today = () => new Date().toISOString().slice(0,10);
const isActiveEmployee = (e:Employee|undefined) => Boolean(e && String(e.status||"").trim().toLocaleLowerCase("pt-BR") === "ativo" && !e.termination_date);
const shiftDate = (iso:string, days:number) => { const d=new Date(iso+"T12:00:00"); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); };
const addYears = (iso:string, years:number) => { const [y,m,d]=iso.split("-").map(Number); if(y===undefined||m===undefined||d===undefined)return iso; const targetYear=y+years; const last=new Date(targetYear,m,0).getDate(); return String(targetYear)+"-"+String(m).padStart(2,"0")+"-"+String(Math.min(d,last)).padStart(2,"0"); };
const makeEntitlement = (employee:Employee, cycle:number) => { const acquisitionStart=addYears(employee.hire_date!,cycle); const nextAnniversary=addYears(employee.hire_date!,cycle+1); const concessionEnd=shiftDate(addYears(employee.hire_date!,cycle+2),-1); return { employee, cycle:cycle+1, acquisitionStart, acquisitionEnd:shiftDate(nextAnniversary,-1), concessionStart:nextAnniversary, concessionEnd }; };
const dateLabel = (v:string|null|undefined) => v ? v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4) : "—";
const calendarDayCount = (a:string,b:string) => Math.max(1,Math.round((new Date(b+"T00:00:00").getTime()-new Date(a+"T00:00:00").getTime())/86400000)+1);
const dayCount = (a:string,b:string) => {
  if (b < a) return 0;
  // Blocos iniciados a partir de 21/12/2023 contam dias corridos, incluindo feriados.
  if (a >= "2023-12-21") return calendarDayCount(a,b);
  // Para blocos iniciados antes de 21/12/2023, mantém-se a regra histórica:
  // Natal (25/12) e Ano-Novo (01/01) não consomem dias do bloco.
  const start = new Date(a+"T00:00:00Z");
  const end = new Date(b+"T00:00:00Z");
  let total = 0;
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate()+1)) {
    const month = date.getUTCMonth()+1;
    const day = date.getUTCDate();
    if (!((month === 12 && day === 25) || (month === 1 && day === 1))) total++;
  }
  return total;
};
const LEAVE_LABELS:Record<string,string>={ferias:"Férias",licenca_remunerada:"Licença remunerada"};
const isVacationLeave=(p:{leave_type?:string|null})=>(p.leave_type||"ferias")==="ferias";
const parseDays=(v:string)=>{const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n:NaN;};
const fmtDays=(n:number)=>n.toLocaleString("pt-BR",{maximumFractionDigits:1});
const blockDays=(p:Vacation)=>{const q=p.days_quantity==null?null:Number(p.days_quantity);const a=p.start_date||p.official_gozo_start_date;const b=p.end_date||p.official_gozo_end_date;return q!=null&&Number.isFinite(q)?q:(a&&b?dayCount(a,b):0);};
const blockKey=(p:Vacation)=>(p.start_date||p.official_gozo_start_date)+"|"+(p.end_date||p.official_gozo_end_date)+"|"+(p.leave_type||"ferias");
const blank = {entitled_days:"",leave_type:"ferias",days_quantity:"",employee_id:"",title:"",start_date:"",end_date:"",notes:"",completed:false,acquisition_start_date:"",acquisition_end_date:"",concession_start_date:"",concession_end_date:"",official_gozo_start_date:"",official_gozo_end_date:"",termination_paid:false};

export function Ferias() {
  const [vacationLink,setVacationLink]=useState<"clt"|"pj">("clt");
  return <VacationView key={vacationLink} pj={vacationLink==="pj"} vacationLink={vacationLink} setVacationLink={setVacationLink}/>;
}
function VacationView({pj,vacationLink,setVacationLink}:{pj:boolean;vacationLink:"clt"|"pj";setVacationLink:(v:"clt"|"pj")=>void}) {
  // PJ writes are explicitly scoped to their own table. Never send a PJ identifier to vacation_periods.
  const vacationTable=pj?"pj_recesses":"vacation_periods";
  const writePayload=(payload:Record<string,any>)=>{
    if(!pj)return payload;
    const {employee_id,official_gozo_start_date,official_gozo_end_date,termination_paid,created_by,...rest}=payload;
    return employee_id===undefined?rest:{...rest,person_id:employee_id};
  };
  const entitlementOf=(rows:Vacation[],start?:string,end?:string)=>pj?(rows.find(r=>r.entitled_days!=null)?.entitled_days!=null?Number(rows.find(r=>r.entitled_days!=null)!.entitled_days):30):entitledOf(rows,start,end);

  const [periods,setPeriods]=useState<Vacation[]>([]);
  const [employees,setEmployees]=useState<Employee[]>([]);
  const [companies,setCompanies]=useState<Array<{id:string;name:string}>>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [historyYear,setHistoryYear]=useState("");
  const [historyEmployeeId,setHistoryEmployeeId]=useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | "active" | "inactive">("active");
  const [planningCollapsed,setPlanningCollapsed]=useState(false);
  const [radarCollapsed, setRadarCollapsed] = useState(false);
  
  const [radarStatusFilter,setRadarStatusFilter]=useState<"all"|"available"|"acquisition"|"overdue"|"scheduled">("all");
  const [companyFilter,setCompanyFilter]=useState("");
  const [employeeFilter,setEmployeeFilter]=useState("");
  const [modal,setModal]=useState(false);
  const [editing,setEditing]=useState<Vacation|null>(null);
  const [form,setForm]=useState(blank);
  const [extraBlocks,setExtraBlocks]=useState<Array<{start_date:string;end_date:string;leave_type:string;days_quantity:string}>>([]);
  const [blocksExpanded,setBlocksExpanded]=useState(false);
  const [editingBlockNumber,setEditingBlockNumber]=useState(1);
  const [saving,setSaving]=useState(false);
  const [completionChanged,setCompletionChanged]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState<Vacation|null>(null);

  async function loadAllRows(table: string, columns: string, order: string) {
    const rows: any[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await (supabase as any).from(table).select(columns)
        .order(order).order("id").range(offset, offset + pageSize - 1);
      if (error) return { data: null, error };
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) return { data: rows, error: null };
    }
  }

  async function load() {
    setLoading(true); setError("");
    const [v,e,co]=await Promise.all([
      loadAllRows(vacationTable, pj ? "*" : "*,employees(full_name)", "start_date"),
      loadAllRows(pj ? "pj_people" : "employees", pj ? "id,full_name,status,end_date,start_date,company_id" : "id,full_name,status,termination_date,hire_date,company_id", "full_name"),
      (supabase as any).from("companies").select("id,name").order("name"),
    ]);
    if(v.error){setError(v.error.message.includes("vacation_periods")||v.error.code==="42P01"?"A tabela de férias ainda não foi criada no banco de dados. A migração precisa ser aplicada.":v.error.message);}
    if(e.error && !v.error)setError(e.error.message);
    if(co.error && !v.error && !e.error)setError(co.error.message);
    setPeriods(pj?(v.data??[]).map((r:any)=>({...r,employee_id:r.person_id})):v.data??[]); setEmployees(pj?(e.data??[]).map((r:any)=>({...r,hire_date:r.start_date,termination_date:r.end_date})):e.data??[]); setCompanies(co.data??[]); setLoading(false);
  }
  useEffect(()=>{void load()},[]);

  const activeEmployees=useMemo(()=>employees.filter(isActiveEmployee),[employees]);
  const activeEmployeeIds=useMemo(()=>new Set(activeEmployees.map(e=>e.id)),[activeEmployees]);
  const currentDate = today();
  const startOf = (p: Vacation) => isSettlementOnly(p) ? "" : p.start_date || p.official_gozo_start_date || "";
  const endOf = (p: Vacation) => isSettlementOnly(p) ? "" : p.end_date || p.official_gozo_end_date || "";
  const hasStarted = (p: Vacation) => Boolean(startOf(p) && endOf(p) && startOf(p) <= currentDate);
  const hasEnded = (p: Vacation) => hasStarted(p) && endOf(p) <= currentDate;
  const confirmedLeave = (p: Vacation) => p.completed && hasEnded(p);
  const groupByAcquisition = (rows: Vacation[]) => {
    const groups = new Map<string, Vacation[]>();
    for (const row of rows) {
      const key = row.acquisition_start_date
        ? row.employee_id + "::" + row.acquisition_start_date
        : row.employee_id + "::sem-periodo::" + (row.title || row.id);
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    return [...groups.entries()].map(([key, blocks]) => ({
      key,
      blocks: blocks.sort((a, b) => startOf(a).localeCompare(startOf(b))),
    }));
  };
  const companyPeriods = periods.filter(p => {
    const employee = employees.find(e => e.id === p.employee_id);
    if (companyFilter && employee?.company_id !== companyFilter) return false;
    if (historyStatus === "all") return true;
    return Boolean(employee) && (historyStatus === "active") === activeEmployeeIds.has(p.employee_id);
  });
  const isPaidSettlement = (p: Vacation) => Boolean(p.termination_paid);
  const hasLeaveDates = (p: Vacation) => !isSettlementOnly(p) && Boolean(startOf(p) && endOf(p)) &&
    (!isPaidSettlement(p) || Boolean(p.official_gozo_start_date && p.official_gozo_end_date));
  const historyPeriods = companyPeriods.filter(p => !isSettlementOnly(p) || isPaidSettlement(p));
  const historyYears = new Set<string>();
  historyPeriods.filter(p => isVacationLeave(p) && hasLeaveDates(p)).forEach(p => {
    const lastDate = endOf(p);
    for (let year = Number(startOf(p).slice(0, 4)); year <= Number(lastDate.slice(0, 4)); year++) {
      historyYears.add(String(year));
    }
  });
  const yearOptions = [...historyYears].sort((a, b) => b.localeCompare(a));
  const selectedHistoryYear = historyYears.has(historyYear) ? historyYear : "";
  const visibleHistory = historyPeriods.filter(p => {
    if (historyEmployeeId && p.employee_id !== historyEmployeeId) return false;
    return !selectedHistoryYear || (isVacationLeave(p) && hasLeaveDates(p) &&
      startOf(p) <= selectedHistoryYear + "-12-31" && endOf(p) >= selectedHistoryYear + "-01-01");
  });
  const matchingHistoryIds = new Set(visibleHistory.map(p => p.id));
  const historyGroups = groupByAcquisition(historyPeriods)
    .filter(({ blocks }) => blocks.some(p => matchingHistoryIds.has(p.id)));
  const historyEmployeeOptions = employees.filter(e => historyPeriods.some(p => p.employee_id === e.id));
  const historyEmployeeCount = new Set(visibleHistory.map(p => p.employee_id)).size;

  function openNew(){setEditing(null);setCompletionChanged(false);setEditingBlockNumber(1);setForm({...blank});setExtraBlocks([]);setBlocksExpanded(false);setModal(true);setError("")}
  function openEdit(p:Vacation){const siblings=periods.filter(item=>item.employee_id===p.employee_id&&item.acquisition_start_date===p.acquisition_start_date).sort((a,b)=>(a.start_date||a.official_gozo_start_date||"").localeCompare(b.start_date||b.official_gozo_start_date||""));setEditing(p);setCompletionChanged(false);setEditingBlockNumber(Math.max(1,siblings.findIndex(item=>item.id===p.id)+1));setForm({entitled_days:(()=>{const v=siblings.map(x=>x.entitled_days).filter(x=>x!=null);return v.length?String(Math.max(...v.map(Number))).replace(".",","):""})(),leave_type:p.leave_type||"ferias",days_quantity:p.days_quantity==null?"":String(p.days_quantity).replace(".",","),employee_id:p.employee_id,title:p.title||"",start_date:p.start_date||p.official_gozo_start_date||"",end_date:p.end_date||p.official_gozo_end_date||"",notes:p.notes||"",completed:p.completed,acquisition_start_date:p.acquisition_start_date||"",acquisition_end_date:p.acquisition_end_date||"",concession_start_date:p.concession_start_date||"",concession_end_date:p.concession_end_date||"",official_gozo_start_date:p.official_gozo_start_date||"",official_gozo_end_date:p.official_gozo_end_date||"",termination_paid:Boolean(p.termination_paid)});setExtraBlocks([]);setBlocksExpanded(true);setModal(true);setError("")}
  async function save(){
    if(!form.employee_id){setError("Selecione o funcionário.");return}
    if(!isActiveEmployee(employees.find(e=>e.id===form.employee_id))){setError("Só é possível cadastrar ou editar férias de funcionários ativos.");return}
    if(Boolean(form.start_date)!==Boolean(form.end_date)){setError("Preencha o início e o fim do primeiro bloco de afastamento, ou deixe ambos vazios se estiver adicionando outros blocos.");return}
    if(form.start_date&&form.end_date&&form.end_date<form.start_date){setError("A data final do primeiro bloco não pode ser anterior à inicial.");return}
    if(extraBlocks.some(b=>Boolean(b.start_date)!==Boolean(b.end_date))){setError("Preencha as duas datas de cada bloco adicional ou remova esse bloco.");return}
    if(extraBlocks.some(b=>b.start_date&&b.end_date&&b.end_date<b.start_date)){setError("Em cada bloco adicional, a data final deve ser igual ou posterior à inicial.");return}
    for(const b of [{...form,label:"primeiro bloco"},...extraBlocks.map((b,i)=>({...b,label:"bloco "+(i+2)}))]){if(!b.days_quantity.trim())continue;const q=parseDays(b.days_quantity);if(!(q>0)||Math.round(q*2)!==q*2){setError("Quantidade de dias inválida no "+b.label+": use múltiplos de meio dia (ex.: 12,5).");return}if(b.start_date&&b.end_date&&q>dayCount(b.start_date,b.end_date)){setError("A quantidade de dias do "+b.label+" é maior que o intervalo de datas.");return}}
    if(form.entitled_days.trim()){const q=parseDays(form.entitled_days);if(!(q>=0&&(pj||q<=30))||Math.round(q*2)!==q*2){setError(pj?"Informe um saldo contratual não negativo, em múltiplos de meio dia.":"Direito adquirido inválido: informe de 0 a 30 dias, em múltiplos de meio dia (ex.: 12,5).");return}}
    if(employees.find(e=>e.id===form.employee_id)?.hire_date&&(!form.acquisition_start_date||!form.acquisition_end_date)){setError("Preencha o início e o fim do período aquisitivo.");return}
    if(form.acquisition_start_date&&form.acquisition_end_date&&form.acquisition_end_date<form.acquisition_start_date){setError("O fim do período aquisitivo não pode ser anterior ao início.");return}
    const concessionStart=form.acquisition_end_date?shiftDate(form.acquisition_end_date,1):"";
    const concessionEnd=concessionStart?shiftDate(addYears(concessionStart,1),-1):"";
    setSaving(true);setError("");
    const hasInformationalBlock=Boolean(form.start_date&&form.end_date);
    const payload={employee_id:form.employee_id,title:((!form.title||form.title.startsWith("Período aquisitivo ·")||/^Férias\\s*[·-]\\s*período aquisitivo/i.test(form.title))&&form.acquisition_start_date&&form.acquisition_end_date?"Período aquisitivo · "+dateLabel(form.acquisition_start_date)+" a "+dateLabel(form.acquisition_end_date):(form.title.trim()||null)),start_date:hasInformationalBlock?form.start_date:null,end_date:hasInformationalBlock?form.end_date:null,notes:form.notes.trim()||null,leave_type:form.leave_type,days_quantity:form.days_quantity.trim()?parseDays(form.days_quantity):null,entitled_days:form.entitled_days.trim()?parseDays(form.entitled_days):null,completed:form.completed,completed_at:form.completed?(editing?.completed_at||new Date().toISOString()):null,acquisition_start_date:form.acquisition_start_date||null,acquisition_end_date:form.acquisition_end_date||null,concession_start_date:concessionStart||null,concession_end_date:concessionEnd||null,official_gozo_start_date:hasInformationalBlock?form.start_date:null,official_gozo_end_date:hasInformationalBlock?form.end_date:null};
    const result=editing
      ?await(supabase as any).from(vacationTable).update(writePayload(payload)).eq("id",editing.id).select("id").maybeSingle()
      :await(supabase as any).from(vacationTable).insert(writePayload({...payload,created_by:(await supabase.auth.getSession()).data.session?.user.id||null})).select("id").maybeSingle();
    if(result.error){setError("Não foi possível salvar o período: "+result.error.message);setSaving(false);return}
    if(!result.data?.id){setError("Nenhum registro foi atualizado. Atualize a tela e tente novamente; seus dados não foram alterados.");setSaving(false);return}
    if(extraBlocks.length){
      const sharedPayload={entitled_days:form.entitled_days.trim()?parseDays(form.entitled_days):null,employee_id:form.employee_id,title:payload.title,notes:form.notes.trim()||null,completed:form.completed,completed_at:form.completed?(editing?.completed_at||new Date().toISOString()):null,acquisition_start_date:form.acquisition_start_date||null,acquisition_end_date:form.acquisition_end_date||null,concession_start_date:pj?(concessionStart||null):(form.concession_start_date||null),concession_end_date:pj?(concessionEnd||null):(form.concession_end_date||null),official_gozo_start_date:null,official_gozo_end_date:null,termination_paid:Boolean(form.termination_paid)};
      const sessionUserId=(await supabase.auth.getSession()).data.session?.user.id||null;
      const {error:blocksError}=await(supabase as any).from(vacationTable).insert(extraBlocks.map(b=>writePayload({...sharedPayload,start_date:b.start_date,end_date:b.end_date,official_gozo_start_date:b.start_date,official_gozo_end_date:b.end_date,leave_type:b.leave_type,days_quantity:b.days_quantity.trim()?parseDays(b.days_quantity):null,created_by:sessionUserId})));
      if(blocksError){setError("O período principal foi salvo, mas houve erro ao adicionar os novos blocos: "+blocksError.message);setSaving(false);await load();return}
    }
    // Mantém apenas os metadados aquisitivos iguais entre os blocos. As datas de gozo são individuais.
    if(form.acquisition_start_date){
      const siblingIds=[...new Set(periods.filter(p=>p.employee_id===form.employee_id&&p.id!==editing?.id&&(
        p.acquisition_start_date===form.acquisition_start_date||
        (editing?.acquisition_start_date&&p.employee_id===editing.employee_id&&p.acquisition_start_date===editing.acquisition_start_date)
      )).map(p=>p.id))];
      if(siblingIds.length){
        const siblingUpdate:any={
          acquisition_start_date:form.acquisition_start_date,
          entitled_days:form.entitled_days.trim()?parseDays(form.entitled_days):null,
          notes:form.notes.trim()||null,
          acquisition_end_date:form.acquisition_end_date||null,
          concession_start_date:concessionStart||null,
          concession_end_date:concessionEnd||null,
        };
        // Alterar somente as datas não reabre nem conclui os outros blocos.
        // A conclusão de todo o período só é propagada quando o usuário altera a caixa explicitamente.
        if(completionChanged){
          siblingUpdate.completed=form.completed;
          siblingUpdate.completed_at=form.completed?(editing?.completed_at||new Date().toISOString()):null;
        }
        const {error:syncError}=await(supabase as any).from(vacationTable).update(writePayload(siblingUpdate)).in("id",siblingIds);
        if(syncError){setError("O bloco foi salvo, mas não foi possível sincronizar os dados do período: "+syncError.message);setSaving(false);await load();return}
      }
    }
    setSaving(false);setModal(false);await load();
  }
  async function markTerminationPaid(entitlement:Entitlement){
    if(pj)return;
    setError("");
    const related=periods.filter(p=>p.employee_id===entitlement.employee.id&&p.acquisition_start_date===entitlement.acquisitionStart);
    if(related.some(p=>p.termination_paid)){
      const ids=related.map(p=>p.id);
      const {error:e}=await(supabase as any).from(vacationTable).update({termination_paid:false}).in("id",ids);
      if(e){setError(e.message);return}
      await load();
      return;
    }
    if(related.length){
      const {error:e}=await(supabase as any).from(vacationTable).update({termination_paid:true}).in("id",related.map(p=>p.id));
      if(e){setError(e.message);return}
      await load();
      return;
    }
    const sessionUserId=(await supabase.auth.getSession()).data.session?.user.id||null;
    const {error:e}=await(supabase as any).from(vacationTable).insert({
      employee_id:entitlement.employee.id,
      title:"Pago em rescisão · período aquisitivo "+dateLabel(entitlement.acquisitionStart)+" a "+dateLabel(entitlement.acquisitionEnd),
      start_date:null,
      end_date:null,
      notes:settlementNote,
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
    setError("");
    const {data,error:e}=await(supabase as any).from(vacationTable).delete().eq("id",confirmDelete.id).select("id").maybeSingle();
    if(e||!data){setError(e?.message||"O registro não foi excluído. Verifique sua permissão e tente novamente.");return;}
    setConfirmDelete(null);await load();
  }
  const entitlements=useMemo<Entitlement[]>(()=>{
    const current=today();
    return activeEmployees.filter(e=>e.hire_date).flatMap(employee=>{
      const cycles:Entitlement[]=[];
      for(let n=0;n<60;n++){
        const generated=makeEntitlement(employee,n);
        if(generated.acquisitionStart>current) break;
        // Períodos editados no Planejamento também são a referência do Radar.
        const savedPeriod=periods.find(p=>
          p.employee_id===employee.id&&p.acquisition_start_date&&p.acquisition_end_date&&
          p.acquisition_start_date<=generated.acquisitionEnd&&p.acquisition_end_date>=generated.acquisitionStart
        );
        const raw=savedPeriod?{
          ...generated,
          acquisitionStart:savedPeriod.acquisition_start_date!,
          acquisitionEnd:savedPeriod.acquisition_end_date!,
          concessionStart:savedPeriod.concession_start_date||shiftDate(savedPeriod.acquisition_end_date!,1),
          concessionEnd:savedPeriod.concession_end_date||shiftDate(addYears(savedPeriod.concession_start_date||shiftDate(savedPeriod.acquisition_end_date!,1),1),-1),
        }:generated;
        const vacations=periods.filter(p=>p.employee_id===employee.id&&p.acquisition_start_date===raw.acquisitionStart);
        const uniqueOfficialBlocks=[...new Map(vacations.filter(isVacationLeave).filter(p=>startOf(p)&&endOf(p)).map(p=>[blockKey(p),p])).values()];
        const officialDays=uniqueOfficialBlocks.reduce((sum,p)=>sum+blockDays(p),0);
        const hasOfficialBlocks=uniqueOfficialBlocks.length>0;
        const terminationPaid=vacations.some(p=>p.termination_paid);
        const entitledDays=entitlementOf(vacations,raw.acquisitionStart,raw.acquisitionEnd);
        const status:Entitlement["status"]=terminationPaid||(officialDays>=entitledDays&&uniqueOfficialBlocks.every(confirmedLeave))||(pj&&vacations.length>0&&vacations.every(p=>p.completed&&(!startOf(p)||hasEnded(p))))?"completed":hasOfficialBlocks?"scheduled":current<raw.concessionStart?"acquisition":current<=raw.concessionEnd?"available":"overdue";
        cycles.push({...raw,status,vacations,entitledDays});
      }
      return cycles;
    }).filter(e=>(!companyFilter||e.employee.company_id===companyFilter)&&(!employeeFilter||e.employee.id===employeeFilter)).sort((a,b)=>a.concessionEnd.localeCompare(b.concessionEnd));
  },[activeEmployees,periods,companyFilter,employeeFilter]);
  const radarStatus = {
    overdue: { label: "Prazo vencido", tone: "bg-red-100 text-red-800" },
    available: { label: "Direito adquirido", tone: "bg-emerald-100 text-emerald-800" },
    acquisition: { label: "Em aquisição", tone: "bg-amber-100 text-amber-900" },
    scheduled: { label: pj ? "Recessos programados" : "Férias programadas", tone: "bg-sky-100 text-sky-800" },
  };
  type RadarStatus = keyof typeof radarStatus;
  const cardStatuses: RadarStatus[] = ["overdue", "available", "acquisition", "scheduled"];
  const priority: Record<RadarStatus, number> = { overdue: 0, available: 1, scheduled: 2, acquisition: 3 };
  const radarPeriods = entitlements.filter(
    (period): period is Entitlement & { status: RadarStatus } =>
      period.status !== "completed"
  );
  const staffByStatus = Object.fromEntries(cardStatuses.map(status => [
    status, new Set(radarPeriods.filter(period => period.status === status).map(period => period.employee.id)).size,
  ]));
  const orderedRadarPeriods = radarPeriods.filter(period => radarStatusFilter === "all" || period.status === radarStatusFilter)
    .sort((a, b) => priority[a.status] - priority[b.status] || a.concessionEnd.localeCompare(b.concessionEnd));
  const radarPeople = new Map<string, typeof orderedRadarPeriods>();
  for (const period of orderedRadarPeriods) {
    const personPeriods = radarPeople.get(period.employee.id) ?? [];
    personPeriods.push(period);
    radarPeople.set(period.employee.id, personPeriods);
  }
  const radarSituation = (period: (typeof radarPeriods)[number]) => {
    if (period.status === "overdue") {
      const daysLate = Math.round((Date.parse(currentDate) - Date.parse(period.concessionEnd)) / 86400000);
      return `Prazo vencido há ${daysLate} ${daysLate === 1 ? "dia" : "dias"}`;
    }
    if (period.status === "available") {
      const daysLeft = Math.round((Date.parse(period.concessionEnd) - Date.parse(currentDate)) / 86400000);
      if (daysLeft === 0) return "Vence hoje";
      if (daysLeft <= 30) return `Vence em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`;
    }
    if (period.status === "scheduled") {
      const nextStart = (period.vacations ?? []).map(startOf).filter(date => date && date >= currentDate).sort()[0];
      if (nextStart) return `Programadas para ${dateLabel(nextStart)}`;
    }
    return radarStatus[period.status].label;
  };
  const employeeName=(p:Vacation)=>p.employees?.full_name||employees.find(e=>e.id===p.employee_id)?.full_name||"Funcionário não encontrado";

  return <div className="dp-screen min-h-screen bg-background">
    <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4"><a href="/" className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="h-4 w-4" />Voltar</a><ScreenBrand name={pj?"Recessos PJ":"Férias"} /></div></header>
    <main className="mx-auto max-w-[1450px] px-4 pb-10 pt-6 sm:px-7 sm:pt-8">
      <div className="mb-4 flex gap-2"><button className={"rounded-sm border px-4 py-2 text-sm "+(vacationLink==="clt"?"bg-primary text-primary-foreground":"")} onClick={()=>setVacationLink("clt")}>Férias CLT</button><button className={"rounded-sm border px-4 py-2 text-sm "+(vacationLink==="pj"?"bg-primary text-primary-foreground":"")} onClick={()=>setVacationLink("pj")}>Recessos PJ</button></div>
      <>
      <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-10 -top-20 -z-10 h-56 w-56 rounded-full bg-[#06CAA0]/20 blur-3xl"/>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-sm border border-white/15 bg-white/10"><Palmtree className="h-6 w-6 text-[#7cebd0]"/></div><div><h1 style={{color:"#fff",WebkitTextFillColor:"#fff"}} className="!text-white text-3xl font-semibold tracking-tight sm:text-4xl">{pj?"Recessos PJ":"Férias"}</h1><p className="mt-2 max-w-2xl text-sm text-slate-200">Organize os períodos, acompanhe o planejamento e marque cada etapa como concluída.</p></div></div>
          <button data-role-sensitive type="button" onClick={openNew} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-sm bg-[#06CAA0] px-4 py-2.5 text-sm font-semibold text-[#082f2b] shadow-sm transition hover:bg-[#39dfb9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"><Plus className="h-4 w-4"/> Adicionar período</button>
        </div>
      </section>

      <section aria-label="Filtrar Radar por situação" className="mt-6 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {cardStatuses.map(status => (
          <button key={status} type="button" aria-pressed={radarStatusFilter === status} aria-controls="vacation-radar-results" onClick={() => { setRadarCollapsed(false); setRadarStatusFilter(current => current === status ? "all" : status); }} className={`rounded-md border bg-card p-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 sm:p-4 ${radarStatusFilter === status ? "ring-2 ring-emerald-500" : ""}`}>
            <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${radarStatus[status].tone}`}>{radarStatus[status].label}</span>
            <span className="mt-2 block text-2xl font-semibold">{staffByStatus[status]}</span>
            <span className="text-xs text-muted-foreground">{pj ? "prestadores" : "funcionários"}</span>
          </button>
        ))}
      </section>
<section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
<div className="flex items-start justify-between gap-4 border-b p-4 sm:items-center sm:p-5">
    <div className="min-w-0"><h2 className="font-display text-lg font-semibold">{pj?"Radar de Recessos":"Radar de Férias"}</h2><p className="mt-1 text-sm text-muted-foreground">Os períodos do Radar são calculados a partir da admissão. A lista também mostra os blocos que já foram registrados.</p></div>
    <button type="button" onClick={() => setRadarCollapsed(value => !value)} aria-expanded={!radarCollapsed} aria-controls="vacation-radar-content" aria-label={radarCollapsed ? "Expandir Radar" : "Recolher Radar"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
      {radarCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
    </button>
  </div>
  <div id="vacation-radar-content" hidden={radarCollapsed}>
    <div className="grid grid-cols-1 gap-3 border-b p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3"><select aria-label="Filtrar por empresa" value={companyFilter} onChange={e=>{setCompanyFilter(e.target.value);setEmployeeFilter("");setHistoryEmployeeId("");}} className="h-10 w-full min-w-0 rounded-sm border bg-background px-3 text-sm"><option value="">Todas as empresas</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Filtrar por funcionário" value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)} className="h-10 w-full min-w-0 rounded-sm border bg-background px-3 text-sm"><option value="">{pj?"Todos os prestadores":"Todos os funcionários"}</option>{activeEmployees.filter(e=>!companyFilter||e.company_id===companyFilter).map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select><select aria-label="Filtrar Radar de Férias por situação" value={radarStatusFilter} onChange={e=>setRadarStatusFilter(e.target.value as "all"|"available"|"acquisition"|"overdue"|"scheduled")} className="h-10 w-full rounded-sm border bg-background px-3 text-sm sm:w-auto"><option value="all">Todas as situações</option><option value="available">Direito adquirido</option><option value="acquisition">Em aquisição</option><option value="overdue">Prazo concessivo vencido</option><option value="scheduled">{pj?"Recessos programados":"Férias programadas"}</option></select></div>
<div id="vacation-radar-results">
  <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5">
    <p aria-live="polite" className="text-sm text-muted-foreground">{radarPeople.size} {pj ? "prestador(es)" : "funcionário(s)"}</p>
    <button type="button" aria-pressed={radarStatusFilter === "all"} onClick={() => setRadarStatusFilter("all")} className={`rounded-md border px-3 py-1.5 text-sm ${radarStatusFilter === "all" ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}>Todos</button>
  </div>
  {loading ? <p className="p-8 text-center text-sm text-muted-foreground">Carregando Radar...</p> : radarPeople.size === 0 ? (
    <p className="p-8 text-center text-sm text-muted-foreground">Nenhum período encontrado para os filtros atuais.</p>
  ) : <>
    <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem] gap-3 bg-muted/50 px-4 py-2 text-xs font-semibold text-muted-foreground sm:grid sm:px-5">
      <span>{pj ? "Prestador" : "Funcionário"}</span><span>Situação</span><span className="text-right">Períodos</span>
    </div>
    <div className="divide-y">
      {[...radarPeople.entries()].map(([id, personPeriods]) => {
        const first = personPeriods[0]!;
        return <details key={id} className="group">
          <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_8rem] sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="break-words text-sm font-semibold">{first.employee.full_name}</span>
            <span className="col-start-1 row-start-2 sm:col-start-2 sm:row-start-1"><span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${radarStatus[first.status].tone}`}>{radarSituation(first)}</span></span>
            <span className="col-start-2 row-start-1 flex items-center justify-end gap-2 whitespace-nowrap text-xs text-muted-foreground sm:col-start-3">
              {personPeriods.length} {personPeriods.length === 1 ? "período" : "períodos"}
              <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
            </span>
          </summary>
          <div className="divide-y border-t bg-muted/20 sm:pl-5">
            {personPeriods.map(e => (<article key={e.acquisitionStart} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Período aquisitivo</h3>{!e.vacations?.length&&<span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">Sem registro</span>}<span className={"rounded-full px-2.5 py-1 text-[11px] font-semibold "+(e.status==="overdue"?"bg-red-100 text-red-800":e.status==="available"||e.status==="completed"?"bg-emerald-100 text-emerald-800":e.status==="scheduled"?"bg-sky-100 text-sky-800":"bg-amber-100 text-amber-800")}>{e.status==="completed"?"Concluído":e.status==="overdue"?"Prazo vencido":e.status==="available"?"Direito adquirido":e.status==="scheduled"?(pj?"Recessos programados":"Férias programadas"):"Em aquisição"}</span></div><p className="mt-1 text-sm text-muted-foreground">Aquisitivo: {dateLabel(e.acquisitionStart)} a {dateLabel(e.acquisitionEnd)}</p><p className="text-sm text-muted-foreground">Concessivo: {dateLabel(e.concessionStart)} a {dateLabel(e.concessionEnd)}</p>{(()=>{const unique=[...new Map((e.vacations||[]).filter(isVacationLeave).filter(p=>startOf(p)&&endOf(p)).map(p=>[blockKey(p),p])).values()];const days=unique.reduce((sum,p)=>sum+blockDays(p),0);return <p className="mt-1 text-xs text-muted-foreground">Direito adquirido: {fmtDays(e.entitledDays??30)} dias · Registrados: {fmtDays(days)} em {unique.length} bloco(s) · Saldo: {fmtDays(Math.max(0,(e.entitledDays??30)-days))} dias</p>})()}{(e.vacations ?? []).filter(p => startOf(p) && endOf(p)).length > 0 && (
  <ul aria-label="Blocos registrados" className="mt-2 space-y-1 border-l-2 border-emerald-200 pl-3 text-xs text-muted-foreground">
    {(e.vacations ?? []).filter(p => startOf(p) && endOf(p)).map(p => (
      <li key={p.id}>{dateLabel(startOf(p))} a {dateLabel(endOf(p))} · {fmtDays(blockDays(p))} dias{p.completed ? " · Concluído" : ""}</li>
    ))}
  </ul>
)}{e.status==="available"&&<p className="mt-1 text-xs font-medium text-emerald-700">Aviso para o RH: este funcionário já pode sair de férias.</p>}{e.status==="overdue"&&<p className="mt-1 text-xs font-medium text-red-700">Atenção: o prazo concessivo calculado já terminou.</p>}</div><div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">{e.status!=="completed"&&<button data-role-sensitive type="button" onClick={()=>{openNew();setForm(f=>({...f,employee_id:e.employee.id,acquisition_start_date:e.acquisitionStart,acquisition_end_date:e.acquisitionEnd,concession_start_date:e.concessionStart,concession_end_date:e.concessionEnd,...(pj?{entitled_days:String(e.entitledDays??30).replace(".",",")} : {}),title:(pj?"Recesso · período aquisitivo ":"Férias · período aquisitivo ")+dateLabel(e.acquisitionStart)+" a "+dateLabel(e.acquisitionEnd)}));}} className="rounded-sm bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">{e.status==="scheduled"?"Adicionar bloco":pj?"Programar recesso":"Programar férias"}</button>}{!pj&&(e.vacations?.some(p=>p.termination_paid)||e.status!=="completed")&&<button data-role-sensitive type="button" onClick={()=>void markTerminationPaid(e)} className="rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100">{e.vacations?.some(p=>p.termination_paid)?"Desfazer":"Pago em rescisão"}</button>}</div></article>))}
          </div>
        </details>;
      })}
    </div>
  </>}
</div>
  </div>
</section>
<section className="mt-6 overflow-hidden rounded-sm border bg-card shadow-sm">
        <div className="flex items-start justify-between gap-4 border-b p-4 sm:items-center sm:p-5">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold">
              {pj ? "Histórico de Recessos" : "Histórico de Férias"}
            </h2>
            <p className="text-xs text-muted-foreground">{historyGroups.length} período(s)</p>
          </div>
          <button type="button" onClick={() => setPlanningCollapsed(value => !value)} aria-expanded={!planningCollapsed} aria-controls="vacation-planning-content" aria-label={planningCollapsed ? "Expandir registros" : "Recolher registros"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
            {planningCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
        {!planningCollapsed&&<div id="vacation-planning-content">
        {error&&!modal&&<div role="alert" className="m-4 flex items-start gap-2 rounded-sm border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/><span>{error}</span></div>}
        <div className="flex flex-wrap items-end gap-4 border-b p-4 sm:p-5">
            <label className="grid w-full min-w-0 gap-2 text-sm font-medium sm:w-auto sm:min-w-36 sm:max-w-72">
              Situação
              <select value={historyStatus} onChange={event => { setHistoryStatus(event.target.value as typeof historyStatus); setHistoryEmployeeId(""); }} className="h-10 w-full min-w-0 rounded-sm border bg-background px-3 text-sm">
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </label>
            <label className="grid w-full min-w-0 gap-2 text-sm font-medium sm:w-auto sm:min-w-36 sm:max-w-72">
              {pj ? "Ano do recesso" : "Ano de gozo"}
              <select value={selectedHistoryYear} onChange={event => setHistoryYear(event.target.value)} className="h-10 w-full min-w-0 rounded-sm border bg-background px-3 text-sm">
                <option value="">Todos</option>
                {yearOptions.map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="grid w-full min-w-0 gap-2 text-sm font-medium sm:w-auto sm:min-w-36 sm:max-w-72">
              {pj ? "Prestador" : "Funcionário"}
              <select value={historyEmployeeOptions.some(e => e.id === historyEmployeeId) ? historyEmployeeId : ""} onChange={event => setHistoryEmployeeId(event.target.value)} className="h-10 w-full min-w-0 rounded-sm border bg-background px-3 text-sm">
                <option value="">{pj ? "Todos os prestadores" : "Todos os funcionários"}</option>
                {historyEmployeeOptions.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </label>
        </div>
        {loading ? <div className="p-12 text-center text-sm text-muted-foreground">Carregando períodos...</div> : (
          <div className="space-y-3 p-4 sm:p-5">
            <p aria-live="polite" className="text-sm text-muted-foreground">{historyEmployeeCount} {pj ? "prestador(es) com registros" : "funcionário(s) com registros"}</p>
            {historyGroups.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro encontrado para os filtros atuais.</p>}
            {historyGroups.sort((a, b) => employeeName(a.blocks[0]!).localeCompare(employeeName(b.blocks[0]!), "pt-BR") ||
              (b.blocks[0]?.acquisition_start_date ?? "").localeCompare(a.blocks[0]?.acquisition_start_date ?? "")).map(({ key, blocks }) => {
              const period = blocks[0]!;
              const paidSettlement = blocks.some(isPaidSettlement);
              const leaveBlocks = blocks.filter(p => hasLeaveDates(p) || (!isSettlementOnly(p) && !isPaidSettlement(p)));
              const vacationBlocks = [...new Map(leaveBlocks.filter(p => hasLeaveDates(p) && isVacationLeave(p)).map(p => [blockKey(p), p])).values()];
              const registeredDays = vacationBlocks.reduce((sum, p) => sum + blockDays(p), 0);
              const entitledDays = entitlementOf(blocks, period.acquisition_start_date ?? undefined, period.acquisition_end_date ?? undefined);
              const leaveStatus = (p: Vacation) => !hasLeaveDates(p) ? "Em aberto · sem datas" :
                startOf(p) > currentDate ? "Programado" :
                confirmedLeave(p) ? "Concluído" :
                hasEnded(p) ? "Aguardando confirmação" : "Em andamento";
              const periodHeading = (
                <span className="min-w-0 break-words">
                  <span className="block font-medium">{employeeName(period)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {period.acquisition_start_date ? `Aquisitivo: ${dateLabel(period.acquisition_start_date)} a ${dateLabel(period.acquisition_end_date)}` : "Período aquisitivo não informado"}
                  </span>
                  {period.concession_start_date && period.concession_end_date && (
                    <span className="block text-xs text-muted-foreground">Concessivo: {dateLabel(period.concession_start_date)} a {dateLabel(period.concession_end_date)}</span>
                  )}
                </span>
              );
              const settlementBadge = paidSettlement && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">Pago em rescisão</span>
              );
              if (leaveBlocks.length === 0) {
                return <article key={key} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-4 py-3">
                  {periodHeading}
                  {settlementBadge}
                </article>;
              }
              return <details key={key} className="group rounded-md border bg-background">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  {periodHeading}
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {settlementBadge}
                    {leaveBlocks.length} bloco(s)
                    <ChevronDown aria-hidden="true" className="h-4 w-4 group-open:rotate-180" />
                  </span>
                </summary>
                {!paidSettlement && period.acquisition_start_date && (
                  <p className="border-t px-4 py-3 text-xs text-muted-foreground">
                    Direito: {fmtDays(entitledDays)} dias · Dias registrados: {fmtDays(registeredDays)} · Saldo a programar: {fmtDays(Math.max(0, entitledDays - registeredDays))} dias
                  </p>
                )}
                <ul className="divide-y border-t">
                  {leaveBlocks.map(p => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{isVacationLeave(p) ? (pj ? "Recesso" : "Férias") : (LEAVE_LABELS[p.leave_type || ""] || p.leave_type)}</p>
                        <p className="text-muted-foreground">
                          {hasLeaveDates(p) && `${dateLabel(startOf(p))} a ${dateLabel(endOf(p))} · ${fmtDays(blockDays(p))} ${blockDays(p) === 1 ? "dia" : "dias"} · `}
                          {leaveStatus(p)}
                        </p>
                        {p.notes && <p className="whitespace-pre-wrap text-muted-foreground">{p.notes}</p>}
                      </div>
                      <div className="flex gap-2">
                        {activeEmployeeIds.has(p.employee_id) && !isSettlementOnly(p) && <button data-role-sensitive type="button" onClick={() => openEdit(p)} aria-label="Editar bloco de afastamento" className="flex h-9 w-9 items-center justify-center rounded-sm border hover:bg-muted"><Pencil className="h-4 w-4" /></button>}
                        <button data-role-sensitive type="button" onClick={() => setConfirmDelete(p)} aria-label="Excluir bloco de afastamento" className="flex h-9 w-9 items-center justify-center rounded-sm border border-red-200 text-red-700 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>;
            })}
          </div>
        )}
        </div>}
      </section>
      <p className="mt-4 text-xs text-muted-foreground">Esta tela é um controle de planejamento. Ela não altera fechamento de ponto, banco de horas, folha ou cálculos históricos.</p>
      </>
    </main>

    {modal&&<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/55 p-3 sm:p-6" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><section role="dialog" aria-modal="true" aria-labelledby="vacation-modal-title" className="my-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-sm border bg-card shadow-2xl"><div className="flex items-start justify-between gap-4 border-b px-4 py-5 sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-widest text-emerald-700">Planejamento de pessoas</p><h2 id="vacation-modal-title" className="mt-1 font-display text-xl font-semibold">{editing?"Editar bloco de afastamento":pj?"Programar recesso":"Programar férias"}</h2><p className="mt-1 text-sm text-muted-foreground">{pj?"Informe o período de referência e, se necessário, separe o recesso em blocos.":"Informe o período aquisitivo e, se necessário, separe as férias em blocos."}</p></div><button type="button" onClick={()=>setModal(false)} aria-label="Fechar" className="shrink-0 rounded-sm p-2 hover:bg-muted"><X className="h-5 w-5"/></button></div><div className="grid grid-cols-1 gap-5 px-4 py-5 sm:grid-cols-2 sm:gap-6 sm:px-6 sm:py-6">
      <label className="grid min-w-0 gap-2 text-sm font-medium sm:col-span-2">{pj?"Prestador":"Funcionário"}<select value={form.employee_id} onChange={e=>{setForm({...form,employee_id:e.target.value,acquisition_start_date:"",acquisition_end_date:"",concession_start_date:"",concession_end_date:""});setExtraBlocks([])}} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal" required><option value="">{pj?"Selecione o prestador":"Selecione o funcionário"}</option>{activeEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></label>
      <div className="grid grid-cols-1 gap-4 sm:col-span-2 md:grid-cols-2 md:gap-5"><div className="min-w-0 rounded-sm border p-4 sm:p-5"><p className="font-semibold">Período aquisitivo</p><p className="mb-3 mt-1 text-xs text-muted-foreground">Edite as datas conforme o período real, inclusive quando houver recesso de fim de ano.</p><div className="grid grid-cols-1 gap-4"><label className="grid min-w-0 gap-2 text-sm font-medium">Data de início<input type="date" value={form.acquisition_start_date} onChange={e=>{const start=e.target.value;if(!start)return;const end=shiftDate(addYears(start,1),-1);const concessionStart=end?shiftDate(end,1):"";const concessionEnd=concessionStart?shiftDate(addYears(concessionStart,1),-1):"";setForm(f=>({...f,acquisition_start_date:start,acquisition_end_date:end,concession_start_date:concessionStart,concession_end_date:concessionEnd,...((f.title.startsWith("Período aquisitivo ·")||/^Férias\\s*[·-]\\s*período aquisitivo/i.test(f.title))||!f.title?{title:start?"Período aquisitivo · "+dateLabel(start)+" a "+dateLabel(end):""}:{})}))}} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-medium">Data final<input type="date" value={form.acquisition_end_date} min={form.acquisition_start_date||undefined} onChange={e=>{const end=e.target.value;if(!end)return;const concessionStart=shiftDate(end,1);const concessionEnd=concessionStart?shiftDate(addYears(concessionStart,1),-1):"";setForm(f=>({...f,acquisition_end_date:end,concession_start_date:concessionStart,concession_end_date:concessionEnd,title:(!f.title||f.title.startsWith("Período aquisitivo ·")||/^Férias\\s*[·-]\\s*período aquisitivo/i.test(f.title))?(f.acquisition_start_date&&end?"Período aquisitivo · "+dateLabel(f.acquisition_start_date)+" a "+dateLabel(end):""):f.title}))}} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"/></label></div></div><div className="min-w-0 rounded-sm border bg-muted/20 p-4 sm:p-5"><p className="font-semibold">Período concessivo</p><p className="mb-3 mt-1 text-xs text-muted-foreground">Calculado automaticamente: começa no dia seguinte ao fim do aquisitivo e dura 1 ano.</p><div className="grid grid-cols-1 gap-4"><label className="grid min-w-0 gap-2 text-sm font-medium">Data de início<input type="date" value={form.acquisition_end_date?shiftDate(form.acquisition_end_date,1):""} readOnly className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal text-muted-foreground"/></label><label className="grid min-w-0 gap-2 text-sm font-medium">Data final<input type="date" value={form.acquisition_end_date?shiftDate(addYears(shiftDate(form.acquisition_end_date,1),1),-1):""} readOnly className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal text-muted-foreground"/></label></div></div></div>
      
      <label className="grid min-w-0 gap-2 text-sm font-medium sm:col-span-2">{pj?"Dias de recesso acordados neste período":"Direito de férias adquirido neste período (dias)"}<input inputMode="decimal" value={form.entitled_days} onChange={e=>setForm({...form,entitled_days:e.target.value})} placeholder="30 (integral). Para proporcional, ex.: 12,5" className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"/><span className="text-xs font-normal text-muted-foreground">{pj?"Informe os dias acordados em contrato. Se vazio, utiliza 30 dias como referência de planejamento.":"Deixe vazio para 30 dias. Licença remunerada não consome este direito."}</span></label>
      <div className="rounded-sm border sm:col-span-2"><div className="space-y-5 p-3 sm:p-5">
        <div className="min-w-0 rounded-sm border bg-background p-3 sm:p-4"><p className="mb-3 text-sm font-semibold">{editing?"Bloco "+editingBlockNumber:pj?"Recesso":"Férias"}</p>
        {!editing&&<label className="mb-4 flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={blocksExpanded} onChange={e=>{setBlocksExpanded(e.target.checked);if(!e.target.checked)setExtraBlocks([])}} className="h-4 w-4 shrink-0 rounded"/>{pj?"Separar o recesso em blocos":"Separar as férias em blocos"}</label>}
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2"><label className="grid min-w-0 gap-2 text-sm font-medium">Início do afastamento<input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-medium">Fim do afastamento<input type="date" value={form.end_date} min={form.start_date||undefined} onChange={e=>setForm({...form,end_date:e.target.value})} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"/></label><label className="grid min-w-0 gap-2 text-sm font-medium">Tipo de afastamento<select value={form.leave_type} onChange={e=>setForm({...form,leave_type:e.target.value})} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"><option value="ferias">{pj?"Recesso (consome saldo)":"Férias (consome saldo)"}</option><option value="licenca_remunerada">Licença remunerada (não consome saldo)</option></select></label><label className="grid min-w-0 gap-2 text-sm font-medium">Quantidade de dias (opcional)<input inputMode="decimal" placeholder="Ex.: 12,5 — vazio usa as datas" value={form.days_quantity} onChange={e=>setForm({...form,days_quantity:e.target.value})} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"/></label></div></div>
        {!editing&&blocksExpanded&&<button type="button" onClick={()=>setExtraBlocks(blocks=>[...blocks,{start_date:"",end_date:"",leave_type:"ferias",days_quantity:""}])} className="inline-flex items-center gap-2 rounded-sm border px-3 py-2 text-sm font-medium hover:bg-muted"><Plus className="h-4 w-4"/>Adicionar bloco</button>}
        {blocksExpanded&&extraBlocks.map((block,index)=><div key={index} className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 rounded-sm border bg-muted/20 p-3 sm:p-4 md:grid-cols-2"><div className="flex items-center justify-between gap-3 md:col-span-2"><p className="text-sm font-semibold">Bloco {index+2}</p><button type="button" onClick={()=>setExtraBlocks(blocks=>blocks.filter((_,i)=>i!==index))} className="rounded-sm p-1.5 text-red-700 hover:bg-red-50" aria-label={"Remover bloco "+(index+2)}><Trash2 className="h-4 w-4"/></button></div><label className="grid min-w-0 gap-2 text-sm font-medium">Início do afastamento<input type="date" value={block.start_date} onChange={e=>setExtraBlocks(blocks=>blocks.map((b,i)=>i===index?{...b,start_date:e.target.value,end_date:b.end_date&&e.target.value&&b.end_date<e.target.value?"":b.end_date}:b))} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal" required/></label><label className="grid min-w-0 gap-2 text-sm font-medium">Fim do afastamento<input type="date" min={block.start_date||undefined} value={block.end_date} onChange={e=>setExtraBlocks(blocks=>blocks.map((b,i)=>i===index?{...b,end_date:e.target.value}:b))} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal" required/></label><label className="grid min-w-0 gap-2 text-sm font-medium">Tipo de afastamento<select value={block.leave_type} onChange={e=>setExtraBlocks(blocks=>blocks.map((b,i)=>i===index?{...b,leave_type:e.target.value}:b))} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"><option value="ferias">Férias (consome saldo)</option><option value="licenca_remunerada">Licença remunerada (não consome saldo)</option></select></label><label className="grid min-w-0 gap-2 text-sm font-medium">Quantidade de dias (opcional)<input inputMode="decimal" placeholder="Ex.: 12,5 — vazio usa as datas" value={block.days_quantity} onChange={e=>setExtraBlocks(blocks=>blocks.map((b,i)=>i===index?{...b,days_quantity:e.target.value}:b))} className="h-11 w-full min-w-0 rounded-sm border bg-background px-3 font-normal"/></label></div>)}
      </div></div>
      <label className="flex items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" checked={form.completed} onChange={e=>{setCompletionChanged(true);setForm({...form,completed:e.target.checked})}} className="h-4 w-4 shrink-0 rounded"/>Marcar este bloco como concluído</label>
      <label className="grid min-w-0 gap-2 text-sm font-medium sm:col-span-2">Observações gerais<textarea rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Observações sobre o período (opcional)" className="w-full min-w-0 rounded-sm border bg-background px-3 py-2.5 font-normal"/></label>
      {error&&<p role="alert" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
      </div><div className="flex flex-col-reverse gap-3 border-t px-4 py-5 sm:flex-row sm:justify-end sm:px-6"><button type="button" onClick={()=>setModal(false)} className="rounded-sm border px-4 py-2.5 text-sm font-medium hover:bg-muted">Cancelar</button><button data-role-sensitive type="button" disabled={saving} onClick={()=>void save()} className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60">{saving?"Salvando...":"Salvar período"}</button></div></section></div>}
    {confirmDelete&&<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4"><section role="alertdialog" aria-modal="true" className="w-full max-w-md rounded-sm border bg-card p-6 shadow-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-sm bg-red-50 text-red-700"><Trash2 className="h-5 w-5"/></div><h2 className="mt-4 font-display text-xl font-semibold">Excluir este período?</h2><p className="mt-2 text-sm text-muted-foreground">O período de {employeeName(confirmDelete)} ({isSettlementOnly(confirmDelete)?"registro de rescisão":startOf(confirmDelete)&&endOf(confirmDelete)?dateLabel(startOf(confirmDelete))+" a "+dateLabel(endOf(confirmDelete)):"sem bloco informativo"}) será removido permanentemente.</p>{error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}<div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setConfirmDelete(null)} className="rounded-sm border px-4 py-2 text-sm">Cancelar</button><button data-role-sensitive type="button" onClick={()=>void remove()} className="rounded-sm bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Excluir período</button></div></section></div>}
  </div>;
}