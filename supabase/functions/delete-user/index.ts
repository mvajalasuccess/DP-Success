import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST" && req.method !== "OPTIONS") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Allow": "POST, OPTIONS" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      return new Response(JSON.stringify({ error: "Formato de autenticação inválido." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = tokenMatch[1].trim();
    
    const { data: { user: requester }, error: requesterError } =
      await adminClient.auth.getUser(token);

    if (requesterError || !requester) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A tela de Configurações e as políticas atuais usam profiles.role/active.
    // Validamos a autorização pela mesma fonte de verdade antes de excluir.
    const { data: requesterProfile, error: profileError } = await adminClient
      .from("profiles")
      .select("role, active")
      .eq("id", requester.id)
      .maybeSingle();

    const canDeleteUsers =
      !profileError &&
      requesterProfile?.active === true &&
      (requesterProfile.role === "administrador" || requesterProfile.role === "rh");

    if (!canDeleteUsers) {
      return new Response(JSON.stringify({ error: "Apenas Administrador e RH ativos podem excluir usuários." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userId = String(body?.user_id || "");

    if (!userId) {
      return new Response(JSON.stringify({ error: "Usuário não informado." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userId === requester.id) {
      return new Response(JSON.stringify({ error: "Você não pode excluir o próprio usuário." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: targetProfile, error: targetProfileError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (targetProfileError) {
      return new Response(JSON.stringify({ error: targetProfileError.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!targetProfile) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Remove primeiro da autenticação. Depois removemos o perfil explicitamente
    // para não depender de uma FK com ON DELETE CASCADE.
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError) {
      const message = deleteError.message?.toLowerCase() ?? "";
      const authUserAlreadyMissing =
        message.includes("user not found") ||
        message.includes("user doesn't exist") ||
        message.includes("not found");

      // O usuário pode ter sido excluído diretamente pelo Lovable/Supabase.
      // Nesse caso, ainda removemos o registro órfão em profiles.
      if (!authUserAlreadyMissing) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { error: profileDeleteError } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileDeleteError) {
      return new Response(JSON.stringify({
        error: "O acesso foi removido, mas não foi possível remover o perfil: " + profileDeleteError.message,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Erro ao excluir usuário.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
