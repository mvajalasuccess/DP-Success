import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_periods",
  title: "Listar competências de ponto",
  description: "Lista as competências de fechamento de ponto com período real e status.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).optional().describe("Máximo de resultados (padrão 24)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    const { data, error } = await supabaseForUser(ctx)
      .from("time_periods")
      .select("id,start_date,end_date,status,reference_month,reference_year")
      .order("start_date", { ascending: false })
      .limit(limit ?? 24);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const periods = (data ?? []).map((p) => ({
      id: String(p.id),
      start_date: String(p.start_date),
      end_date: String(p.end_date),
      status: String(p.status),
      reference_month: Number(p.reference_month),
      reference_year: Number(p.reference_year),
    }));
    return { content: [{ type: "text", text: JSON.stringify(periods) }], structuredContent: { periods } };
  },
});
