import { test, expect, mock } from "bun:test";
mock.module("@/integrations/supabase/client", () => ({ supabase: {} }));
const { inviteStatus } = await import("./parametros");
const now = Date.parse("2026-11-11T12:00:00Z");
const future = "2026-11-18T12:00:00Z", past = "2026-11-10T12:00:00Z";
test("unused invite inside its validity is Pendente", () => { expect(inviteStatus({ used_at: null, canceled_at: null, expires_at: future }, now)).toBe("Pendente"); });
test("used invite is Utilizado", () => { expect(inviteStatus({ used_at: past, canceled_at: null, expires_at: future }, now)).toBe("Utilizado"); });
test("invite past its validity is Expirado", () => { expect(inviteStatus({ used_at: null, canceled_at: null, expires_at: past }, now)).toBe("Expirado"); });
test("canceled invite is Cancelado", () => { expect(inviteStatus({ used_at: null, canceled_at: past, expires_at: future }, now)).toBe("Cancelado"); });
