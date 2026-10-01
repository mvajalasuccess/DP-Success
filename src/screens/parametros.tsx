import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Building2, CalendarDays, Clock3, DollarSign, Gauge, Save, Shield, Settings2, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Setting = { id:string; setting_group:string; setting_key:string; setting_value:string; label:string; description:string|null };
type Holiday = { id:string; holiday_date:string; name:string; scope:string; is_demo:boolean };
const ACCESS_OPTIONS = [
  ["dashboard","Dashboard"],
  ["funcionarios","Funcionários"],
  ["empresa","Empresa"],
  ["fechamento","Fechamento de Ponto"],
  ["lancamentos","Lançamentos"],
  ["atestados","Atestados"],
  ["ocorrencias","Faltas e Ocorrências"],
  ["banco_horas","Banco de Horas"],
  ["relatorios","Relatórios"],
  ["comparativos","Comparativos"],
  ["kpis","KPIs"],
  ["configuracoes","Configurações"],
  ["importar","Importar histórico"],
  ["tarefas","Tarefas & Agenda"],
] as const;
type AccessKey = typeof ACCESS_OPTIONS[number][0];
const DEFAULT_PERMISSIONS: Record<AccessKey, {view:boolean; edit:boolean}> = Object.fromEntries(
  ACCESS_OPTIONS.map(([key]) => [key, { view: true, edit: true }]),
) as Record<AccessKey, {view:boolean; edit:boolean}>;
const groups = [
  { key:"ponto", title:"Regras de ponto", icon:Clock3, keys:["daily_minutes","weekly_minutes","closing_day","competence_start_day","late_tolerance_minutes","overtime_tolerance_minutes"] },
  { key:"he", title:"Horas extras", icon:DollarSign, keys:["he_60_rate","he_60_night_rate","he_100_rate","he_100_night_rate","night_rate","he_60_night_balance_from"] },
  { key:"kpi", title:"Indicadores", icon:Gauge, keys:["absenteeism_formula","include_certificates","include_declarations","include_allowances","include_debits"] },
];
function brDate(v:string){ const parts=v.slice(0,10).split("-"); return parts[2]+"/"+parts[1]+"/"+parts[0]; }

export function Parametros(){
  const [settings,setSettings]=useState<Setting[]>([]),[company,setCompany]=useState<any>({}),[holidays,setHolidays]=useState<Holiday[]>([]),[profiles,setProfiles]=useState<any[]>([]),[currentProfile,setCurrentProfile]=useState<any>(null),[error,setError]=useState(""),[saved,setSaved]=useState(""),[holidayForm,setHolidayForm]=useState({date:"",name:"",scope:"nacional"});
  async function load(){
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const [s,c,h,p]=await Promise.all([
      (supabase as any).from("system_settings").select("id,setting_group,setting_key,setting_value,label,description").order("setting_group").order("label"),
      (supabase as any).from("company_settings").select("*").limit(1).maybeSingle(),
      (supabase as any).from("holidays").select("id,holiday_date,name,scope,is_demo").order("holiday_date"),
      (supabase as any).from("profiles").select("id,email,full_name,role,active,permissions").order("full_name"),
    ]);
    const firstError=[s,c,h,p].find(x=>x.error)?.error;
    if(firstError)setError(firstError.message);
    setSettings(s.data??[]);setCompany(c.data??{});setHolidays(h.data??[]);setProfiles(p.data??[]);
    setCurrentProfile((p.data ?? []).find((x:any) => x.id === sessionData.session?.user.id) ?? null);
  }
  useEffect(()=>{void load()},[]);
  const settingMap=useMemo(()=>new Map(settings.map(x=>[x.setting_key,x])),[settings]);
  function setSetting(key:string,value:string){setSettings(old=>old.map(x=>x.setting_key===key?{...x,setting_value:value}:x))}
  async function saveSetting(s:Setting){const {error:e}=await(supabase as any).from("system_settings").update({setting_value:s.setting_value}).eq("id",s.id);if(e)setError(e.message);else{setSaved("Configuração salva.");setTimeout(()=>setSaved(""),1800)}}
  async function saveCompany(){
    const payload={company_name:company.company_name??"",trade_name:company.trade_name??"",cnpj:company.cnpj??"",address:company.address??"",phone:company.phone??"",email:company.email??"",logo_url:company.logo_url||null,primary_color:company.primary_color||null};
    const {error:e}=company.id?await(supabase as any).from("company_settings").update(payload).eq("id",company.id):await(supabase as any).from("company_settings").insert(payload).select("*").single();
    if(e)setError(e.message);else{setSaved("Dados da empresa salvos.");setTimeout(()=>setSaved(""),1800)}
  }
  async function addHoliday(){if(!holidayForm.date||!holidayForm.name)return;const {error:e}=await(supabase as any).from("holidays").insert({holiday_date:holidayForm.date,name:holidayForm.name,scope:holidayForm.scope,is_demo:false});if(e)setError(e.message);else{setHolidayForm({date:"",name:"",scope:"nacional"});await load()}}
  async function deleteHoliday(id:string){const {error:e}=await(supabase as any).from("holidays").delete().eq("id",id);if(e)setError(e.message);else await load()}
  async function updateProfile(id:string,patch:any){const {error:e}=await(supabase as any).from("profiles").update(patch).eq("id",id);if(e)setError(e.message);else{setSaved("Usuário atualizado.");setTimeout(()=>setSaved(""),1800);await load()}}
  async function deleteProfile(id:string,email:string){
    if(!isAdmin)return;
    if(id===currentProfile?.id){setError("Você não pode excluir o próprio usuário.");return}
    if(!window.confirm(`Excluir o usuário ${email}? Esta ação remove o cadastro e o acesso ao sistema.`))return;
    setError("");
    const { data, error:e } = await (supabase as any).functions.invoke("delete-user", { body: { user_id: id } });
    if(e){setError(e.message);return}
    if(data?.error){setError(data.error);return}
    setSaved("Usuário excluído.");
    setTimeout(()=>setSaved(""),1800);
    await load();
  }
  const isAdmin = currentProfile?.role === "administrador" || currentProfile?.role === "rh";
  return <div className="min-h-screen bg-background">
    <header className="border-b px-6 py-4"><div className="mx-auto flex max-w-[1180px] items-center justify-between"><a href="/" className="text-sm text-muted-foreground"><ArrowLeft className="mr-1 inline h-4 w-4"/>Voltar</a><b>DP Success · Configurações</b></div></header>
    <main className="mx-auto max-w-[1180px] px-6 py-7 space-y-6">
      <div><p className="text-sm text-primary">Configurações</p><h1 className="text-3xl font-bold">Configurações do sistema</h1><p className="text-sm text-muted-foreground">Centralize dados da empresa e regras usadas pelo RH e pelo DP.</p></div>
      {error&&<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}{saved&&<div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{saved}</div>}
      <Card className="overflow-hidden"><div className="border-b p-5 flex items-center gap-3"><Building2 className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Dados da empresa</h2><p className="text-xs text-muted-foreground">Informações gerais usadas no sistema e futuramente em relatórios.</p></div></div>
        <div className="grid gap-4 p-5 md:grid-cols-2">{([["company_name","Razão social"],["trade_name","Nome fantasia"],["cnpj","CNPJ"],["phone","Telefone"],["email","E-mail"],["address","Endereço"],["logo_url","URL do logo"],["primary_color","Cor principal"]] as const).map(([key,label])=><label key={key} className="text-sm"><span className="mb-1 block font-medium">{label}</span><input value={company[key]??""} onChange={e=>setCompany({...company,[key]:e.target.value})} className="w-full rounded-lg border bg-background px-3 py-2"/></label>)}</div>
        <div className="border-t p-5"><button onClick={()=>void saveCompany()} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground"><Save className="h-4 w-4"/>Salvar dados da empresa</button></div>
      </Card>
      {groups.map(g=>{const Icon=g.icon;return <Card key={g.key} className="overflow-hidden"><div className="border-b p-5 flex items-center gap-3"><Icon className="h-5 w-5 text-primary"/><div><h2 className="font-bold">{g.title}</h2><p className="text-xs text-muted-foreground">Regras gerais que podem ser ajustadas pelo RH.</p></div></div>
        <div className="divide-y">{g.keys.map(k=>{const s=settingMap.get(k);if(!s)return null;const boolean=["include_certificates","include_declarations","include_allowances","include_debits"].includes(k);return <div key={k} className="flex items-center justify-between gap-6 p-5"><div><p className="text-sm font-medium">{s.label}</p><p className="text-xs text-muted-foreground">{s.description}</p></div><div className="flex shrink-0 items-center gap-2">{boolean?<input type="checkbox" checked={s.setting_value==="true"} onChange={e=>{setSetting(k,String(e.target.checked));void saveSetting({...s,setting_value:String(e.target.checked)})}} className="h-4 w-4"/>:<><input value={s.setting_value} onChange={e=>setSetting(k,e.target.value)} className="w-44 rounded-lg border bg-background px-3 py-2 text-sm"/><button onClick={()=>void saveSetting(settingMap.get(k)!)} className="rounded-lg border p-2 hover:bg-muted" title="Salvar"><Save className="h-4 w-4"/></button></>}</div></div>})}</div>
      </Card>})}
      <Card className="overflow-hidden"><div className="border-b p-5 flex items-center gap-3"><CalendarDays className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Feriados</h2><p className="text-xs text-muted-foreground">Cadastre e remova feriados que impactam os cálculos de dias úteis.</p></div></div>
        <div className="grid gap-3 p-5 md:grid-cols-[180px_1fr_180px_auto]"><input type="date" value={holidayForm.date} onChange={e=>setHolidayForm({...holidayForm,date:e.target.value})} className="rounded-lg border px-3 py-2 text-sm"/><input placeholder="Nome do feriado" value={holidayForm.name} onChange={e=>setHolidayForm({...holidayForm,name:e.target.value})} className="rounded-lg border px-3 py-2 text-sm"/><select value={holidayForm.scope} onChange={e=>setHolidayForm({...holidayForm,scope:e.target.value})} className="rounded-lg border px-3 py-2 text-sm"><option value="nacional">Nacional</option><option value="estadual">Estadual</option><option value="municipal">Municipal</option></select><button onClick={()=>void addHoliday()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Adicionar</button></div>
        <div className="divide-y">{holidays.map(h=><div key={h.id} className="flex items-center justify-between p-4"><div><b className="text-sm">{h.name}</b><p className="text-xs text-muted-foreground">{brDate(h.holiday_date)} · {h.scope}</p></div><button onClick={()=>void deleteHoliday(h.id)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10" title="Excluir"><Trash2 className="h-4 w-4"/></button></div>)}</div>
      </Card>
      <Card className="overflow-hidden"><div className="border-b p-5 flex items-center gap-3"><Shield className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Usuários e permissões</h2><p className="text-xs text-muted-foreground">Administrador e RH têm acesso total. Consulta pode apenas visualizar.</p></div></div>
        {!isAdmin && <div className="m-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Seu usuário é Consulta. O acesso deste perfil é somente para visualização.</div>}
        <div className="divide-y">{profiles.map(p=><div key={p.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm font-medium">{p.full_name||"Usuário"}</p><p className="text-xs text-muted-foreground">{p.email}</p></div>
            <div className="flex items-center gap-2">
              <select disabled={!isAdmin || p.id === currentProfile?.id} value={p.role||"consulta"} onChange={e=>void updateProfile(p.id,{role:e.target.value})} className="rounded-lg border px-3 py-2 text-sm"><option value="administrador">Administrador</option><option value="rh">RH</option><option value="consulta">Consulta</option></select>
              <label className="flex items-center gap-2 text-sm"><input disabled={!isAdmin} type="checkbox" checked={p.active!==false} onChange={e=>void updateProfile(p.id,{active:e.target.checked})}/>Ativo</label>
              {isAdmin && p.id !== currentProfile?.id && <button onClick={()=>void deleteProfile(p.id,p.email)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10" title="Excluir usuário"><Trash2 className="h-4 w-4"/></button>}
            </div>
          </div>
          <div className="mt-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Acesso aos módulos</span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                {p.role === "consulta" ? "Somente visualização" : "Acesso total · visualizar e editar"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {p.role === "consulta"
                ? "Este usuário pode consultar as informações, mas não pode criar, editar ou excluir registros."
                : "Este usuário pode visualizar, criar, editar e excluir os registros do sistema."}
            </p>
          </div>
        </div>)}</div>
      </Card>
      <Card className="p-5"><div className="flex items-start gap-3"><Settings2 className="mt-0.5 h-5 w-5 text-primary"/><div><h2 className="font-bold">Cadastros da empresa</h2><p className="text-sm text-muted-foreground">Cargos, departamentos e jornadas/escalas continuam nas telas próprias do menu Empresa.</p></div></div></Card>
    </main>
  </div>;
}