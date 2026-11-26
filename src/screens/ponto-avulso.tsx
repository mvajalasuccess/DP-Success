import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useBlocker } from "@tanstack/react-router";
import { CalendarRange, Check, Clock3, FileClock, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
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
const marks = ["Entrada 1", "Saída 1", "Entrada 2", "Saída 2", "Entrada 3", "Saída 3", "Entrada 4", "Saída 4"];
const modes: Record<EntryMode, string> = {
  normal: "Normal", overnight: "Virada de dia", absence: "Ausência", waived: "Dispensado",
};
const fieldClass = "grid min-w-0 gap-1.5 text-sm font-medium";
const tone = (value: number) => value > 0 ? "text-emerald-800 dark:text-emerald-300"
  : value < 0 ? "text-rose-700 dark:text-rose-300" : "";

function newCardDraft() {
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const [year, month] = today.split("-").map(Number);
  return { person_name: "", kind: "freelancer" as CardKind, ...monthRange(year!, month!) };
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
    ? "O armazenamento do Ponto avulso ainda precisa ser ativado no banco."
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
      setSelectedId(current => current || result[0]?.id || "");
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
    setCard(null);
    setCardLoading(Boolean(id));
    setSelectedId(id);
  }

  async function createCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || creating || dirty) return;
    if (!draft.person_name.trim()) {
      setCreateError("Informe o nome da pessoa.");
      return;
    }
    const range = datesInRange(draft.start, draft.end);
    if (!range.length || range.length > 366) {
      setCreateError("Informe um período válido de até 366 dias.");
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
      setQuery("");
      selectCard(data.id);
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  function removeFromList(id: string) {
    setList(current => current.filter(item => item.id !== id));
    setSelectedId(current => current === id ? "" : current);
  }

  const results = list.filter(item => item.id === selectedId ||
    item.person_name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")));

  return (
    <ScreenShell section="Controle de jornada" title="Ponto avulso" name="Ponto avulso"
      subtitle="Cartões manuais de jornada com apuração própria de horas e saldo."
      actions={canEdit && <button type="button" data-role-sensitive disabled={dirty || listLoading} className={btnPrimary}
        onClick={() => { setDraft(newCardDraft()); setCreateError(""); setOpen(true); }}>
        <Plus className="h-4 w-4" /> Novo cartão
      </button>}>
      <Card className="mb-4 grid items-end gap-3 rounded-2xl p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:p-5">
        <label className={fieldClass}>Buscar por pessoa
          <input type="search" className={inputCls} value={query} onChange={event => setQuery(event.target.value)} placeholder="Nome da pessoa" />
        </label>
        <label className={fieldClass}>Cartão
          <select className={inputCls} value={selectedId} disabled={dirty || listLoading || !list.length}
            onChange={event => selectCard(event.target.value)}>
            <option value="">{listLoading ? "Carregando cartões…" : "Selecione um cartão"}</option>
            {results.map(item => <option key={item.id} value={item.id}>
              {item.person_name} · {formatDate(item.start_date)} a {formatDate(item.end_date)} · {cardKinds[item.kind]}
            </option>)}
          </select>
        </label>
      </Card>
      {error && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
      {(listLoading || cardLoading) && <p role="status" className="py-10 text-center text-sm text-muted-foreground">Carregando ponto avulso…</p>}
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
          onDelete={() => removeFromList(card.id)} />
      )}

      <Dialog open={open} onOpenChange={value => { if (!creating) setOpen(value); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo cartão avulso</DialogTitle>
            <DialogDescription>Escolha a pessoa e as datas que o cartão deve cobrir.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={createCard}>
            <label className={fieldClass}>Nome da pessoa
              <input className={inputCls} value={draft.person_name} required maxLength={140}
                onChange={event => setDraft(current => ({ ...current, person_name: event.target.value }))} />
            </label>
            <label className={fieldClass}>Tipo de controle
              <select className={inputCls} value={draft.kind}
                onChange={event => setDraft(current => ({ ...current, kind: event.target.value as CardKind }))}>
                {Object.entries(cardKinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={fieldClass}>Início
                <input type="date" className={inputCls} required value={draft.start}
                  onChange={event => setDraft(current => ({ ...current, start: event.target.value }))} />
              </label>
              <label className={fieldClass}>Fim
                <input type="date" className={inputCls} required min={draft.start} value={draft.end}
                  onChange={event => setDraft(current => ({ ...current, end: event.target.value }))} />
              </label>
            </div>
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

function CardEditor({ card, canEdit, onDirty, onReload, onDelete }: {
  card: ManualCard; canEdit: boolean; onDirty: (value: boolean) => void;
  onReload: () => void; onDelete: () => void;
}) {
  const [saved, setSaved] = useState(card);
  const [entries, setEntries] = useState(card.entries);
  const [week, setWeek] = useState(() => card.weekday_minutes.map(durationInput));
  const [start, setStart] = useState(card.start_date);
  const [end, setEnd] = useState(card.end_date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
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
            {canEdit && <button type="button" data-role-sensitive className={btnDanger} disabled={busy || dirty || conflict}
              aria-label="Excluir cartão" onClick={() => setDeleteOpen(true)}><Trash2 aria-hidden="true" className="h-4 w-4" /></button>}
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

      <Card className="flex flex-wrap items-end justify-between gap-4 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2 pb-1.5">
          <CalendarRange aria-hidden="true" className="h-4 w-4 text-primary-strong" />
          <h2 className="text-sm font-semibold">Período em exibição</h2>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className={fieldClass}>De
            <input type="date" className={inputCls} value={start} min={card.start_date} max={end || card.end_date}
              onChange={event => {
                const value = event.target.value;
                if (value >= card.start_date && value <= (end || card.end_date)) setStart(value);
              }} />
          </label>
          <label className={fieldClass}>Até
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
        <div className="max-h-[58vh] overflow-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="sticky top-0 z-20 bg-muted">
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-[130px] bg-muted px-3 py-2">Data</th>
                {marks.map((label, index) => <th key={label} scope="col"
                  className={`whitespace-nowrap px-2 py-2 text-center ${index % 2 === 1 ? "border-r border-border/60" : ""}`}>{label}</th>)}
                <th scope="col" className="min-w-[122px] px-2 py-2">Tipo do dia</th>
                <th scope="col" className="px-2 py-2 text-center">Previstas</th>
                <th scope="col" className="px-2 py-2 text-center">Apuradas</th>
                <th scope="col" className="min-w-[96px] px-2 py-2 text-center">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map(row => {
                const balance = row.worked === null || !validSchedule ? null : row.worked - row.expected;
                const dateLabel = formatDate(row.date);
                return (
                  <tr key={row.date} className={row.expected === 0 ? "bg-muted/30" : ""}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-border/60 bg-card px-3 py-2 font-medium whitespace-nowrap">
                      {dateLabel} <span className="ml-1 text-muted-foreground">{weekdayShort(row.date)}</span>
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
                    <td className={`px-2 py-1 text-center font-semibold tabular-nums ${tone(balance ?? 0)}`}>
                      {row.status === "invalid" ? <span className="text-rose-700 dark:text-rose-300">Revisar</span>
                        : row.status === "incomplete" ? <span className="text-amber-700 dark:text-amber-300">Incompleto</span>
                          : formatBalance(balance)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">
          Preencha os pares em ordem. Use Ausência para registrar débito sem batidas, Dispensado para zerar a jornada do dia e Virada de dia para saídas após a meia-noite.
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
