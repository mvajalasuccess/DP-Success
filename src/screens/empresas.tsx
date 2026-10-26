import { useEffect, useState } from "react";
import { Building2, Plus, Pencil, Trash2, X, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Company = { id: string; name: string; cnpj: string; created_at?: string };

function normalizeCnpj(value: string) { return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14); }
function formatCnpj(value: string) {
  const d = normalizeCnpj(value);
  return d
    .replace(/^([A-Z0-9]{2})([A-Z0-9])/, "$1.$2")
    .replace(/^([A-Z0-9]{2})\.([A-Z0-9]{3})([A-Z0-9])/, "$1.$2.$3")
    .replace(/\.([A-Z0-9]{3})([A-Z0-9])/, ".$1/$2")
    .replace(/([A-Z0-9]{4})([0-9]{2})$/, "$1-$2");
}
function validCnpj(value: string) {
  const cnpj = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj) || /^([A-Z0-9])\\1{13}$/.test(cnpj)) return false;
  const digit = (base: string, weights: number[]) => {
    const sum = base.split("").reduce((acc, char, i) => acc + (char.charCodeAt(0) - 48) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const first = digit(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const second = digit(cnpj.slice(0, 12) + first, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj === cnpj.slice(0, 12) + first + second;
}

export function Companies() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadCompanies() {
    setLoading(true);
    const { data, error } = await (supabase as any).from("companies").select("id,name,cnpj,created_at").order("name");
    if (error) setError("Não foi possível carregar as empresas. Confirme se a migração do cadastro foi aplicada. " + error.message);
    else setCompanies((data ?? []) as Company[]);
    setLoading(false);
  }
  useEffect(() => { void loadCompanies(); }, []);

  function openNew() { setEditingId(null); setName(""); setCnpj(""); setError(""); setOpen(true); }
  function openEdit(company: Company) { setEditingId(company.id); setName(company.name); setCnpj(formatCnpj(company.cnpj)); setError(""); setOpen(true); }

  async function saveCompany() {
    const cleanName = name.trim();
    const cleanCnpj = normalizeCnpj(cnpj);
    if (!cleanName) { setError("Informe o nome da empresa."); return; }
    if (!validCnpj(cleanCnpj)) { setError("Informe um CNPJ válido com 14 caracteres."); return; }
    setSaving(true); setError("");
    const payload = { name: cleanName, cnpj: cleanCnpj };
    const result = editingId
      ? await (supabase as any).from("companies").update(payload).eq("id", editingId)
      : await (supabase as any).from("companies").insert(payload);
    setSaving(false);
    if (result.error) {
      setError(result.error.code === "23505" ? "Já existe uma empresa cadastrada com esse nome ou CNPJ." : result.error.message);
      return;
    }
    setOpen(false);
    await loadCompanies();
  }

  async function deleteCompany(company: Company) {
    const confirmed = window.confirm("Excluir a empresa " + company.name + "? Só será possível se nenhum funcionário estiver vinculado a ela.");
    if (!confirmed) return;
    setError("");
    const { count, error: countError } = await (supabase as any).from("employees").select("id", { count: "exact", head: true }).eq("company_id", company.id);
    if (countError) { setError(countError.message); return; }
    if ((count ?? 0) > 0) { setError("Esta empresa possui funcionários vinculados. Transfira ou desvincule esses funcionários antes de excluir."); return; }
    const { error } = await (supabase as any).from("companies").delete().eq("id", company.id);
    if (error) setError(error.message);
    else await loadCompanies();
  }

  const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.cnpj.includes(normalizeCnpj(search)));
  return <div className="dp-screen min-h-screen bg-background">
    <header className="border-b bg-background px-6 py-4"><div className="mx-auto flex max-w-[1500px] items-center justify-between"><a href="/" className="text-sm text-muted-foreground">← Voltar</a><div className="text-sm font-semibold">DP Success · Cadastros</div></div></header>
    <main className="dp-screen-content mx-auto max-w-[1500px] px-4 py-5 sm:px-6 sm:py-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div><p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Cadastro base</p><h1 className="mt-1 text-3xl font-bold">Empresas</h1><p className="mt-1 text-sm text-muted-foreground">Cadastre as empresas do grupo para depois vinculá-las aos funcionários e usar os filtros do sistema.</p></div>
        <button type="button" onClick={openNew} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"><Plus className="h-4 w-4"/> Nova empresa</button>
      </div>
      {error && <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Building2 className="h-5 w-5"/></div><div><p className="text-xs text-muted-foreground">Empresas cadastradas</p><p className="text-xl font-bold">{companies.length}</p></div></div></Card><Card className="p-4"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Search className="h-5 w-5"/></div><div><p className="text-xs text-muted-foreground">Resultado da busca</p><p className="text-xl font-bold">{filtered.length}</p></div></div></Card></div>
      <Card className="mt-6 overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display font-bold">Lista de empresas</h2><p className="text-xs text-muted-foreground">Somente nome e CNPJ são solicitados no cadastro.</p></div><div className="flex items-center gap-2 rounded-lg border px-3 py-2 sm:w-80"><Search className="h-4 w-4 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Buscar nome ou CNPJ..."/></div></div>
        <div className="overflow-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/70 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">CNPJ</th><th className="px-5 py-3 text-right">Ações</th></tr></thead><tbody className="divide-y">
          {loading ? <tr><td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">Carregando...</td></tr> : filtered.length === 0 ? <tr><td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">Nenhuma empresa cadastrada.</td></tr> : filtered.map(company=><tr key={company.id} className="hover:bg-muted/25"><td className="px-5 py-4 font-medium">{company.name}</td><td className="px-5 py-4 tabular-nums">{formatCnpj(company.cnpj)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><button type="button" onClick={()=>openEdit(company)} className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"><Pencil className="h-3.5 w-3.5"/>Editar</button><button type="button" onClick={()=>void deleteCompany(company)} className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/5"><Trash2 className="h-3.5 w-3.5"/>Excluir</button></div></td></tr>)}
        </tbody></table></div>
      </Card>
    </main>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><Card className="w-full max-w-xl p-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{editingId ? "Editar empresa" : "Cadastrar empresa"}</h2><p className="mt-1 text-sm text-muted-foreground">Preencha apenas os dados da empresa.</p></div><button type="button" onClick={()=>setOpen(false)} aria-label="Fechar" className="text-muted-foreground"><X className="h-5 w-5"/></button></div>
      <div className="mt-6 grid gap-4"><label className="grid gap-1.5 text-sm font-medium">Nome da empresa<input autoFocus value={name} onChange={e=>setName(e.target.value)} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="Digite o nome da empresa"/></label><label className="grid gap-1.5 text-sm font-medium">CNPJ<input value={cnpj} onChange={e=>setCnpj(formatCnpj(e.target.value))} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="00.000.000/0000-00" inputMode="numeric" maxLength={18}/></label></div>
      {error && <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button type="button" onClick={()=>void saveCompany()} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar empresa"}</button></div>
    </Card></div>}
  </div>;
};
