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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json", Allow: "POST, OPTIONS" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");
    const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Configuração do servidor incompleta." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!tokenMatch) {
      return new Response(JSON.stringify({ error: "Não autenticado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: { user: requester }, error: authError } = await adminClient.auth.getUser(tokenMatch[1].trim());

    if (authError || !requester) {
      return new Response(JSON.stringify({ error: "Sessão inválida." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: requesterProfile, error: requesterProfileError } = await adminClient
      .from("profiles")
      .select("role, active")
      .eq("id", requester.id)
      .maybeSingle();

    const canManageUsers =
      !requesterProfileError &&
      requesterProfile?.active === true &&
      (requesterProfile.role === "administrador" || requesterProfile.role === "rh");

    if (!canManageUsers) {
      return new Response(JSON.stringify({ error: "Apenas Administrador e RH ativos podem alterar acessos." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const hasRole = Object.prototype.hasOwnProperty.call(body ?? {}, "role");
    const hasActive = Object.prototype.hasOwnProperty.call(body ?? {}, "active");

    if (!userId || (!hasRole && !hasActive)) {
      return new Response(JSON.stringify({ error: "Informe o usuário e a alteração desejada." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userId === requester.id) {
      return new Response(JSON.stringify({ error: "Você não pode alterar o próprio acesso por esta tela." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const patch: { role?: string; active?: boolean } = {};
    if (hasRole) {
      if (!["administrador", "rh", "consulta"].includes(body.role)) {
        return new Response(JSON.stringify({ error: "Perfil inválido." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      patch.role = body.role;
    }
    if (hasActive) {
      if (typeof body.active !== "boolean") {
        return new Response(JSON.stringify({ error: "Status inválido." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      patch.active = body.active;
    }

    const { data: target, error: targetError } = await adminClient
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) {
      return new Response(JSON.stringify({ error: targetError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!target) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sincroniza o papel nas duas estruturas usadas pelo sistema:
    // profiles controla a interface; user_roles controla políticas de acesso aos dados.
    let previousRoles: { role: string }[] = [];
    if (patch.role) {
      const { data: rolesBefore, error: rolesBeforeError } = await adminClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (rolesBeforeError) {
        return new Response(JSON.stringify({ error: "Não foi possível consultar as permissões atuais." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      previousRoles = rolesBefore ?? [];

      const { error: clearRolesError } = await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (clearRolesError) {
        return new Response(JSON.stringify({ error: "Não foi possível atualizar o papel de acesso." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: insertRoleError } = await adminClient
        .from("user_roles")
        .insert({ user_id: userId, role: patch.role });

      if (insertRoleError) {
        if (previousRoles.length) {
          await adminClient.from("user_roles").insert(previousRoles.map((item) => ({
            user_id: userId,
            role: item.role,
          })));
        }
        return new Response(JSON.stringify({ error: "Não foi possível gravar o novo papel de acesso." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { error: updateError } = await adminClient
      .from("profiles")
      .update(patch)
      .eq("id", userId);

    if (updateError) {
      if (patch.role) {
        await adminClient.from("user_roles").delete().eq("user_id", userId);
        if (previousRoles.length) {
          await adminClient.from("user_roles").insert(previousRoles.map((item) => ({
            user_id: userId,
            role: item.role,
          })));
        }
      }
      return new Response(JSON.stringify({ error: updateError.message }), {
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
      error: error instanceof Error ? error.message : "Erro ao atualizar acesso.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
