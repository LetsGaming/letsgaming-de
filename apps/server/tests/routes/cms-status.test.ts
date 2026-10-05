import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import type { Source } from "@lg/core";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/env.js";
import { SyncRunner } from "../../src/sync/runner.js";
import { medianDwell, revisionLabel } from "../../src/routes/cms-status.js";

const TOKEN = "c".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };

async function setup(withRunner = true) {
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321" });
  const store = openStore(":memory:");
  const runner = withRunner ? new SyncRunner(store, { githubUsername: "x", useMocks: true }, () => {}) : undefined;
  const app = await buildApp(store, env, runner ? { runner } : {});
  return { app, store, runner };
}

test("status/sync/sections/activity-names require auth", async () => {
  const { app } = await setup();
  for (const url of ["/api/cms/status", "/api/cms/sections", "/api/cms/activity-names"]) {
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 401);
  }
  assert.equal((await app.inject({ method: "POST", url: "/api/cms/sync/github" })).statusCode, 401);
  await app.close();
});

test("status lists never-synced sources, guestbook counts and recent edits", async () => {
  const { app, store } = await setup();
  store.guestbook.add({ name: "A", message: "hi", createdAt: "2026-01-01T00:00:00Z", flags: [], score: 0 });
  store.content.setBio([{ en: "hello" }]);
  store.syncStatus.recordFailure("github", "2026-01-01T00:00:00Z", "boom");

  const res = await app.inject({ method: "GET", url: "/api/cms/status", headers: auth });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  const byId = Object.fromEntries(body.sources.map((s: { id: string }) => [s.id, s]));
  assert.equal(byId.github.state, "error");
  assert.equal(byId.github.lastError, "boom");
  assert.equal(byId.wakapi.state, "never");
  assert.ok(byId.analytics && byId["game-images"] && byId.presence);
  assert.deepEqual(body.guestbook, { pending: 1, approved: 0, rejected: 0 });
  assert.equal(body.recentEdits[0].label, "Bio");
  await app.close();
});

test("layout edits show up in recentEdits alongside content edits", async () => {
  const { app, store } = await setup();
  store.ia.setNav(store.ia.getNav());
  const res = await app.inject({ method: "GET", url: "/api/cms/status", headers: auth });
  const edits = res.json().recentEdits as { label: string; reason: string; kind: string; restorable: boolean }[];
  const ia = edits.find((e) => e.reason === "ia:nav");
  assert.equal(ia?.label, "Page layout");
  assert.deepEqual([ia?.kind, ia?.restorable], ["ia", false]);
  assert.ok(edits.some((e) => e.kind === "content" && e.restorable));
  await app.close();
});

test("manual sync runs a registered source, records it, and rejects unknown ones", async () => {
  const { app } = await setup();
  const ok = await app.inject({ method: "POST", url: "/api/cms/sync/github", headers: auth });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().ok, true);
  const status = (await app.inject({ method: "GET", url: "/api/cms/status", headers: auth })).json();
  const gh = status.sources.find((s: { id: string }) => s.id === "github");
  assert.equal(gh.state, "ok");
  assert.ok(gh.lastSuccessAt);
  assert.equal((await app.inject({ method: "POST", url: "/api/cms/sync/nope", headers: auth })).statusCode, 404);
  await app.close();
});

test("sync without a runner is 503", async () => {
  const { app } = await setup(false);
  const res = await app.inject({ method: "POST", url: "/api/cms/sync/github", headers: auth });
  assert.equal(res.statusCode, 503);
  await app.close();
});

test("concurrent triggers for one source share a single run; failures are recorded", async () => {
  const { store } = await setup(false);
  let calls = 0;
  const source = {
    id: "github",
    schedule: "* * * * *",
    fetch: async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: false, error: { kind: "network", message: "down" } };
    },
  } as unknown as Source;
  const runner = new SyncRunner(store, { githubUsername: "x", useMocks: true }, () => {});
  const [a, b] = await Promise.all([runner.runSource(source, false), runner.runSource(source, false)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(store.syncStatus.all().find((r) => r.source === "github")?.lastError, "down");
});

test("sections: validates input and derives views, median dwell and reach", async () => {
  const { app, store } = await setup();
  const nav = store.ia.getNav();
  const id = nav[0]!.id;
  const bucket = new Date().toISOString().slice(0, 13);
  const hit = (dimension: string, key: string, n = 1) =>
    Array.from({ length: n }, () => ({ bucket, dimension: dimension as "tab", key }));
  store.analytics.recordHourly([
    ...hit("tab", id, 4),
    ...hit("dwell", `${id}|<5s`, 1),
    ...hit("dwell", `${id}|1-3m`, 3),
    ...hit("scroll", `${id}|25`, 2),
    ...hit("session_dwell", "1-3m", 4),
  ]);

  const res = await app.inject({ method: "GET", url: `/api/cms/sections?area=${id}`, headers: auth });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.source, "script");
  assert.equal(body.visits, 4);
  const s = body.sections.find((x: { key: string }) => x.key === id);
  assert.equal(s.views, 4);
  assert.equal(s.medianDwellBucket, "1-3m");
  assert.equal(s.medianDwellSeconds, 120);
  assert.equal(s.reach, 0.5);

  assert.equal((await app.inject({ method: "GET", url: "/api/cms/sections?area=zzz", headers: auth })).statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: "/api/cms/sections?hours=0", headers: auth })).statusCode, 400);
  await app.close();
});

test("medianDwell and revisionLabel", () => {
  assert.equal(medianDwell({}), null);
  assert.deepEqual(medianDwell({ "<5s": 1, "5-15s": 1, "30-60s": 1 }), { seconds: 10, bucket: "5-15s" });
  assert.equal(revisionLabel("restore:7"), "Restored revision 7");
  assert.equal(revisionLabel("links"), "Links");
  assert.equal(revisionLabel("weird"), "weird");
});

test("activity-names lists distinct recorded names with counts", async () => {
  const { app, store } = await setup();
  const obs = (name: string, startedAt: string) =>
    store.sessions.observe({ category: "game", name, startedAt, seenAt: startedAt, startedExact: true });
  obs("Hades", "2026-01-01T10:00:00.000Z");
  obs("Hades", "2026-01-02T10:00:00.000Z");
  obs("Celeste", "2026-01-03T10:00:00.000Z");
  const res = await app.inject({ method: "GET", url: "/api/cms/activity-names", headers: auth });
  assert.deepEqual(res.json().names, [
    { name: "Hades", category: "game", sessions: 2 },
    { name: "Celeste", category: "game", sessions: 1 },
  ]);
  await app.close();
});

test("guestbook: status filter, counts and unapprove", async () => {
  const { app, store } = await setup();
  const add = (name: string) =>
    store.guestbook.add({ name, message: "m", createdAt: "2026-01-01T00:00:00Z", flags: [], score: 0 });
  const a = add("A");
  const b = add("B");
  add("C");
  store.guestbook.setStatus(a, "approved");
  store.guestbook.setStatus(b, "rejected");

  const get = async (q: string) => (await app.inject({ method: "GET", url: `/api/cms/guestbook${q}`, headers: auth })).json();
  const all = await get("");
  assert.equal(all.entries.length, 3);
  assert.equal(all.pending, 1);
  assert.deepEqual(all.counts, { pending: 1, approved: 1, rejected: 1 });
  const approved = await get("?status=approved");
  assert.deepEqual(approved.entries.map((e: { name: string }) => e.name), ["A"]);
  assert.deepEqual(approved.counts, all.counts);
  assert.equal((await app.inject({ method: "GET", url: "/api/cms/guestbook?status=x", headers: auth })).statusCode, 400);

  const un = await app.inject({ method: "POST", url: `/api/cms/guestbook/${a}/unapprove`, headers: auth });
  assert.equal(un.statusCode, 200);
  assert.deepEqual((await get("")).counts, { pending: 2, approved: 0, rejected: 1 });
  await app.close();
});
