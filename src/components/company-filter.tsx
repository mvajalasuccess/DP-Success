import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type CompanyOption = { id: string; name: string };

export function CompanyFilter({ value, onChange, className = "" }: { value: string; onChange: (value: string) => void; className?: string }) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await (supabase as any).from("companies").select("id,name").order("name");
      if (active) setCompanies((data ?? []) as CompanyOption[]);
    })();
    return () => { active = false; };
  }, []);
  return <select aria-label="Filtrar por empresa" value={value} onChange={e => onChange(e.target.value)} className={className || "rounded-lg border bg-background px-3 py-2 text-sm"}>
    <option value="">Todas as empresas</option>
    {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
  </select>;
}
