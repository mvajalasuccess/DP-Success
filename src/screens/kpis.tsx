import { ArrowLeft, TrendingUp, Users, Clock3, CalendarX2, Percent, Wallet } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function fmt(n: number) {
  const sign = n < 0 ? "-" : "+";
  const a = Math.abs(Math.round(n));
  return sign + Math.floor(a / 60) + "h " + String(a % 60).padStart(2, "0") + "m";
}

type Metrics = {
  employees: number;
  credits: number;
  debits: number;
  positive: number;
  negative: number;
  absences: number;
  certificatesMinutes: number;
  interjornada: number;
};

export function Kpis() {
  const [m, setM] = useState<Metrics>({
    employees: 0,
    credits: 0,
    debits: 0,
    positive: 0,
    negative: 0,
    absences: 0,
    certificatesMinutes: 0,
    interjornada: 0,
  });
  const [period, setPeriod] = useState("");
  const [source, setSource] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      const db = supabase as any;

      const [{ data: latestPeriod, error: periodError }, { data: employees, error: employeesError }] =
        await Promise.all([
          db.from("time_periods")
            .select("id,reference_year,reference_month,start_date,end_date")
            .order("end_date", { ascending: false })
            .limit(1)
            .maybeSingle(),
          db.from("employees").select("id").eq("status", "ativo"),
        ]);

      if (periodError || employeesError) {
        setError(periodError?.message ?? employeesError?.message ?? "Não foi possível carregar os KPIs.");
        return;
      }

      if (!latestPeriod) {
        setPeriod("Nenhuma competência cadastrada");
        setM((v) => ({ ...v, employees: employees?.length ?? 0 }));
        return;
      }

      const start = latestPeriod.start_date;
      const end = latestPeriod.end_date;
      setPeriod(`${start.split("-").reverse().join("/")} → ${end.split("-").reverse().join("/")}`);

      const { data: historical, error: historicalError } = await db
        .from("historical_kpi_data")
        .select("employee_id,registration,employee_name,expected_minutes,worked_minutes,absence_quantity,certificate_minutes,debit_minutes,he_60_minutes,he_60_night_minutes,he_100_minutes,he_20_minutes,interjornada_minutes")
        .eq("period_id", latestPeriod.id);

      if (historicalError) {
        setError(historicalError.message);
        return;
      }

      if ((historical ?? []).length > 0) {
        const rows = historical ?? [];
        let credits = 0;
        let debits = 0;
        let positive = 0;
        let negative = 0;
        let absences = 0;
        let certificatesMinutes = 0;
        let interjornada = 0;

        for (const row of rows) {
          const credit =
            Number(row.he_60_minutes || 0) +
            Number(row.he_60_night_minutes || 0) +
            Number(row.he_100_minutes || 0) +
            Number(row.he_20_minutes || 0);
          const debit = Number(row.debit_minutes || 0);
          const balance = credit - debit;
          credits += credit;
          debits += debit;
          absences += Number(row.absence_quantity || 0);
          certificatesMinutes += Number(row.certificate_minutes || 0);
          interjornada += Number(row.interjornada_minutes || 0);
          if (balance > 0) positive += 1;
          if (balance < 0) negative += 1;
        }

        setSource("Histórico importado da BASE");
        setM({
          employees: rows.length,
          credits,
          debits,
          positive,
          negative,
          absences,
          certificatesMinutes,
          interjornada,
        });
        return;
      }

      const [overtime, bank, occurrences, certificates] = await Promise.all([
        db.from("overtime_records").select("minutes,rate_percent,notes").eq("period_id", latestPeriod.id),
        db.from("bank_hours").select("minutes,kind").eq("period_id", latestPeriod.id),
        db.from("occurrences").select("quantity,unit").eq("period_id", latestPeriod.id),
        db.from("medical_certificates").select("days,start_date,end_date").gte("start_date", start).lte("start_date", end),
      ]);

      const operationalError = [overtime, bank, occurrences, certificates].find((x: any) => x.error);
      if (operationalError) {
        setError(operationalError.error.message);
        return;
      }

      let credits = 0;
      let interjornada = 0;
      for (const row of overtime.data ?? []) {
        const minutes = Number(row.minutes || 0);
        if (Number(row.rate_percent) === 50) interjornada += minutes;
        else credits += minutes;
      }

      let debits = 0;
      for (const row of bank.data ?? []) {
        if (row.kind === "debito") debits += Math.abs(Number(row.minutes || 0));
      }

      const absences = (occurrences.data ?? []).reduce(
        (sum: number, row: any) => sum + (String(row.unit).toLowerCase().includes("dia") ? Number(row.quantity || 0) : 0),
        0,
      );

      const certificatesMinutes = (certificates.data ?? []).reduce(
        (sum: number, row: any) => sum + Number(row.days || 0) * 0,
        0,
      );

      setSource("Lançamentos do DP-Success");
      setM({
        employees: employees?.length ?? 0,
        credits,
        debits,
        positive: 0,
        negative: 0,
        absences,
        certificatesMinutes,
        interjornada,
      });
    })();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-[1500px] justify-between">
          <a href="/" className="text-sm text-muted-foreground">
            <ArrowLeft className="inline h-4 w-4 mr-1" />Voltar
          </a>
          <b>DP Success · KPIs</b>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-6 py-7">
        <p className="text-sm text-primary">Gestão</p>
        <h1 className="text-3xl font-bold">KPIs de RH e DP</h1>
        <p className="mt-1 text-sm text-muted-foreground">{period || "Competência atual"}</p>
        {source && <p className="mt-1 text-xs text-muted-foreground">{source}</p>}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5"><Users className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Funcionários</p><p className="text-2xl font-bold">{m.employees}</p></Card>
          <Card className="p-5"><TrendingUp className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Horas extras / créditos</p><p className="text-2xl font-bold">{fmt(m.credits)}</p></Card>
          <Card className="p-5"><Clock3 className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Débitos</p><p className="text-2xl font-bold">{fmt(-m.debits)}</p></Card>
          <Card className="p-5"><CalendarX2 className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Atestados (horas)</p><p className="text-2xl font-bold">{fmt(m.certificatesMinutes)}</p></Card>
          <Card className="p-5"><Wallet className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Saldo positivo</p><p className="text-2xl font-bold">{m.positive}</p><p className="text-xs text-muted-foreground">{m.negative} com saldo negativo</p></Card>
          <Card className="p-5"><Percent className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Faltas registradas</p><p className="text-2xl font-bold">{m.absences}</p><p className="text-xs text-muted-foreground">Quantidade informada na BASE</p></Card>
          <Card className="p-5"><Clock3 className="h-5 w-5 text-primary"/><p className="mt-4 text-sm text-muted-foreground">Interjornada</p><p className="text-2xl font-bold">{fmt(m.interjornada)}</p><p className="text-xs text-muted-foreground">Não entra no saldo</p></Card>
        </div>

        <Card className="mt-6 p-6">
          <p className="text-sm text-muted-foreground">
            Os históricos importados da BASE são consolidados por funcionário e competência. A partir das competências lançadas manualmente, os KPIs passam a usar os registros operacionais do DP-Success.
          </p>
        </Card>
      </main>
    </div>
  );
}
