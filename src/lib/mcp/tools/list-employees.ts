import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_employees",
  title: "Listar funcionários",
  description: "Lista funcionários cadastrados, com filtro opcional por nome e status.",
  inputSchema: {
    search: z.string().optional().describe("Parte do nome do funcionário."),
    status: z.enum(["ativo", "inativo"]).optional().describe("Status do funcionário."),
    limit: z.number().int().min(1).max(200).optional().describe("Máximo de resultados (padrão 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, status, limit }, ctx) => {
    let q = supabaseForUser(ctx)
      .from("employees")
      .select("id,full_name,registration,email,hire_date,termination_date,status")
      .order("full_name")
      .limit(limit ?? 50);
    if (search) q = q.ilike("full_name", `%${search}%`);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const employees = (data ?? []).map((e) => ({
      id: String(e.id),
      full_name: String(e.full_name),
      registration: e.registration ? String(e.registration) : null,
      email: e.email ? String(e.email) : null,
      hire_date: e.hire_date ? String(e.hire_date) : null,
      termination_date: e.termination_date ? String(e.termination_date) : null,
      status: String(e.status),
    }));
    return { content: [{ type: "text", text: JSON.stringify(employees) }], structuredContent: { employees } };
  },
});
