import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Plus, Power, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/cargos")({ component: Positions });

function Positions() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [formName, setFormName] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const { data, error } = await (supabase as any)
      .from("positions")
      .select("id,name,active")
      .order("name");

    if (error) setError(error.message);
    else setRows(data ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  function openNew() {
    setError("");
    setFormName("");
    setOpen(true);
  }

  async function save() {
    const value = formName.trim();
    if (!value) {
      setError("Informe o nome do cargo.");
      return;
    }

    setSaving(true);
    setError("");

    const { error } = await (supabase as any)
      .from("positions")
      .insert({ name: value, active: true });

    if (error) {
      setError(
        error.code === "23505"
          ? "Já existe um cargo com esse nome."
          : error.message
      );
      setSaving(false);
      return;
    }

    setFormName("");
    setOpen(false);
    setSaving(false);
    await load();
  }

  async function toggle(row: any) {
    setError("");
    const { error } = await (supabase as any)
      .from("positions")
      .update({ active: !row.active })
      .eq("id", row.id);

    if (error) setError(error.message);
    else await load();
  }

  const filtered = rows.filter((row) =>
    row.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <b>DP Success · Cadastros</b>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="text-sm font-medium text-primary">Cadastro base</p>
            <h1 className="text-3xl font-bold">Cargos</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre os cargos utilizados pelos funcionários.
            </p>
          </div>
          <button type="button" onClick={openNew} className="rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            <Plus className="mr-2 inline h-4 w-4" /> Novo cargo
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <Card className="mt-6 overflow-hidden">
          <div className="flex items-center gap-2 border-b p-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={search}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Buscar cargo..."
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Cargo</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-5 py-8 text-center text-muted-foreground">
                      Nenhum cargo cadastrado.
                    </td>
                  </tr>
                ) : (
                  filtered.map((row) => (
                    <tr key={row.id}>
                      <td className="px-5 py-4 font-medium">{row.name}</td>
                      <td className="px-5 py-4">{row.active ? "Ativo" : "Inativo"}</td>
                      <td className="px-5 py-4">
                        <button type="button" onClick={() => void toggle(row)} className="text-primary">
                          <Power className="mr-1 inline h-4 w-4" />
                          {row.active ? "Inativar" : "Ativar"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Novo cargo</h2>
                <p className="mt-1 text-xs text-muted-foreground">O cadastro será salvo no banco.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="mt-5 grid gap-1 text-sm font-medium">
              Nome do cargo
              <input
                autoFocus
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void save();
                }}
                className="rounded-lg border bg-background px-3 py-2 font-normal"
                placeholder="Ex.: Analista de RH"
              />
            </label>

            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2 text-sm">
                Cancelar
              </button>
              <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">
                {saving ? "Salvando..." : "Salvar cargo"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
