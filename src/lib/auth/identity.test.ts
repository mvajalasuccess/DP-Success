import { test } from "node:test";
import assert from "node:assert/strict";
import { createIdentityReader, identityForAccount, type AccountIdentity } from "./identity";

test("Mariana and Carlos resolve only their own account profiles", () => {
  assert.equal(identityForAccount("A", { id: "A", full_name: "Mariana", role: "administrador" }).name, "Mariana");
  assert.equal(identityForAccount("B", { id: "B", full_name: "Carlos", role: "convidado" }).name, "Carlos");
  assert.equal(identityForAccount("B", { id: "A", full_name: "Mariana", role: "administrador" }).name, "Usuário");
});

test("missing and blank names use neutral identity", () => {
  assert.equal(identityForAccount("B", null).name, "Usuário");
  assert.equal(identityForAccount("B", { id: "B", full_name: "  ", role: "convidado" }).name, "Usuário");
});

test("late Mariana response cannot replace Carlos after switching accounts", async () => {
  let resolveA: ((profile: { id: string; full_name: string; role: string }) => void) | undefined;
  let current: AccountIdentity = { name: "Usuário", role: null };
  const reader = createIdentityReader((id) => id === "A"
    ? new Promise(resolve => { resolveA = resolve; })
    : Promise.resolve({ id: "B", full_name: "Carlos", role: "convidado" }), value => { current = value; });
  const pendingA = reader.load("A");
  await reader.load("B");
  assert.equal(current.name, "Carlos");
  assert.ok(resolveA);
  resolveA({ id: "A", full_name: "Mariana", role: "administrador" });
  await pendingA;
  assert.equal(current.name, "Carlos");
  await reader.load(null);
  assert.deepEqual(current, { name: "Usuário", role: null });
  await reader.load("B");
  assert.equal(current.name, "Carlos");
});

test("refresh resolves the same account and disposed reads cannot publish", async () => {
  const emitted: AccountIdentity[] = [];
  const reader = createIdentityReader(async id => ({ id, full_name: "Carlos", role: "convidado" }), value => emitted.push(value));
  await reader.load("B");
  await reader.load("B");
  assert.equal(emitted.at(-1)?.name, "Carlos");
  const pending = reader.load("B");
  reader.dispose();
  await pending;
  assert.equal(emitted.at(-1)?.name, "Usuário");
});