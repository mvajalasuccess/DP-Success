import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Circle, ClipboardList, Clock3, Filter, List, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Task = {
  id:string; title:string; description:string|null; status:"todo"|"in_progress"|"done";
  priority:"low"|"medium"|"high"|"urgent"; due_date:string|null; due_time:string|null;
  reminder_at:string|null; category:string; assignee_id:string|null; employee_id:string|null;
  created_by:string|null; recurrence:"none"|"daily"|"weekly"|"monthly"|"yearly"; recurrence_until:string|null;
};
type Employee={id:string;full_name:string};
type Profile={id:string;full_name:string|null;email:string|null};

const priorities=[["urgent","Urgente"],["high","Alta"],["medium","Média"],["low","Baixa"]];
const categories=["RH","DP","Admissão","Demissão","Férias","Benefícios","SST","Ponto","Folha","Ação de RH","Outros"];
const statusLabel=(s:string)=>s==="todo"?"A fazer":s==="in_progress"?"Em andamento":"Concluída";
const dateLabel=(v:string|null)=>v?v.slice(8,10)+"/"+v.slice(5,7)+"/"+v.slice(0,4):"";
const overdue=(t:Task)=>Boolean(t.due_date&&t.status!=="done"&&t.due_date<new Date().toISOString().slice(0,10));

export function Tarefas(){
  const[tasks,setTasks]=useState<Task[]>([]),[employees,setEmployees]=useState<Employee[]>([]),[profiles,setProfiles]=useState<Profile[]>([]);
  const[view,setView]=useState<"list"|"kanban"|"calendar">("list"),[status,setStatus]=useState("all"),[priority,setPriority]=useState("all"),[category,setCategory]=useState("all"),[search,setSearch]=useState("");
  const[modal,setModal]=useState(false),[editing,setEditing]=useState<Task|null>(null),[error,setError]=useState(""),[saving,setSaving]=useState(false);
  const[form,setForm]=useState<any>({title:"",description:"",status:"todo",priority:"medium",due_date:"",due_time:"",reminder_at:"",category:"RH",assignee_id:"",employee_id:"",recurrence:"none",recurrence_until:"",checklist:""});

  async function load(){
    const[t,e,p]=await Promise.all([
      (supabase as any).from("tasks").select("*").order("due_date",{ascending:true,nullsFirst:false}).order("created_at",{ascending:false}),
      supabase.from("employees").select("id,full_name").order("full_name"),
      (supabase as any).from("profiles").select("id,full_name,email").order("full_name")
    ]);
    const er=[t,e,p].find(x=>x.error)?.error;if(er)setError(er.message);
    setTasks(t.data??[]);setEmployees(e.data??[]);setProfiles(p.data??[]);
  }
  useEffect(()=>{void load()},[]);

  const filtered=useMemo(()=>tasks.filter(t=>{
    const q=(t.title+" "+(t.description||"")).toLowerCase();
    return(status==="all"||t.status===status)&&(priority==="all"||t.priority===priority)&&(category==="all"||t.category===category)&&(!search||q.includes(search.toLowerCase()));
  }),[tasks,status,priority,category,search]);
  const counts={todo:tasks.filter(t=>t.status==="todo").length,in_progress:tasks.filter(t=>t.status==="in_progress").length,done:tasks.filter(t=>t.status==="done").length,overdue:tasks.filter(overdue).length};

  function newTask(){setEditing(null);setForm({title:"",description:"",status:"todo",priority:"medium",due_date:"",due_time:"",reminder_at:"",category:"RH",assignee_id:"",employee_id:"",recurrence:"none",recurrence_until:"",checklist:""});setModal(true)}
  async function editTask(t:Task){
    const{data}=await(supabase as any).from("task_checklist_items").select("title").eq("task_id",t.id).order("position");
    setEditing(t);setForm({title:t.title,description:t.description||"",status:t.status,priority:t.priority,due_date:t.due_date||"",due_time:t.due_time?.slice(0,5)||"",reminder_at:t.reminder_at?new Date(t.reminder_at).toISOString().slice(0,16):"",category:t.category,assignee_id:t.assignee_id||"",employee_id:t.employee_id||"",recurrence:t.recurrence,recurrence_until:t.recurrence_until||"",checklist:(data||[]).map((x:any)=>x.title).join("\n")});setModal(true);
  }
  async function save(){
    if(!form.title.trim())return;setSaving(true);setError("");
    const{sesson}= {sesson:null as any};
    const sessionResult=await supabase.auth.getSession();
    const payload={title:form.title.trim(),description:form.description.trim()||null,status:form.status,priority:form.priority,due_date:form.due_date||null,due_time:form.due_time||null,reminder_at:form.reminder_at?new Date(form.reminder_at).toISOString():null,category:form.category,assignee_id:form.assignee_id||null,employee_id:form.employee_id||null,created_by:editing?.created_by||sessionResult.data.session?.user.id||null,recurrence:form.recurrence,recurrence_until:form.recurrence_until||null};
    const r=editing?await(supabase as any).from("tasks").update(payload).eq("id",editing.id).select("*").single():await(supabase as any).from("tasks").insert(payload).select("*").single();
    if(r.error){setError(r.error.message);setSaving(false);return}
    await(supabase as any).from("task_checklist_items").delete().eq("task_id",r.data.id);
    const items=form.checklist.split("\n").map((x:string)=>x.trim()).filter(Boolean).map((title:string,i:number)=>({task_id:r.data.id,title,position:i}));
    if(items.length)await(supabase as any).from("task_checklist_items").insert(items);
    setModal(false);setSaving(false);await load();
  }
  async function setTaskStatus(t:Task,s:Task["status"]){const{error:e}=await(supabase as any).from("tasks").update({status:s}).eq("id",t.id);if(e)setError(e.message);else setTasks(x=>x.map(a=>a.id===t.id?{...a,status:s}:a))}
  async function remove(t:Task){if(!window.confirm("Excluir a tarefa \""+t.title+"\"?"))return;const{error:e}=await(supabase as any).from("tasks").delete().eq("id",t.id);if(e)setError(e.message);else setTasks(x=>x.filter(a=>a.id!==t.id))}
  const emp=(id:string|null)=>employees.find(x=>x.id===id)?.full_name;
  const prof=(id:string|null)=>{const p=profiles.find(x=>x.id===id);return p?.full_name||p?.email};

  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-5"><div className="mx-auto max-w-[1250px] flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-primary">Organização do RH</p><h1 className="text-3xl font-bold">Tarefas & Agenda</h1><p className="mt-1 text-sm text-muted-foreground">Centralize suas pendências, prazos e lembretes.</p></div>
      <button onClick={newTask} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm text-primary-foreground"><Plus className="h-4 w-4"/>Nova tarefa</button>
    </div></header>
    <main className="mx-auto max-w-[1250px] space-y-6 px-6 py-6">
      {error&&<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <div className="grid gap-3 md:grid-cols-4">{[["Pendentes",counts.todo,"todo"],["Em andamento",counts.in_progress,"in_progress"],["Atrasadas",counts.overdue,"all"],["Concluídas",counts.done,"done"]].map((x:any)=><button key={x[0]} onClick={()=>setStatus(x[2])} className="text-left"><Card className="p-4 hover:border-primary/40"><p className="text-xs text-muted-foreground">{x[0]}</p><p className="mt-1 text-2xl font-bold">{x[1]}</p></Card></button>)}</div>
      <Card className="p-4"><div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar tarefas..." className="w-full rounded-lg border bg-background px-3 py-2 pl-9 text-sm"/><Filter className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/></div>
        <select value={status} onChange={e=>setStatus(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="all">Todos os status</option><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="done">Concluídas</option></select>
        <select value={priority} onChange={e=>setPriority(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="all">Todas as prioridades</option>{priorities.map(p=><option key={p[0]} value={p[0]}>{p[1]}</option>)}</select>
        <select value={category} onChange={e=>setCategory(e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option value="all">Todas as categorias</option>{categories.map(c=><option key={c}>{c}</option>)}</select>
        <div className="ml-auto flex rounded-lg border p-1"><button onClick={()=>setView("list")} className={view==="list"?"rounded-md bg-muted p-2":"rounded-md p-2"}><List className="h-4 w-4"/></button><button onClick={()=>setView("kanban")} className={view==="kanban"?"rounded-md bg-muted p-2":"rounded-md p-2"}><ClipboardList className="h-4 w-4"/></button><button onClick={()=>setView("calendar")} className={view==="calendar"?"rounded-md bg-muted p-2":"rounded-md p-2"}><CalendarDays className="h-4 w-4"/></button></div>
      </div></Card>

      {view==="list"&&<Card className="overflow-hidden">{filtered.length===0?<div className="p-12 text-center text-sm text-muted-foreground">Nenhuma tarefa encontrada.</div>:<div className="divide-y">{filtered.map(t=><Row key={t.id} task={t} emp={emp(t.employee_id)} prof={prof(t.assignee_id)} edit={()=>void editTask(t)} remove={()=>void remove(t)} status={s=>void setTaskStatus(t,s)}/>)}</div>}</Card>}
      {view==="kanban"&&<div className="grid gap-4 lg:grid-cols-3">{(["todo","in_progress","done"] as Task["status"][]).map(s=><Card key={s} className="min-h-[420px] p-3"><div className="mb-3 flex items-center justify-between px-2"><b>{statusLabel(s)}</b><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{filtered.filter(t=>t.status===s).length}</span></div><div className="space-y-2">{filtered.filter(t=>t.status===s).map(t=><button key={t.id} onClick={()=>void editTask(t)} className="w-full rounded-xl border p-4 text-left hover:border-primary/40"><b>{t.title}</b><p className="mt-1 text-xs text-muted-foreground">{t.category}{t.due_date?" · "+dateLabel(t.due_date):""}</p></button>)}</div></Card>)}</div>}
      {view==="calendar"&&<Card className="p-5"><div className="mb-4 flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary"/><b>Próximos prazos</b></div><div className="divide-y">{filtered.filter(t=>t.due_date).sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date))).map(t=><Row key={t.id} task={t} emp={emp(t.employee_id)} prof={prof(t.assignee_id)} edit={()=>void editTask(t)} remove={()=>void remove(t)} status={s=>void setTaskStatus(t,s)}/>)}</div></Card>}

      {modal&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-6 py-4"><div><h2 className="font-bold">{editing?"Editar tarefa":"Nova tarefa"}</h2><p className="text-xs text-muted-foreground">Prazo, responsável, funcionário e lembrete são opcionais.</p></div><button onClick={()=>setModal(false)} className="rounded-lg p-2 hover:bg-muted"><X className="h-5 w-5"/></button></div>
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">Tarefa *</span><input autoFocus value={form.title} onChange={e=>setForm({...form,title:e.target.value})} className="w-full rounded-lg border px-3 py-2.5" placeholder="Ex.: Conferir documentação da admissão"/></label>
          <label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">Descrição</span><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="min-h-24 w-full rounded-lg border px-3 py-2.5"/></label>
          <Field label="Status"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="w-full rounded-lg border px-3 py-2.5"><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="done">Concluída</option></select></Field>
          <Field label="Prioridade"><select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})} className="w-full rounded-lg border px-3 py-2.5">{priorities.map(p=><option key={p[0]} value={p[0]}>{p[1]}</option>)}</select></Field>
          <Field label="Categoria"><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})} className="w-full rounded-lg border px-3 py-2.5">{categories.map(c=><option key={c}>{c}</option>)}</select></Field>
          <Field label="Funcionário relacionado"><select value={form.employee_id} onChange={e=>setForm({...form,employee_id:e.target.value})} className="w-full rounded-lg border px-3 py-2.5"><option value="">Nenhum</option>{employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}</select></Field>
          <Field label="Responsável"><select value={form.assignee_id} onChange={e=>setForm({...form,assignee_id:e.target.value})} className="w-full rounded-lg border px-3 py-2.5"><option value="">Eu / sem responsável</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.full_name||p.email||"Usuário"}</option>)}</select></Field>
          <Field label="Prazo"><input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})} className="w-full rounded-lg border px-3 py-2.5"/></Field>
          <Field label="Horário do prazo"><input type="time" value={form.due_time} onChange={e=>setForm({...form,due_time:e.target.value})} className="w-full rounded-lg border px-3 py-2.5"/></Field>
          <Field label="Lembrar em"><input type="datetime-local" value={form.reminder_at} onChange={e=>setForm({...form,reminder_at:e.target.value})} className="w-full rounded-lg border px-3 py-2.5"/></Field>
          <Field label="Repetir"><select value={form.recurrence} onChange={e=>setForm({...form,recurrence:e.target.value})} className="w-full rounded-lg border px-3 py-2.5"><option value="none">Não repetir</option><option value="daily">Diariamente</option><option value="weekly">Semanalmente</option><option value="monthly">Mensalmente</option><option value="yearly">Anualmente</option></select></Field>
          {form.recurrence!=="none"&&<Field label="Repetir até"><input type="date" value={form.recurrence_until} onChange={e=>setForm({...form,recurrence_until:e.target.value})} className="w-full rounded-lg border px-3 py-2.5"/></Field>}
          <label className="md:col-span-2"><span className="mb-1 block text-sm font-medium">Checklist <span className="font-normal text-muted-foreground">(uma etapa por linha)</span></span><textarea value={form.checklist} onChange={e=>setForm({...form,checklist:e.target.value})} className="min-h-28 w-full rounded-lg border px-3 py-2.5" placeholder={"Solicitar documentos\nConferir documentos\nCadastrar no sistema"}/></label>
        </div>
        <div className="flex justify-between border-t px-6 py-4"><div>{editing&&<button onClick={()=>{void remove(editing);setModal(false)}} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive"><Trash2 className="h-4 w-4"/>Excluir</button>}</div><div className="flex gap-2"><button onClick={()=>setModal(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={saving||!form.title.trim()} onClick={()=>void save()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{saving?"Salvando...":"Salvar tarefa"}</button></div></div>
      </div></div>}
    </main>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>}
function Row({task,emp,prof,edit,remove,status}:{task:Task;emp?:string;prof?:string;edit:()=>void;remove:()=>void;status:(s:Task["status"])=>void}){
  const done=task.status==="done";
  return <div className="flex items-center gap-3 p-4 hover:bg-muted/30"><button onClick={()=>status(done?"todo":"done")} title={done?"Reabrir":"Concluir"}>{done?<CheckCircle2 className="h-5 w-5 text-primary"/>:<Circle className="h-5 w-5 text-muted-foreground"/>}</button><button onClick={edit} className="min-w-0 flex-1 text-left"><div className="flex flex-wrap items-center gap-2"><span className={done?"font-medium line-through text-muted-foreground":"font-medium"}>{task.title}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{task.category}</span><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{priorities.find(p=>p[0]===task.priority)?.[1]}</span></div><div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">{task.due_date&&<span className={overdue(task)?"text-destructive":""}><Clock3 className="mr-1 inline h-3.5 w-3.5"/>{dateLabel(task.due_date)}{task.due_time?" · "+task.due_time.slice(0,5):""}{overdue(task)?" · atrasada":""}</span>}{task.reminder_at&&<span>🔔 {new Date(task.reminder_at).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"})}</span>}{emp&&<span>👤 {emp}</span>}{prof&&<span>Responsável: {prof}</span>}</div></button><button onClick={remove} className="rounded-lg p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4"/></button></div>
}
