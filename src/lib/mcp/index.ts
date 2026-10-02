import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listEmployees from "./tools/list-employees";
import listPeriods from "./tools/list-periods";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "dp-success",
  title: "DP Success",
  version: "0.1.0",
  instructions:
    "Ferramentas do DP Success (RH/Departamento Pessoal). Use `list_employees` para consultar funcionários e `list_periods` para ver as competências de fechamento de ponto.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listEmployees, listPeriods],
});
