import { test, expect, mock } from "bun:test";
import type { User } from "@supabase/supabase-js";

let storedName: string | null = null;
let requestedId = "";
let savedArgs: Record<string, string> = {};
mock.module("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: (_column: string, id: string) => {
    requestedId = id;
    return { maybeSingle: async () => ({ data: { id, full_name: storedName }, error: null }) };
  } }) }),
  rpc: async (_name: string, args: Record<string, string>) => { savedArgs = args; return { error: null }; },
} }));
const { ensureAccountProfile } = await import("./profile");
const user = { id: "B", email: "account@example.invalid", user_metadata: { full_name: "Carlos" } } as User;

test("login recovers Carlos from his signup metadata when his own profile has no name", async () => {
  storedName = null;
  await ensureAccountProfile(user);
  expect(requestedId).toBe("B");
  expect(savedArgs['_full_name']).toBe("Carlos");
});

test("login preserves an existing stored name rather than replacing it from signup metadata", async () => {
  storedName = "Carlos Silva";
  await ensureAccountProfile(user);
  expect(savedArgs).not.toHaveProperty('_full_name');
  expect(storedName).toBe("Carlos Silva");
});

test("unnamed account without signup name does not invent or save another person's name", async () => {
  storedName = null;
  await ensureAccountProfile({ ...user, user_metadata: {} });
  expect(savedArgs).not.toHaveProperty('_full_name');
});