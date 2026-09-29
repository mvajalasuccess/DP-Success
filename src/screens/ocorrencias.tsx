import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type Employee = { id: string; full_name: string };
type OccType = { id: string; code: string; name: string; unit: string; requires_justification: boolean; affects_balance: boolean };
type Occ = {
  id: string;
  employee_id: string;
  occurrence_type_id: string;
  period_id: string | null;
  occurrence_date: string;
  end_date: string | null;
  quantity: number | null;
  unit: string;
  justification: string | null;
  notes: string | null;
  cid?: string | null;
  employees?: { full_name: string } | null;
  occurrence_types?: { name: string; code: string } | null;
};

const ALLOWED_CODES = new Set([
  "folga_abonada",
  "folga_descontada",
  "falta_justificada",
  "falta_injustificada",
  "declaracao_horas",
]);

const DECLARATION_REASONS = ["Acompanhante", "Consulta", "Exame", "Outros"];

const emptyForm = {
  employee_id: "",
  occurrence_type_id: "",
  occurrence_date: "",
  end_date: "",
  quantity: "",
  cid: "",
  declaration_reason: "",
  justification: "",
  notes: "",
};

function decimalHoursToText(value: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  const totalMinutes = Math.round(Number(value) * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

function hoursTextToDecimal(value: string) {
  const text = value.trim();
  if (!text) return 0;
  if (text.includes(":")) {
    const [h, m] = text.split(":");
    return Number(h || 0) + Number(m || 0) / 60;
  }
  return Number(text.replace(",", ".")) || 0;
}

export function Ocorrencias() {
  const [rows, setRows] = useState<Occ[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [types, setTypes] = useState<OccType[]>([]);
  const [periods, setPeriods] = useState<{ id: string; start_date: string; end_date: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Occ | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const visibleTypes = useMemo(
    () => types.filter(t => ALLOWED_CODES.has(t.code)),
    [types],
  );

  const selectedType = visibleTypes.find(t => t.id === form.occurrence_type_id);
  const selectedCode = selectedType?.code ?? "";
  const isFalta = ["folga_abonada", "folga_descontada", "falta_justificada", "falta_injustificada"].includes(selectedCode);
  const isAtestado = false;
  const isDeclaration = selectedCode === "declaracao_horas";

  async function load() {
    setError("");
    const { data, error } = await supabase
      .from("occurrences")
      .select("id,employee_id,occurrence_type_id,period_id,occurrence_date,end_date,quantity,unit,justification,notes,cid,employees(full_name),occurrence_types(name,code)")
      .order("occurrence_date", { ascending: false });

    if (error) setError(error.message);
    else setRows((data ?? []) as Occ[]);
  }

  async function loadOptions() {
    const [e, t, p] = await Promise.all([
      supabase.from("employees").select("id,full_name").eq("status", "ativo").order("full_name"),
      supabase.from("occurrence_types").select("id,code,name,unit,requires_justification,affects_balance").eq("active", true).order("name"),
      supabase.from("time_periods").select("id,start_date,end_date").order("start_date", { ascending: false }),
    ]);

    setEmployees((e.data ?? []) as Employee[]);
    setTypes((t.data ?? []) as OccType[]);
    setPeriods((p.data ?? []) as { id: string; start_date: string; end_date: string }[]);
  }

  useEffect(() => {
    void load();
    void loadOptions();
  }, []);

  function startNew() {
    setEditing(null);
    setForm({
      ...emptyForm,
      occurrence_type_id: visibleTypes.find(t => t.code === "falta_injustificada")?.id ?? visibleTypes[0]?.id ?? "",
    });
    setError("");
    setOpen(true);
  }

  function startEdit(row: Occ) {
    const code = row.occurrence_types?.code ?? "";
    const reason = code === "declaracao_horas" ? (row.notes?.match(/^Motivo: (.+?)(?:\n|$)/)?.[1] ?? "") : "";

    setEditing(row);
    setForm({
      employee_id: row.employee_id,
      occurrence_type_id: row.occurrence_type_id,
      occurrence_date: row.occurrence_date,
      end_date: row.end_date ?? "",
      quantity: code === "declaracao_horas" ? decimalHoursToText(row.quantity) : row.quantity == null ? "" : String(row.quantity),
      cid: "",
      declaration_reason: reason,
      justification: row.justification ?? "",
      notes: row.notes ?? "",
    });
    setError("");
    setOpen(true);
  }

  function changeType(id: string) {
    setForm({
      ...form,
      occurrence_type_id: id,
      quantity: "",
      end_date: "",
      cid: "",
      declaration_reason: "",
      justification: "",
    });
  }

  async function save() {
    setError("");

    if (!form.employee_id || !form.occurrence_type_id || !form.occurrence_date) {
      setError("Informe funcionário, tipo e data.");
      return;
    }

    if (isFalta && Number(form.quantity) <= 0) {
      setError("Informe a quantidade de dias.");
      return;
    }

    if (isDeclaration && hoursTextToDecimal(form.quantity) <= 0) {
      setError("Informe as horas realmente abonadas.");
      return;
    }

    if (selectedType?.requires_justification && !form.justification.trim()) {
      setError("Este tipo de ocorrência exige justificativa.");
      return;
    }

    setSaving(true);

    const period = periods.find(p => form.occurrence_date >= p.start_date && form.occurrence_date <= p.end_date);
    const quantity = isDeclaration ? hoursTextToDecimal(form.quantity) : Number(form.quantity);

    let notes = form.notes.trim() || null;
    if (isDeclaration && form.declaration_reason) {
      notes = `Motivo: ${form.declaration_reason}${notes ? `\n${notes}` : ""}`;
    }

    const payload = {
      employee_id: form.employee_id,
      occurrence_type_id: form.occurrence_type_id,
      period_id: period?.id ?? null,
      occurrence_date: form.occurrence_date,
      end_date: form.end_date || null,
      quantity,
      unit: isDeclaration ? "horas" : "dias",
      justification: form.justification.trim() || null,
      notes,

    };

    const result = editing
      ? await supabase.from("occurrences").update(payload).eq("id", editing.id)
      : await supabase.from("occurrences").insert(payload);

    setSaving(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setOpen(false);
    setEditing(null);
    setForm(emptyForm);
    await load();
  }

  async function remove(row: Occ) {
    if (!window.confirm(`Excluir a ocorrência de ${row.employees?.full_name ?? "funcionário"}?`)) return;

    setError("");
    const { error } = await supabase.from("occurrences").delete().eq("id", row.id);

    if (error) setError(error.message);
    else await load();
  }

  function displayQuantity(row: Occ) {
    if (row.occurrence_types?.code === "declaracao_horas") return decimalHoursToText(row.quantity);
    return row.quantity == null ? "—" : `${row.quantity} ${Number(row.quantity) === 1 ? "dia" : "dias"}`;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between">
          <a href="/" className="flex gap-2 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </a>
          <b>DP Success · Faltas e Ocorrências</b>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-primary">Ponto</p>
            <h1 className="text-3xl font-bold">Faltas e Ocorrências</h1>
            <p className="text-sm text-muted-foreground">
              Registre faltas em dias, atestados com CID e declarações com as horas realmente abonadas.
            </p>
          </div>
          <button onClick={startNew} className="rounded-lg bg-primary px-4 py-2.5 text-sm text-primary-foreground">
            <Plus className="mr-2 inline h-4 w-4" />
            Nova ocorrência
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <Card className="mt-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Funcionário</th>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Tipo</th>
                  <th className="px-5 py-3">Quantidade</th>
                  <th className="px-5 py-3">Unidade</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                      Nenhuma ocorrência cadastrada.
                    </td>
                  </tr>
                )}
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="px-5 py-4 font-medium">{row.employees?.full_name ?? "—"}</td>
                    <td className="px-5 py-4">{row.occurrence_date}{row.end_date ? ` → ${row.end_date}` : ""}</td>
                    <td className="px-5 py-4">{row.occurrence_types?.name ?? "—"}</td>
                    <td className="px-5 py-4">{displayQuantity(row)}</td>
                    <td className="px-5 py-4">{row.occurrence_types?.code === "declaracao_horas" ? "horas" : "dias"}</td>
                    <td className="px-5 py-4 text-right">
                      <button onClick={() => startEdit(row)} className="mr-2 rounded-md border p-2" title="Editar">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => void remove(row)} className="rounded-md border p-2 text-destructive" title="Excluir">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-xl p-6">
            <h2 className="text-xl font-bold">{editing ? "Editar ocorrência" : "Nova ocorrência"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Faltas são registradas em dias. Declarações são registradas pelas horas realmente abonadas.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <select value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })} className="rounded-lg border px-3 py-2 md:col-span-2">
                <option value="">Funcionário</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>

              <select value={form.occurrence_type_id} onChange={e => changeType(e.target.value)} className="rounded-lg border px-3 py-2 md:col-span-2">
                <option value="">Tipo de ocorrência</option>
                {visibleTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>

              <input type="date" value={form.occurrence_date} onChange={e => setForm({ ...form, occurrence_date: e.target.value })} className="rounded-lg border px-3 py-2" />

              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="rounded-lg border px-3 py-2" />

              {isDeclaration ? (
                <>
                  <select value={form.declaration_reason} onChange={e => setForm({ ...form, declaration_reason: e.target.value })} className="rounded-lg border px-3 py-2">
                    <option value="">Motivo da declaração</option>
                    {DECLARATION_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                  </select>
                  <input
                    inputMode="numeric"
                    placeholder="Horas realmente abonadas (HH:MM)"
                    value={form.quantity}
                    onChange={e => setForm({ ...form, quantity: e.target.value })}
                    className="rounded-lg border px-3 py-2"
                  />
                  <p className="text-xs text-muted-foreground md:col-span-2">
                    Informe o total de horas que a empresa realmente abonou, mesmo que seja maior que o tempo da consulta/exame.
                  </p>
                </>
              ) : (
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="Quantidade de dias"
                  value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className="rounded-lg border px-3 py-2"
                />
              )}

              

              {selectedType?.requires_justification && (
                <textarea
                  placeholder="Justificativa"
                  value={form.justification}
                  onChange={e => setForm({ ...form, justification: e.target.value })}
                  className="rounded-lg border px-3 py-2 md:col-span-2"
                />
              )}

              <textarea
                placeholder="Observações"
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="rounded-lg border px-3 py-2 md:col-span-2"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border px-4 py-2">Cancelar</button>
              <button disabled={saving} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
