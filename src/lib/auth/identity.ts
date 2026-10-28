export type AccountIdentity = { name: string; role: string | null };
export type IdentityProfile = { id: string; full_name: string | null; role: string };
export const EMPTY_IDENTITY: AccountIdentity = { name: "Usuário", role: null };

export function identityForAccount(userId: string, profile: IdentityProfile | null): AccountIdentity {
  if (!profile || profile.id !== userId) return EMPTY_IDENTITY;
  return { name: profile.full_name?.trim() || "Usuário", role: profile.role };
}

// Account changes invalidate in-flight reads, even when the previous request finishes last.
export function createIdentityReader(
  readProfile: (id: string) => Promise<IdentityProfile | null>,
  publish: (identity: AccountIdentity) => void,
) {
  let version = 0;
  return {
    async load(userId: string | null) {
      const request = ++version;
      publish(EMPTY_IDENTITY);
      if (!userId) return;
      try {
        const profile = await readProfile(userId);
        if (request === version) publish(identityForAccount(userId, profile));
      } catch {
        if (request === version) publish(EMPTY_IDENTITY);
      }
    },
    dispose() { version++; },
  };
}