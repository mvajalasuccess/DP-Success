import { ArrowLeft, TrendingUp, Users, Clock3, CalendarX2, Percent, Wallet, BriefcaseBusiness, Moon, Sun } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { periodRangeLabel, type Period } from "@/lib/dp-model";

function fmt(n: number) {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(Math.round(n));
  return sign + Math.floor(a / 60) + "h " + String(a % 60).padStart(2, "0") + "m";
}

type Metrics = {
  employees: number;
  expected: number;
  worked: number;
  absences: number;
  certificates: number;
  declarations: number;
  allowances: number;
  debit: number;
  he60: number;
  he60Night: number;
  he100: number;
  he20: number;
  interjornada: number;
  balance: number;
};

const emptyMetrics: Metrics = {
  employees: 0,
  expected: 0,
  worked: 0,
  absences: 0,
  certificates: 0,
  declarations: 0,
  allowances: 0,
  debit: 0,
  he60: 0,
  he60Night: 0,
  he100: 0,
  he20: 0,
  interjornada: 0,
  balance: 0,
};

export function Kpis() {
  const [m, setM] = useState<Metrics>(emptyMetrics);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [period, setPeriod] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const db = supabase as any;
      const [{ data: periodRows, error: periodError }, { data: employees, error: employeesError }] = await Promise.all([
        db.from("time_periods")
          .select("id,reference_year,reference_month,start_date,end_date,status")
          .order("start_date", { ascending: false }),
        db.from("employees").select("id").eq("status", "ativo"),
      ]);

      if (periodError || employeesError) {
        setError(periodError?.message ?? employeesError?.message ?? "Não foi possível carregar os KPIs.");
        return;
      }

      const list = (periodRows ?? []) as Period[];
      setPeriods(list);
      if (list[0]) setSelectedPeriodId(list[0].id);
      else setM({ ...emptyMetrics, employees: employees?.length ?? 0 });
    })();
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) return;
    void (async () => {
      setError("");
      const db = supabase as any;
      const selected = periods.find(p => p.id === selectedPeriodId);
      if (!selected) return;

      const start = selected.start_date;
      const end = selected.end_date;
      setPeriod(periodRangeLabel(selected));

      const { data: historical, error: historicalError } = await db
        .from("historical_kpi_data")
        .select("employee_id,registration,employee_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,declaration_minutes,allowance_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
        .eq("period_id", selected.id);

      if (historicalError) {
        setError(historicalError.message);
        return;
      }

      if ((historical ?? []).length > 0) {
        const next = { ...emptyMetrics, employees: historical.length };
        for (const row of historical) {
          next.expected += Number(row.expected_minutes || 0);
          next.worked += Number(row.worked_minutes || 0);
          next.absences += Number(row.absence_quantity || 0);
          next.certificates += Number(row.certificate_minutes || 0);
          next.declarations += Number(row.declaration_minutes || 0);
          next.allowances += Number(row.allowance_minutes || 0);
          next.debit += Number(row.debit_minutes || 0);
          next.he60 += Number(row.he_60_minutes || 0);
          next.he60Night += Number(row.he_60_night_minutes || 0);
          next.he100 += Number(row.he_100_minutes || 0);
          next.he20 += Number(row.he_20_minutes || 0);
          next.interjornada += Number(row.interjornada_minutes || 0);
        }
        next.balance = next.he60 + next.he60Night + next.he100 + next.he20 - next.debit;
        setSource("Histórico consolidado da aba BASE do Power BI");
        setM(next);
        return;
      }

      const [overtime, bank, occurrences, certificates, timeRecords] = await Promise.all([
        db.from("overtime_records").select("minutes,rate_percent,notes").eq("period_id", selected.id),
        db.from("bank_hours").select("minutes,kind").eq("period_id", selected.id),
        db.from("occurrences").select("quantity,unit").eq("period_id", selected.id),
        db.from("medical_certificates").select("days,start_date,end_date").gte("start_date", start).lte("start_date", end),
        db.from("time_records").select("expected_minutes,worked_minutes").eq("period_id", selected.id),
      ]);

      const operationalError = [overtime, bank, occurrences, certificates, timeRecords].find((x: any) => x.error);
      if (operationalError) {
        setError(operationalError.error.message);
        return;
      }

      const next = { ...emptyMetrics, employees: employees?.length ?? 0 };
      for (const row of timeRecords.data ?? []) {
        next.expected += Number(row.expected_minutes || 0);
        next.worked += Number(row.worked_minutes || 0);
      }
      for (const row of overtime.data ?? []) {
        const minutes = Number(row.minutes || 0);
        const rate = Number(row.rate_percent || 0);
        const notes = String(row.notes || "").toLowerCase();
        if (rate === 50) next.interjornada += minutes;
        else if (rate === 100) next.he100 += minutes;
        else if (rate === 20) next.he20 += minutes;
        else if (notes.includes("60% + 20%") || notes.includes("noturn")) next.he60Night += minutes;
        else next.he60 += minutes;
      }
      for (const row of bank.data ?? []) {
        if (row.kind === "debito") next.debit += Math.abs(Number(row.minutes || 0));
        if (row.kind === "credito") next.he60 += Number(row.minutes || 0);
      }
      for (const row of occurrences.data ?? []) {
        if (String(row.unit).toLowerCase().includes("dia")) next.absences += Number(row.quantity || 0);
      }
      for (const row of certificates.data ?? []) {
        next.certificates += Number(row.days || 0) * 60 * 8.8;
      }
      next.balance = next.he60 + next.he60Night + next.he100 + next.he20 - next.debit;
      setSource("Lançamentos atuais do DP-Success");
      setM(next);
    })();
  }, [selectedPeriodId, periods]);
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] justify-between">
          <a href="/" className="text-sm text-muted-foreground"><ArrowLeft className="inline h-4 w-4 mr-1" />Voltar</a>
          <b>DP Success · KPIs</b>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <p className="text-sm text-primary">Gestão</p>
        <h1 className="text-3xl font-bold">KPIs de RH e DP</h1>
        <div className="mt-3 max-w-md"><label className="grid gap-1 text-sm font-medium">Competência<select className="rounded-lg border bg-background px-3 py-2" value={selectedPeriodId} onChange={e => setSelectedPeriodId(e.target.value)}>{periods.map(p => <option key={p.id} value={p.id}>{periodRangeLabel(p)}</option>)}</select></label></div><p className="mt-2 text-sm text-muted-foreground">{period || "Competência atual"}</p>
        {source && <p className="mt-1 text-xs text-muted-foreground">{source}</p>}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5"><Users className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Funcionários na competência</p><p className="text-2xl font-bold">{m.employees}</p></Card>
          <Card className="p-5"><BriefcaseBusiness className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Horas previstas</p><p className="text-2xl font-bold">{fmt(m.expected)}</p></Card>
          <Card className="p-5"><Clock3 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Horas trabalhadas</p><p className="text-2xl font-bold">{fmt(m.worked)}</p></Card>
          <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Faltas</p><p className="text-2xl font-bold">{m.absences}</p></Card>

          <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Atestados</p><p className="text-2xl font-bold">{fmt(m.certificates)}</p></Card>
          <Card className="p-5"><Percent className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Declaração de horas</p><p className="text-2xl font-bold">{fmt(m.declarations)}</p></Card>
          <Card className="p-5"><Wallet className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Abonos</p><p className="text-2xl font-bold">{fmt(m.allowances)}</p></Card>
          <Card className="p-5"><Clock3 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Débito</p><p className="text-2xl font-bold">{fmt(-m.debit)}</p></Card>

          <Card className="p-5"><TrendingUp className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">HE 60%</p><p className="text-2xl font-bold">{fmt(m.he60)}</p></Card>
          <Card className="p-5"><Moon className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">HE 60% + 20%</p><p className="text-2xl font-bold">{fmt(m.he60Night)}</p></Card>
          <Card className="p-5"><Sun className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">HE 100%</p><p className="text-2xl font-bold">{fmt(m.he100)}</p></Card>
          <Card className="p-5"><Moon className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">HE 20%</p><p className="text-2xl font-bold">{fmt(m.he20)}</p></Card>

          <Card className="p-5"><Clock3 className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Interjornada</p><p className="text-2xl font-bold">{fmt(m.interjornada)}</p><p className="text-xs text-muted-foreground">Fora do saldo</p></Card>
          <Card className="p-5"><Wallet className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">Saldo da competência</p><p className="text-2xl font-bold">{fmt(m.balance)}</p><p className="text-xs text-muted-foreground">Créditos − débito; interjornada não entra</p></Card>
        </div>

        <Card className="mt-6 p-6">
          <p className="text-sm text-muted-foreground">
            Os 18 campos da aba BASE são preservados no histórico consolidado por funcionário e competência. A partir das competências manuais, os KPIs usam os registros operacionais do DP-Success.
          </p>
        </Card>
      </main>
    </div>
  );
}
