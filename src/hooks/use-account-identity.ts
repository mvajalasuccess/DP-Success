import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createIdentityReader, EMPTY_IDENTITY } from "@/lib/auth/identity";
import { ensureAccountProfile } from "@/lib/auth/profile";

export function useAccountIdentity() {
  const [identity, setIdentity] = useState(EMPTY_IDENTITY);
  useEffect(() => {
    let disposed = false;
    let authChanged = false;
    const reader = createIdentityReader(async (id) => {
      // Existing sessions also need recovery: they may never revisit the login form.
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user || user.id !== id) return null;
      await ensureAccountProfile(user);
      const { data, error } = await supabase.from("profiles")
        .select("id,full_name,role").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }, setIdentity);
    // Defer database work until the auth callback has released its session lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      reader.dispose();
      setIdentity(EMPTY_IDENTITY);
      setTimeout(() => { if (!disposed) void reader.load(session?.user.id ?? null); }, 0);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!disposed && !authChanged) void reader.load(data.session?.user.id ?? null);
    }).catch(() => { if (!disposed && !authChanged) void reader.load(null); });
    // Name edits in Configurações refresh the signed-in identity immediately.
    const onProfileUpdated = () => {
      void supabase.auth.getSession().then(({ data }) => { if (!disposed) void reader.load(data.session?.user.id ?? null); });
    };
    window.addEventListener("dp:profile-updated", onProfileUpdated);
    return () => { disposed = true; subscription.unsubscribe(); reader.dispose(); window.removeEventListener("dp:profile-updated", onProfileUpdated); };
  }, []);
  return identity;
}