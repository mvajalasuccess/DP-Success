import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useBlocker } from "@tanstack/react-router";
import { CalendarRange, Check, ChevronRight, Clock3, FileClock, FileText, Pencil, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScreenShell, btnDanger, btnOutline, btnPrimary, inputCls } from "@/components/screen-shell";
import { supabase } from "@/integrations/supabase/client";
import { formatBalance, formatDate, formatMinutes, monthRange, parseISODate, weekdayShort } from "@/lib/format";
import {
  cardKinds, datesInRange, emptyEntry, evaluateDay, summarizeDays, weekDays,
  type CardKind, type DayEntry, type EntryMode, type ManualCard,
} from "@/lib/manual-time-card";

type CardSummary = Pick<ManualCard, "id" | "person_name" | "kind" | "start_date" | "end_date">;
const summaryColumns = "id,person_name,kind,start_date,end_date";
const cardColumns = summaryColumns + ",weekday_minutes,entries,revision";
const cards = () => (supabase as any).from("manual_time_cards");
const marks = ["Entrada 1", "Saída 1", "Entrada 2", "Saída 2", "Entrada 3", "Saída 3"];
const modes: Record<EntryMode, string> = {
  normal: "Normal", overnight: "Virada de dia", absence: "Ausência", excused: "Abonado", waived: "Dispensado",
};
const fieldClass = "grid min-w-0 gap-1.5 text-sm font-medium";
const tone = (value: number) => value > 0 ? "text-emerald-800 dark:text-emerald-300"
  : value < 0 ? "text-rose-700 dark:text-rose-300" : "";

type CardDraft = { person_name: string; kind: CardKind; start: string; end: string };

function normalizePersonSearch(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

function newCardDraft(): CardDraft {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [year, month] = today.split("-").map(Number);
  return { person_name: "", kind: "freelancer", ...monthRange(year!, month!) };
}

function CardDetailsFields({ draft, onChange, disabled }: { draft: CardDraft; onChange: (value: CardDraft) => void; disabled: boolean }) {
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4">
      <label className={fieldClass}>Nome da pessoa
        <input className={inputCls} value={draft.person_name} required maxLength={140}
          onChange={event => onChange({ ...draft, person_name: event.target.value })} />
      </label>
      <label className={fieldClass}>Tipo de controle
        <select className={inputCls} value={draft.kind}
          onChange={event => onChange({ ...draft, kind: event.target.value as CardKind })}>
          {Object.entries(cardKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className={fieldClass}>Início
          <input type="date" className={inputCls} required value={draft.start}
            onChange={event => onChange({ ...draft, start: event.target.value })} />
        </label>
        <label className={fieldClass}>Fim
          <input type="date" className={inputCls} required min={draft.start} value={draft.end}
            onChange={event => onChange({ ...draft, end: event.target.value })} />
        </label>
      </div>
    </fieldset>
  );
}

function validateCardDraft(draft: CardDraft) {
  if (!draft.person_name.trim()) return "Informe o nome da pessoa.";
  const range = datesInRange(draft.start, draft.end);
  if (!range.length || range.length > 366) return "Informe um período válido de até 366 dias.";
  return "";
}

function durationInput(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function parseDuration(value: string) {
  if (!/^\d{1,2}:[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  const total = hours! * 60 + minutes!;
  return total <= 1440 ? total : null;
}

function dbError(message: string, error: { code?: string; message?: string }) {
  return error.code === "PGRST205" || error.code === "42P01"
    ? "O armazenamento do Ponto Avulso ainda precisa ser ativado no banco."
    : `${message}${error.message ? " " + error.message : ""}`;
}

export function PontoAvulso({ canEdit = false }: { canEdit?: boolean }) {
  const [list, setList] = useState<CardSummary[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [card, setCard] = useState<ManualCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(newCardDraft);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const blocker = useBlocker({ shouldBlockFn: () => dirty, withResolver: true, enableBeforeUnload: dirty });

  useEffect(() => {
    let ignore = false;
    void (async () => {
      const result: CardSummary[] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error: loadError } = await cards().select(summaryColumns)
          .order("start_date", { ascending: false }).order("id").range(offset, offset + 499);
        if (ignore) return;
        if (loadError) {
          setError(dbError("Não foi possível carregar os cartões.", loadError));
          break;
        }
        result.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
      setList(result);
      setListLoading(false);
    })();
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setCard(null);
      setCardLoading(false);
      return;
    }
    let ignore = false;
    setCard(null);
    setCardLoading(true);
    setError("");
    void (async () => {
      const { data, error: loadError } = await cards().select(cardColumns).eq("id", selectedId).maybeSingle();
      if (ignore) return;
      if (loadError) setError(dbError("Não foi possível abrir o cartão.", loadError));
      else if (!data) setError("Este cartão não está mais disponível.");
      setCard(data ?? null);
      setCardLoading(false);
    })();
    return () => { ignore = true; };
  }, [selectedId, reload]);

  function selectCard(id: string) {
    if (dirty) return;
    setQuery("");
    if (id === selectedId) return;
    setCard(null);
    setCardLoading(Boolean(id));
    setSelectedId(id);
  }

  async function createCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || creating || dirty) return;
    const validationError = validateCardDraft(draft);
    if (validationError) {
      setCreateError(validationError);
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const { data, error: insertError } = await cards().insert({
        person_name: draft.person_name.trim(), kind: draft.kind,
        start_date: draft.start, end_date: draft.end,
      }).select(summaryColumns).single();
      if (insertError) {
        setCreateError(dbError("Não foi possível criar o cartão.", insertError));
        return;
      }
      setList(current => [data, ...current]);
      selectCard(data.id);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  function updateCardDetails(updated: ManualCard) {
    setList(current => current.map(item => item.id === updated.id ? updated : item)
      .sort((first, second) => second.start_date.localeCompare(first.start_date) || first.id.localeCompare(second.id)));
    setCard(current => current?.id === updated.id ? updated : current);
  }

  function removeFromList(id: string) {
    setList(current => current.filter(item => item.id !== id));
    setSelectedId(current => current === id ? "" : current);
  }

  const searchTerms = normalizePersonSearch(query).trim().split(/\s+/).filter(Boolean);
  const searching = searchTerms.length > 0;
  const results = searching ? list.filter(item => {
    const name = normalizePersonSearch(item.person_name);
    return searchTerms.every(term => name.includes(term));
  }) : list;
  const currentCard = list.find(item => item.id === selectedId);
  const dropdownOptions = currentCard && !results.some(item => item.id === selectedId)
    ? [currentCard, ...results]
    : results;

  return (
    <ScreenShell section="Controle de jornada" title="Ponto Avulso" name="Ponto Avulso"
      subtitle="Cartões manuais de jornada com apuração própria de horas e saldo."
      actions={canEdit && <button type="button" data-role-sensitive disabled={dirty || listLoading} className={btnPrimary}
        onClick={() => { setDraft(newCardDraft()); setCreateError(""); setOpen(true); }}>
        <Plus className="h-4 w-4" /> Novo cartão
      </button>}>
      <Card className="mb-4 grid items-end gap-3 rounded-2xl p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:p-5">
        <label className={fieldClass}>Buscar por pessoa
          <input type="search" className={inputCls} value={query} placeholder="Nome da pessoa"
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              const match = results[0];
              if (event.key === "Enter" && searching && results.length === 1 && match) selectCard(match.id);
            }} />
        </label>
        <label className={fieldClass}>Cartão
          <select className={inputCls} value={selectedId} disabled={dirty || listLoading || !list.length}
            onChange={event => selectCard(event.target.value)}>
            <option value="">{listLoading ? "Carregando cartões…" : "Selecione um cartão"}</option>
            {dropdownOptions.map(item => <option key={item.id} value={item.id}>
              {item.person_name} · {formatDate(item.start_date)} a {formatDate(item.end_date)} · {cardKinds[item.kind]}
            </option>)}
          </select>
        </label>
        {searching && !listLoading && (
          <div className="overflow-hidden rounded-xl border border-border/70 bg-muted/25 sm:col-span-2">
            <p role="status" className="px-3 py-2 text-sm text-muted-foreground">
              {results.length === 0 ? "Nenhum cartão encontrado para esse nome."
                : results.length === 1 ? "1 cartão encontrado" : `${results.length} cartões encontrados`}
            </p>
            {results.length > 0 && (
              <ul aria-label="Cartões encontrados" className="max-h-60 divide-y divide-border/70 overflow-y-auto border-t border-border/70 bg-background">
                {results.map(item => (
                  <li key={item.id}>
                    <button type="button" disabled={dirty} onClick={() => selectCard(item.id)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-primary/10 disabled:opacity-60">
                      <span className="min-w-0">
                        <span className="block break-words text-sm font-medium">{item.person_name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatDate(item.start_date)} a {formatDate(item.end_date)} · {cardKinds[item.kind]}
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-primary-strong" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>
      {error && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {(listLoading || cardLoading) && <p role="status" className="py-10 text-center text-sm text-muted-foreground">Carregando Ponto Avulso…</p>}
      {!listLoading && !cardLoading && !error && !card && (
        <Card className="grid place-items-center gap-2 rounded-2xl p-10 text-center">
          <FileClock aria-hidden="true" className="mb-1 h-8 w-8 text-primary-strong" />
          <h2 className="font-semibold">{list.length ? "Selecione um cartão" : "Nenhum cartão avulso cadastrado"}</h2>
          {canEdit && !list.length && <p className="text-sm text-muted-foreground">Use Novo cartão para lançar as primeiras batidas.</p>}
        </Card>
      )}
      {card && (
        <CardEditor key={card.id + ":" + reload} card={card} canEdit={canEdit} onDirty={setDirty}
          onReload={() => { setDirty(false); setReload(value => value + 1); }}
          onUpdate={updateCardDetails} onDelete={() => removeFromList(card.id)} />
      )}

      <Dialog open={open} onOpenChange={value => { if (!creating) setOpen(value); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo cartão avulso</DialogTitle>
            <DialogDescription>Escolha a pessoa e as datas que o cartão deve cobrir.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={createCard}>
            <CardDetailsFields draft={draft} onChange={setDraft} disabled={creating} />
            {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}
            <DialogFooter>
              <button type="button" className={btnOutline} disabled={creating} onClick={() => setOpen(false)}>Cancelar</button>
              <button type="submit" className={btnPrimary} disabled={creating || !canEdit}>{creating ? "Criando…" : "Criar cartão"}</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={blocker.status === "blocked"} onOpenChange={value => {
        if (!value && blocker.status === "blocked") blocker.reset();
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair com alterações em aberto?</AlertDialogTitle>
            <AlertDialogDescription>As batidas e ajustes de jornada ainda não foram salvos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar ao cartão</AlertDialogCancel>
            <AlertDialogAction onClick={event => {
              event.preventDefault();
              if (blocker.status === "blocked") blocker.proceed();
            }}>Sair sem salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScreenShell>
  );
}

function CardEditor({ card, canEdit, onDirty, onReload, onUpdate, onDelete }: {
  card: ManualCard; canEdit: boolean; onDirty: (value: boolean) => void;
  onReload: () => void; onUpdate: (updated: ManualCard) => void; onDelete: () => void;
}) {
  const punchesTable = useRef<HTMLTableElement>(null);
  const [saved, setSaved] = useState(card);
  const [entries, setEntries] = useState(card.entries);
  const [week, setWeek] = useState(() => card.weekday_minutes.map(durationInput));
  const [start, setStart] = useState(card.start_date);
  const [end, setEnd] = useState(card.end_date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [editDraft, setEditDraft] = useState<CardDraft | null>(null);
  const [editError, setEditError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [showSchedule, setShowSchedule] = useState(!card.weekday_minutes.some(Boolean));
  const schedule = week.map(parseDuration);
  const validSchedule = schedule.every(value => value !== null);
  const dirty = entries !== saved.entries || week.some((value, day) => value !== durationInput(saved.weekday_minutes[day]!));
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);

  const days = useMemo(() => datesInRange(start, end), [start, end]);
  const rows = days.map(date => {
    const entry = entries[date] ?? emptyEntry;
    const day = evaluateDay(entry, schedule[parseISODate(date).getUTCDay()] ?? 0);
    return { date, entry, ...day };
  });
  const totals = summarizeDays(rows);

  function changeEntry(date: string, entry: DayEntry) {
    setNotice("");
    setEntries(previous => {
      const next = { ...previous };
      if (entry.mode === "normal" && !entry.punches.some(Boolean)) delete next[date];
      else next[date] = entry;
      return next;
    });
  }

  function changePunch(date: string, entry: DayEntry, index: number, value: string) {
    const punches = marks.map((_, position) => position === index ? value : entry.punches[position] ?? "");
    // Older cards can already contain a fourth pair.
    punches.push(...entry.punches.slice(marks.length));
    changeEntry(date, { ...entry, punches });
  }

  function discardChanges() {
    setWeek(saved.weekday_minutes.map(durationInput));
    setEntries(saved.entries);
    setNotice("");
    setError("");
  }

  async function saveCard() {
    if (!canEdit || !dirty || !validSchedule || busy || conflict) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { data, error: saveError } = await cards()
        .update({ weekday_minutes: schedule, entries, revision: saved.revision + 1 })
        .eq("id", card.id).eq("revision", saved.revision).select(cardColumns).maybeSingle();
      if (saveError) {
        setError(dbError("Não foi possível salvar o cartão.", saveError));
      } else if (!data) {
        setConflict(true);
        setError("O cartão mudou em outra sessão. Recarregue o cartão antes de continuar.");
      } else {
        setSaved(data);
        setEntries(data.entries);
        setWeek(data.weekday_minutes.map(durationInput));
        setNotice("Cartão salvo.");
      }
    } finally {
      setBusy(false);
    }
  }

  function focusPunches() {
    if (!canEdit || busy || conflict) return;
    const fields = Array.from(punchesTable.current?.querySelectorAll<HTMLInputElement>('input[type="time"]:enabled') ?? []);
    const firstPunch = fields.find(field => field.value) ?? fields[0];
    firstPunch?.focus();
  }

  function beginEditDetails() {
    if (!canEdit || busy || dirty || conflict) return;
    setEditError("");
    setEditDraft({ person_name: saved.person_name, kind: saved.kind, start: saved.start_date, end: saved.end_date });
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !editDraft || busy || dirty || conflict) return;
    const validationError = validateCardDraft(editDraft);
    if (validationError) {
      setEditError(validationError);
      return;
    }
    if (Object.keys(saved.entries).some(date => date < editDraft.start || date > editDraft.end)) {
      setEditError("O período precisa incluir todos os dias que já têm batidas ou tipo do dia registrado.");
      return;
    }

    setBusy(true);
    setEditError("");
    setError("");
    setNotice("");
    try {
      const { data, error: saveError } = await cards().update({
        person_name: editDraft.person_name.trim(),
        kind: editDraft.kind,
        start_date: editDraft.start,
        end_date: editDraft.end,
        revision: saved.revision + 1,
      }).eq("id", saved.id).eq("revision", saved.revision).select(cardColumns).maybeSingle();

      if (saveError) {
        setEditError(dbError("Não foi possível editar o cartão.", saveError));
      } else if (!data) {
        setEditDraft(null);
        setConflict(true);
        setError("O cartão mudou em outra sessão. Recarregue o cartão antes de continuar.");
      } else {
        setSaved(data);
        setEntries(data.entries);
        setStart(data.start_date);
        setEnd(data.end_date);
        onUpdate(data);
        setEditDraft(null);
        setNotice("Dados do cartão atualizados.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function deleteCard() {
    if (!canEdit || busy || dirty || conflict) return;
    setDeleteOpen(false);
    setBusy(true);
    setError("");
    try {
      const { data, error: deleteError } = await cards().delete().eq("id", card.id)
        .eq("revision", saved.revision).select("id").maybeSingle();
      if (deleteError) setError(dbError("Não foi possível excluir o cartão.", deleteError));
      else if (!data) {
        setConflict(true);
        setError("O cartão mudou em outra sessão. Recarregue o cartão antes de continuar.");
      } else onDelete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/30 px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary-strong">
              <FileClock aria-hidden="true" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="break-words text-lg font-semibold">{card.person_name}</h2>
              <p className="text-xs text-muted-foreground">{cardKinds[card.kind]} · {formatDate(card.start_date)} a {formatDate(card.end_date)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnOutline} aria-expanded={showSchedule}
              aria-controls="manual-card-schedule" onClick={() => setShowSchedule(value => !value)}>
              <SlidersHorizontal aria-hidden="true" className="h-4 w-4" /> Jornada semanal
            </button>
            {canEdit && (
              <>
                <button type="button" data-role-sensitive className={btnPrimary} disabled={busy || conflict} onClick={focusPunches}>
                  <Pencil aria-hidden="true" className="h-4 w-4" /> Editar batidas
                </button>
                <button type="button" data-role-sensitive className={btnOutline} disabled={busy || dirty || conflict} onClick={beginEditDetails}>
                  <FileText aria-hidden="true" className="h-4 w-4" /> Dados do cartão
                </button>
                <button type="button" data-role-sensitive className={btnDanger} disabled={busy || dirty || conflict} onClick={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden="true" className="h-4 w-4" /> Excluir cartão
                </button>
              </>
            )}
          </div>
        </div>
        <div id="manual-card-schedule" hidden={!showSchedule} className="px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Horas previstas por dia</h3>
            {validSchedule && <span className="text-sm font-medium tabular-nums">{formatMinutes(schedule.reduce<number>((sum, value) => sum + (value ?? 0), 0))} por semana</span>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {weekDays.map(day => <label key={day.index} className={fieldClass}>{day.label}
              {canEdit ? <input className={inputCls + " font-mono"} value={week[day.index] ?? ""}
                placeholder="00:00" maxLength={5} aria-invalid={schedule[day.index] === null} disabled={busy}
                onChange={event => {
                  const value = event.target.value;
                  setNotice("");
                  setWeek(current => current.map((item, index) => index === day.index ? value : item));
                }} />
                : <span className="font-mono tabular-nums">{formatMinutes(schedule[day.index])}</span>}
            </label>)}
          </div>
          {canEdit && <p className="mt-3 text-xs text-muted-foreground">Use HH:MM, como 08:48. Para um dia sem jornada, use 00:00.</p>}
          {!validSchedule && <p role="alert" className="mt-2 text-sm text-destructive">Revise a jornada. Cada dia aceita de 00:00 a 24:00.</p>}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 rounded-2xl px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-6 sm:px-5">
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary-strong">
            <CalendarRange aria-hidden="true" className="h-4 w-4" />
          </span>
          <h2 className="text-sm font-semibold">Período em exibição</h2>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:ml-auto sm:justify-end">
          <label className="flex items-center gap-2 text-sm font-medium"><span>De:</span>
            <input type="date" className={inputCls} value={start} min={card.start_date} max={end || card.end_date}
              onChange={event => {
                const value = event.target.value;
                if (value >= card.start_date && value <= (end || card.end_date)) setStart(value);
              }} />
          </label>
          <label className="flex items-center gap-2 text-sm font-medium"><span>Até:</span>
            <input type="date" className={inputCls} value={end} min={start} max={card.end_date}
              onChange={event => {
                const value = event.target.value;
                if (value >= start && value <= card.end_date) setEnd(value);
              }} />
          </label>
          <button type="button" className={btnOutline} onClick={() => { setStart(card.start_date); setEnd(card.end_date); }}>Período inteiro</button>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {[
          ["Previstas nos dias apurados", validSchedule ? formatMinutes(totals.expected) : "—"],
          ["Trabalhadas", formatMinutes(totals.worked)],
          ["Créditos", validSchedule ? formatMinutes(totals.credit) : "—"],
          ["Débitos", validSchedule ? formatMinutes(totals.debit) : "—"],
          ["Saldo do período", validSchedule ? formatBalance(totals.balance) : "—"],
        ].map(([label, value], index) => (
          <Card key={label} className={`rounded-xl px-4 py-3 ${index === 4 ? "ring-1 ring-primary/45" : ""}`}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className={`mt-1 text-xl font-semibold tabular-nums ${index === 4 && validSchedule ? tone(totals.balance) : ""}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden rounded-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Clock3 aria-hidden="true" className="h-4 w-4 text-primary-strong" />
            <h2 className="font-semibold">Cartão de ponto</h2>
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite">{totals.reviewed} {totals.reviewed === 1 ? "dia apurado" : "dias apurados"} · {totals.pending} {totals.pending === 1 ? "pendência" : "pendências"}</p>
        </div>
        <div className="overflow-x-auto">
          <table ref={punchesTable} className="w-full min-w-[1000px] text-left text-xs">
            <thead className="bg-muted">
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-[130px] bg-muted px-3 py-2">Data</th>
                {marks.map((label, index) => <th key={label} scope="col"
                  className={`whitespace-nowrap px-2 py-2 text-center ${index % 2 === 1 ? "border-r border-border/60" : ""}`}>{label}</th>)}
                <th scope="col" className="min-w-[122px] px-2 py-2">Tipo do dia</th>
                <th scope="col" className="px-2 py-2 text-center">Previstas</th>
                <th scope="col" className="px-2 py-2 text-center">Trabalhadas</th>
                <th scope="col" className="px-2 py-2 text-center">Abonadas</th>
                <th scope="col" className="min-w-[96px] px-2 py-2 text-center">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map(row => {
                const balance = validSchedule ? row.balance : null;
                const dateLabel = formatDate(row.date);
                const previousPair = row.entry.punches.slice(marks.length);
                return (
                  <tr key={row.date} className={row.expected === 0 ? "bg-muted/30" : ""}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-border/60 bg-card px-3 py-2 font-medium whitespace-nowrap">
                      {dateLabel} <span className="ml-1 text-muted-foreground">{weekdayShort(row.date)}</span>
                      {previousPair.some(Boolean) && (
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          Par anterior · {previousPair[0] || "—"} a {previousPair[1] || "—"}
                        </span>
                      )}
                    </th>
                    {marks.map((label, index) => (
                      <td key={label} className={`px-1 py-1 text-center ${index % 2 === 1 ? "border-r border-border/60" : ""}`}>
                        {canEdit ? <input type="time" value={row.entry.punches[index] ?? ""}
                          aria-label={`${label} de ${dateLabel}`} disabled={busy}
                          onChange={event => changePunch(row.date, row.entry, index, event.target.value)}
                          className="w-full min-w-[82px] rounded-md border border-border/70 px-1 py-1 font-mono text-xs tabular-nums" />
                          : <span className="font-mono tabular-nums">{row.entry.punches[index] || "—"}</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1">
                      {canEdit ? <select aria-label={`Tipo de dia em ${dateLabel}`} className={inputCls + " min-w-[122px] px-1 text-xs"}
                        value={row.entry.mode} disabled={busy}
                        onChange={event => changeEntry(row.date, { ...row.entry, mode: event.target.value as EntryMode })}>
                        {Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select> : modes[row.entry.mode]}
                    </td>
                    <td className="px-2 py-1 text-center tabular-nums">{validSchedule ? formatMinutes(row.expected) : "—"}</td>
                    <td className="px-2 py-1 text-center tabular-nums">{formatMinutes(row.worked)}</td>
                    <td className="px-2 py-1 text-center tabular-nums">{validSchedule && row.entry.mode === "excused" ? formatMinutes(row.excused) : "—"}</td>
                    <td className="px-2 py-1 text-center font-semibold tabular-nums">
                      {row.status === "invalid" ? <span className="text-rose-700 dark:text-rose-300">Revisar</span>
                        : row.status === "incomplete" ? <span className="text-amber-700 dark:text-amber-300">Incompleto</span>
                          : <span className={tone(balance ?? 0)}>{formatBalance(balance)}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
          Preencha os pares em ordem. Use Ausência para registrar débito sem batidas, Abonado para cobrir as horas faltantes, Dispensado para zerar a jornada e Virada de dia para saídas após a meia-noite.
        </p>
      </Card>

      {(canEdit || error || notice) && (
        <div className="sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg sm:px-5">
          <div className="min-w-0">
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
              : notice ? <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300"><Check className="h-4 w-4" />{notice}</p>
                : <p className="text-sm text-muted-foreground">{dirty ? "Alterações a salvar" : "Todas as alterações estão salvas"}</p>}
          </div>
          {canEdit && <div className="flex flex-wrap gap-2">
            {conflict ? <button type="button" data-role-sensitive className={btnOutline} onClick={onReload}>Recarregar cartão</button> : (
              <>
                {dirty && <button type="button" data-role-sensitive className={btnOutline} disabled={busy} onClick={discardChanges}>Descartar alterações</button>}
                <button type="button" data-role-sensitive className={btnPrimary} disabled={!dirty || busy || !validSchedule} onClick={() => void saveCard()}>
                  <Save aria-hidden="true" className="h-4 w-4" /> {busy ? "Aguarde…" : "Salvar cartão"}
                </button>
              </>
            )}
          </div>}
        </div>
      )}
      <Dialog open={editDraft !== null} onOpenChange={open => { if (!open && !busy) setEditDraft(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dados do cartão</DialogTitle>
            <DialogDescription>O período deve cobrir as datas que já têm registros.</DialogDescription>
          </DialogHeader>
          {editDraft && (
            <form className="grid gap-4" onSubmit={saveDetails}>
              <CardDetailsFields draft={editDraft} onChange={setEditDraft} disabled={busy} />
              {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
              <DialogFooter>
                <button type="button" className={btnOutline} disabled={busy} onClick={() => setEditDraft(null)}>Cancelar</button>
                <button type="submit" className={btnPrimary} disabled={!canEdit || busy}>{busy ? "Salvando…" : "Salvar dados do cartão"}</button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cartão avulso?</AlertDialogTitle>
            <AlertDialogDescription>O cartão de {card.person_name} e todas as batidas registradas nele serão excluídos definitivamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction data-role-sensitive onClick={() => void deleteCard()} className="bg-destructive text-white hover:bg-destructive/90">Excluir cartão</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
