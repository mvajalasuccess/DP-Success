import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Copy, Link2, Pencil, Save, Shield, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

import { ScreenBrand } from "@/components/screen-brand";
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

type AccountProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  active: boolean;
  is_protected_account?: boolean;
};
type AccountRole = "administrador" | "convidado";
type AccountAction = { id: string } & (
  { kind: "delete" } |
  { kind: "role"; role: AccountRole } |
  { kind: "active"; active: boolean }
);

async function fetchAccountProfiles() {
  const fromProfiles = () => (supabase as any).from("profiles");
  const result = await fromProfiles()
    .select("id,email,full_name,role,active,is_protected_account").order("full_name");
  if (result.error?.code !== "42703" && result.error?.code !== "PGRST204") return result;
  return fromProfiles().select("id,email,full_name,role,active").order("full_name");
}

type Invite = { id:string; token:string; role:string; created_at:string; expires_at:string; used_at:string|null; used_email:string|null; canceled_at:string|null };
export function inviteStatus(i: Pick<Invite,"used_at"|"canceled_at"|"expires_at">, now = Date.now()): "Pendente"|"Utilizado"|"Expirado"|"Cancelado" {
  if (i.canceled_at) return "Cancelado";
  if (i.used_at) return "Utilizado";
  return new Date(i.expires_at).getTime() <= now ? "Expirado" : "Pendente";
}
function brDateTime(v:string){ return new Date(v).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}); }
function brDate(v:string){ const parts=v.slice(0,10).split("-"); return parts[2]+"/"+parts[1]+"/"+parts[0]; }

export function Parametros({ readOnly = false }: { readOnly?: boolean }){
  const [settings,setSettings]=useState<Setting[]>([]),[company,setCompany]=useState<any>({}),[holidays,setHolidays]=useState<Holiday[]>([]),[profiles,setProfiles]=useState<AccountProfile[]>([]),[currentProfile,setCurrentProfile]=useState<AccountProfile | null>(null),[error,setError]=useState(""),[saved,setSaved]=useState(""),[holidayForm,setHolidayForm]=useState({date:"",name:"",scope:"nacional"}),[holidayYear,setHolidayYear]=useState(String(new Date().getFullYear()));
  async function load(){
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    if (readOnly) {
      const { data, error } = await supabase.from("holidays").select("id,holiday_date,name,scope,is_demo").order("holiday_date");
      setHolidays(data ?? []);
      if (error) setError(error.message);
      return;
    }
    const [s,c,h,p]=await Promise.all([
      (supabase as any).from("system_settings").select("id,setting_group,setting_key,setting_value,label,description").order("setting_group").order("label"),
      (supabase as any).from("company_settings").select("*").limit(1).maybeSingle(),
      (supabase as any).from("holidays").select("id,holiday_date,name,scope,is_demo").order("holiday_date"),
      fetchAccountProfiles(),
    ]);
    const firstError=[s,c,h,p].find(x=>x.error)?.error;
    if(firstError)setError(firstError.message);
    setSettings(s.data??[]);setCompany(c.data??{});setHolidays(h.data??[]);setProfiles(p.data??[]);
    setCurrentProfile((p.data ?? []).find((x: AccountProfile) => x.id === sessionData.session?.user.id) ?? null);
  }
  useEffect(()=>{void load()},[readOnly]);

  // Mantém a lista de usuários sincronizada com o banco mesmo quando um
  // usuário é excluído diretamente pelo Supabase/SQL ou por outra sessão.
  useEffect(() => {
    if (readOnly) return;
    const refreshProfiles = async () => {
      const { data } = await fetchAccountProfiles();
      if (data) setProfiles(data);
    };

    const onFocus = () => { void refreshProfiles(); };
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => { void refreshProfiles(); }, 5000);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [readOnly]);
  const isAdmin = !readOnly && currentProfile?.role === "administrador";
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null);
  const [savingAccountAction, setSavingAccountAction] = useState(false);
  const actionTarget = profiles.find(profile => profile.id === accountAction?.id);
  const actionTargetLabel = actionTarget?.email || actionTarget?.full_name || "este usuário";
  const accountActionDescription = accountAction?.kind === "delete"
    ? `A conta de ${actionTargetLabel} será excluída definitivamente. Esta ação não pode ser desfeita.`
    : accountAction?.kind === "role"
      ? `Confirma a alteração do perfil de ${actionTargetLabel} para ${accountAction.role === "administrador" ? "Administrador" : "Convidado"}?`
      : `Confirma que deseja ${accountAction?.active ? "ativar" : "desativar"} o acesso de ${actionTargetLabel}?`;
  const [editing,setEditing]=useState<{id:string;name:string}|null>(null);
  const [invites,setInvites]=useState<Invite[]>([]),[inviteRole,setInviteRole]=useState<"convidado"|"administrador">("convidado"),[inviteOpen,setInviteOpen]=useState(false);
  const [deletingInviteId, setDeletingInviteId] = useState<string | null>(null);
  async function loadInvites(){
    const { data, error } = await (supabase as any).from("user_invites").select("id,token,role,created_at,expires_at,used_at,used_email,canceled_at").order("created_at",{ascending:false});
    if (error) { setError(error.message); return; }
    setInvites(data ?? []);
  }
  useEffect(()=>{ if (isAdmin) void loadInvites(); },[isAdmin]);
  const inviteLink=(token:string)=>`${window.location.origin}/login?convite=${token}`;
  async function generateInvite(){
    setError(""); setSaved("");
    const { data, error } = await (supabase as any).rpc("create_invite",{ _role: inviteRole, _valid_days: 7 });
    if (error) { setError(error.message); return; }
    setInviteOpen(false);
    try { await navigator.clipboard.writeText(inviteLink(data.token)); setSaved("Convite gerado e link copiado."); } catch { setSaved("Convite gerado. Copie o link na lista abaixo."); }
    void loadInvites();
  }
  async function cancelInvite(id:string){
    if (!window.confirm("Cancelar este convite? O link deixará de funcionar.")) return;
    setError(""); setSaved("");
    const { error } = await (supabase as any).rpc("cancel_invite",{ _invite_id: id });
    if (error) { setError(error.message); return; }
    setSaved("Convite cancelado."); void loadInvites();
  }
  async function deleteCanceledInvite(invite: Invite) {
    if (!isAdmin || !invite.canceled_at || invite.used_at || deletingInviteId) return;
    if (!window.confirm("Excluir definitivamente este convite cancelado?")) return;

    setError("");
    setSaved("");
    setDeletingInviteId(invite.id);
    const { data, error } = await supabase.from("user_invites")
      .delete()
      .eq("id", invite.id)
      .not("canceled_at", "is", null)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    setDeletingInviteId(null);
    if (error) {
      console.error("Falha ao excluir convite cancelado:", error.message);
      setError("Não foi possível excluir o convite cancelado. Tente novamente.");
      return;
    }
    if (!data) {
      await loadInvites();
      setError("O convite não está mais disponível para exclusão.");
      return;
    }
    setInvites(current => current.filter(item => item.id !== data.id));
    setSaved("Convite excluído.");
  }

  async function copyInvite(token:string){
    try { await navigator.clipboard.writeText(inviteLink(token)); setSaved("Link copiado."); } catch { window.prompt("Copie o link:", inviteLink(token)); }
  }
  async function saveName(){
    if (!isAdmin || !editing) return;
    const target = profiles.find(profile => profile.id === editing.id);
    if (!target || !(target.is_protected_account === false ||
      (target.is_protected_account === true && target.id === currentProfile?.id))) return;
    setError(""); setSaved("");
    const { error } = await (supabase as any).rpc("admin_update_user_name",{ _user_id: editing.id, _full_name: editing.name });
    if (error) { setError(error.message); return; }
    setEditing(null); setSaved("Nome atualizado.");
    window.dispatchEvent(new Event("dp:profile-updated"));
    void load();
  }
  // O filtro mostra exclusivamente anos que já possuem feriados cadastrados.
  const holidayYears = [...new Set(holidays.map(h => h.holiday_date.slice(0, 4)))].sort((a,b) => Number(b)-Number(a));
  const holidayYearsKey = holidayYears.join("|");
  useEffect(() => {
    setHolidayYear(previous => holidayYears.includes(previous) ? previous : (holidayYears[0] ?? ""));
  }, [holidayYearsKey]);
  const visibleHolidays = holidays.filter(h => h.holiday_date.slice(0, 4) === holidayYear);

  async function addHoliday() {
    if (!holidayForm.date || !holidayForm.name.trim()) { setError("Informe a data e o nome do feriado."); return; }
    setError(""); setSaved("");
    const { error } = await (supabase as any).from("holidays")
      .insert({ holiday_date: holidayForm.date, name: holidayForm.name.trim(), scope: holidayForm.scope, is_demo: false });
    if (error) { setError(error.message); return; }
    setHolidayForm({ date: "", name: "", scope: "nacional" });
    setHolidayYear(holidayForm.date.slice(0, 4));
    setSaved("Feriado adicionado.");
    void load();
  }

  async function deleteHoliday(id: string) {
    if (!window.confirm("Excluir este feriado?")) return;
    setError(""); setSaved("");
    const { error } = await (supabase as any).from("holidays").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setSaved("Feriado removido.");
    void load();
  }

  async function confirmAccountAction() {
    if (!isAdmin || !accountAction || !actionTarget || savingAccountAction ||
      actionTarget.id === currentProfile?.id || actionTarget.is_protected_account !== false) return;

    const deleting = accountAction.kind === "delete";
    const body = accountAction.kind === "role" ? { user_id: accountAction.id, role: accountAction.role }
      : accountAction.kind === "active" ? { user_id: accountAction.id, active: accountAction.active }
      : { user_id: accountAction.id };
    setAccountAction(null);
    setSavingAccountAction(true);
    setError("");
    setSaved("");
    try {
      const { data, error } = await supabase.functions.invoke<{ success?: boolean; error?: string }>(
        deleting ? "delete-user" : "update-user-access", { body },
      );
      if (error || data?.success !== true) {
        setError(data?.error ?? error?.message ?? "Não foi possível concluir a ação.");
        return;
      }
      await load();
      setSaved(deleting ? "Usuário excluído." : "Acesso atualizado.");
    } finally {
      setSavingAccountAction(false);
    }
  }

  return <div className="dp-screen min-h-screen bg-background">
    <header className="dp-screen-topbar border-b bg-card/80 px-4 py-4 backdrop-blur sm:px-6"><div className="mx-auto flex max-w-[1180px] items-center justify-between"><a href="/" className="text-sm text-muted-foreground"><ArrowLeft className="mr-1 inline h-4 w-4"/>Voltar</a><ScreenBrand name="Configurações" /></div></header>
    <main className="mx-auto max-w-[1180px] px-6 py-7 space-y-6">
      <div className="relative isolate mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-[#102b35] via-[#123c40] to-[#075c50] px-5 py-6 text-white shadow-lg sm:px-7 sm:py-7 [&_p]:!text-white/75 [&_h1]:!text-white"><p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Configurações</p><h1 className="text-2xl font-semibold tracking-tight sm:text-[30px]">Configurações do sistema</h1><p className="text-sm text-muted-foreground">Centralize dados da empresa e regras usadas pelo RH e pelo DP.</p></div>
      {error&&<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}{saved&&<div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-primary">{saved}</div>}
      <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div className="flex items-center gap-3"><CalendarDays className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Feriados</h2><p className="text-xs text-muted-foreground">Cadastre e remova feriados que impactam os cálculos de dias úteis.</p></div></div><label className="flex items-center gap-2 text-sm font-medium">Ano<select aria-label="Filtrar feriados por ano" value={holidayYear} onChange={e=>setHolidayYear(e.target.value)} className="rounded-lg border bg-background px-3 py-2 text-sm">{holidayYears.length===0?<option value="">Nenhum ano cadastrado</option>:holidayYears.map(year=><option key={year} value={year}>{year}</option>)}</select></label></div>
        <div data-role-sensitive className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2 xl:grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,180px)_auto]"><input type="date" value={holidayForm.date} onChange={e=>setHolidayForm({...holidayForm,date:e.target.value})} className="rounded-lg border px-3 py-2 text-sm"/><input placeholder="Nome do feriado" value={holidayForm.name} onChange={e=>setHolidayForm({...holidayForm,name:e.target.value})} className="rounded-lg border px-3 py-2 text-sm"/><select value={holidayForm.scope} onChange={e=>setHolidayForm({...holidayForm,scope:e.target.value})} className="rounded-lg border px-3 py-2 text-sm"><option value="nacional">Nacional</option><option value="estadual">Estadual</option><option value="municipal">Municipal</option></select><button data-role-sensitive onClick={()=>void addHoliday()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Adicionar</button></div>
        <div className="divide-y">{visibleHolidays.length===0?<p className="p-6 text-center text-sm text-muted-foreground">Nenhum feriado cadastrado para {holidayYear}.</p>:visibleHolidays.map(h=><div key={h.id} className="flex items-center justify-between p-4"><div><b className="text-sm">{h.name}</b><p className="text-xs text-muted-foreground">{brDate(h.holiday_date)} · {h.scope}</p></div><button data-role-sensitive onClick={()=>void deleteHoliday(h.id)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10" title="Excluir"><Trash2 className="h-4 w-4"/></button></div>)}</div>
      </Card>
      {!readOnly && <Card className="overflow-hidden"><div className="border-b p-5 flex items-center gap-3"><Shield className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Usuários e permissões</h2><p className="text-xs text-muted-foreground">Administradores têm acesso total. Convidados podem consultar o sistema e criar ocorrências no Diário de Ocorrências.</p></div></div>
        {!isAdmin && <div className="m-5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">Seu perfil é Convidado. Convidados podem consultar o sistema e criar ocorrências no Diário de Ocorrências.</div>}
        {isAdmin && profiles.some(profile => profile.is_protected_account === undefined) && (
          <p role="status" className="border-b px-5 py-3 text-sm text-muted-foreground">
            As alterações de usuários ficam indisponíveis até a atualização da proteção de contas no banco.
          </p>
        )}
        <div className="divide-y">{profiles.map(p=>{
          const viewOnly = p.role !== "administrador";
          const isSelf = p.id === currentProfile?.id;
          const canRename = isAdmin && (p.is_protected_account === false || (p.is_protected_account === true && isSelf));
          const canChangeAccess = isAdmin && !isSelf && p.is_protected_account === false && !savingAccountAction;
          return <div key={p.id} className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {canRename && editing && editing.id===p.id ? <div className="flex flex-wrap items-center gap-2"><input aria-label="Nome completo" autoFocus value={editing.name} onChange={e=>setEditing({id:p.id,name:e.target.value})} onKeyDown={e=>{if(e.key==="Enter")void saveName();}} className="rounded-lg border px-3 py-2 text-sm"/><button data-role-sensitive onClick={()=>void saveName()} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"><Save className="mr-1 inline h-4 w-4"/>Salvar</button><button onClick={()=>setEditing(null)} className="rounded-lg border px-3 py-2 text-sm">Cancelar</button><p className="w-full text-xs text-muted-foreground">{p.email}</p></div>
            : <div className="flex items-start gap-2"><div><p className="text-sm font-medium">{p.full_name||"Usuário"}</p><p className="text-xs text-muted-foreground">{p.email}</p>{p.is_protected_account && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Conta principal protegida</span>}</div>{canRename && <button data-role-sensitive onClick={()=>setEditing({id:p.id,name:p.full_name??""})} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Editar nome" aria-label={`Editar nome de ${p.email}`}><Pencil className="h-4 w-4"/></button>}</div>}
            <div className="flex items-center gap-2">
              <select data-role-sensitive aria-label="Tipo de acesso" disabled={!canChangeAccess} value={viewOnly ? "convidado" : "administrador"} onChange={e=>setAccountAction({id:p.id,kind:"role",role:e.target.value as AccountRole})} className="rounded-lg border px-3 py-2 text-sm"><option value="administrador">Administrador</option><option value="convidado">Convidado</option></select>
              <label className="flex items-center gap-2 text-sm"><input data-role-sensitive disabled={!canChangeAccess} type="checkbox" checked={p.active!==false} onChange={e=>setAccountAction({id:p.id,kind:"active",active:e.target.checked})}/>Ativo</label>
              {canChangeAccess && <button type="button" data-role-sensitive onClick={()=>setAccountAction({id:p.id,kind:"delete"})} className="rounded-lg p-2 text-destructive hover:bg-destructive/10" title="Excluir usuário"><Trash2 className="h-4 w-4"/></button>}
            </div>
          </div>
          <div className="mt-4 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Acesso aos módulos</span>
              <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{viewOnly ? "Somente visualização" : "Acesso total · visualizar e editar"}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{viewOnly ? "Este usuário pode consultar as informações, mas não pode criar, editar ou excluir registros." : "Este usuário pode visualizar, criar, editar e excluir os registros do sistema."}</p>
          </div>
        </div>; })}</div>
      </Card>}
      {isAdmin && <Card className="overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div className="flex items-center gap-3"><Link2 className="h-5 w-5 text-primary"/><div><h2 className="font-bold">Links de convite</h2><p className="text-xs text-muted-foreground">Cada link vale para um único cadastro, por 7 dias, com o tipo de acesso definido aqui.</p></div></div><button data-role-sensitive onClick={()=>setInviteOpen(true)} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Gerar link de convite</button></div>
        {inviteOpen && <div className="flex flex-wrap items-end gap-4 border-b bg-muted/20 p-5"><label className="grid gap-1 text-sm font-medium">Tipo de acesso<select aria-label="Tipo de acesso do convite" value={inviteRole} onChange={e=>setInviteRole(e.target.value as "convidado"|"administrador")} className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="convidado">Convidado</option><option value="administrador">Administrador</option></select></label><button data-role-sensitive onClick={()=>void generateInvite()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">Gerar e copiar link</button><button onClick={()=>setInviteOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button></div>}
        <div className="divide-y">{invites.length===0 ? <p className="p-6 text-center text-sm text-muted-foreground">Nenhum convite gerado.</p> : invites.map(i=>{ const st=inviteStatus(i); return <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-sm font-medium">{i.role==="administrador"?"Administrador":"Convidado"} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${st==="Pendente"?"bg-primary/10 text-primary":"bg-muted text-muted-foreground"}`}>{st}</span></p><p className="text-xs text-muted-foreground">Gerado em {brDateTime(i.created_at)} · {st==="Utilizado"?`usado por ${i.used_email??"—"} em ${brDateTime(i.used_at!)}`:`válido até ${brDateTime(i.expires_at)}`}</p></div>{st==="Pendente" && <div className="flex gap-2"><button onClick={()=>void copyInvite(i.token)} className="rounded-lg border px-3 py-2 text-sm"><Copy className="mr-1 inline h-4 w-4"/>Copiar link</button><button data-role-sensitive onClick={()=>void cancelInvite(i.id)} className="rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"><X className="mr-1 inline h-4 w-4"/>Cancelar</button></div>}
          {st === "Cancelado" && !i.used_at && (
            <button
              type="button"
              data-role-sensitive
              disabled={deletingInviteId !== null}
              onClick={() => void deleteCanceledInvite(i)}
              className="rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" className="mr-1 inline h-4 w-4" />
              {deletingInviteId === i.id ? "Excluindo…" : "Excluir"}
            </button>
          )}
        </div>; })}</div>
      </Card>}
      <AlertDialog open={accountAction !== null} onOpenChange={open => { if (!open) setAccountAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{accountAction?.kind === "delete" ? "Excluir usuário?" : "Alterar acesso?"}</AlertDialogTitle>
            <AlertDialogDescription>{accountActionDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!actionTarget || savingAccountAction}
              className={accountAction?.kind === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
              onClick={event => { event.preventDefault(); void confirmAccountAction(); }}
            >
              {accountAction?.kind === "delete" ? "Excluir usuário" : "Confirmar alteração"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  </div>;
}