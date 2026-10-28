import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Never overwrite an existing name on login. Recover signup metadata only for an unnamed profile.
export async function ensureAccountProfile(user: User) {
  const { data: profile, error } = await supabase.from("profiles")
    .select("id,full_name").eq("id", user.id).maybeSingle();
  if (error) throw new Error(error.message);
  const metadataName = typeof user.user_metadata['full_name'] === "string"
    ? user.user_metadata['full_name'].trim() : "";
  const { error: setupError } = await supabase.rpc("ensure_user_setup", {
    ...(user.email ? { _email: user.email } : {}),
    ...(profile?.full_name?.trim() || !metadataName ? {} : { _full_name: metadataName }),
  });
  if (setupError) throw new Error(setupError.message);
}