import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/env.js";

async function appWithStore() {
  const store = openStore(":memory:"); // seeds the launch IA (home/code/life/about + hidden blog)
  const env = loadEnv({ WEB_ORIGIN: "http://localhost:4321" });
  const app = await buildApp(store, env);
  return { app, store };
}

test("records valid engagement events and drops invalid ones", async () => {
  const { app, store } = await appWithStore();
  const res = await app.inject({
    method: "POST",
    url: "/api/pulse",
    headers: { "content-type": "text/plain" },
    payload: JSON.stringify({
      events: [
        { d: "tab", k: "code" }, // valid
        { d: "transition", k: "home>code" }, // valid
        { d: "dwell", k: "code|30-60s" }, // valid
        { d: "click", k: "contact-cta" }, // valid
        { d: "tab", k: "not-a-section" }, // dropped (unknown section)
        { d: "click", k: "buy-now" }, // dropped (not allow-listed)
        { d: "evil", k: "x" }, // dropped (unknown dimension)
      ],
    }),
  });
  assert.equal(res.statusCode, 204);

  const tab = store.analytics.topHourly("tab", "0000", "9999");
  assert.equal(tab.length, 1);
  assert.equal(tab[0]?.key, "code");
  assert.equal(tab[0]?.count, 1);
  assert.equal(store.analytics.topHourly("transition", "0000", "9999")[0]?.key, "home>code");
  assert.equal(store.analytics.topHourly("click", "0000", "9999").length, 1);
  await app.close();
});

test("rejects a malformed body (400)", async () => {
  const { app } = await appWithStore();
  const res = await app.inject({
    method: "POST",
    url: "/api/pulse",
    headers: { "content-type": "text/plain" },
    payload: "not json",
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("track endpoint needs no auth and sets no cookie", async () => {
  const { app } = await appWithStore();
  const res = await app.inject({
    method: "POST",
    url: "/api/pulse",
    headers: { "content-type": "text/plain" },
    payload: JSON.stringify({ events: [{ d: "theme", k: "dark" }] }),
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["set-cookie"], undefined);
  await app.close();
});

test("clearing analytics removes hourly rows (authed)", async () => {
  const store = openStore(":memory:");
  const token = "t".repeat(40);
  const env = loadEnv({ CMS_TOKEN: token, WEB_ORIGIN: "http://localhost:4321" });
  const app = await buildApp(store, env);
  await app.inject({
    method: "POST",
    url: "/api/pulse",
    headers: { "content-type": "text/plain" },
    payload: JSON.stringify({ events: [{ d: "tab", k: "home" }, { d: "click", k: "contact-cta" }] }),
  });
  assert.equal(store.analytics.topHourly("tab", "0000", "9999").length, 1);

  const res = await app.inject({
    method: "POST",
    url: "/api/cms/analytics/clear",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: JSON.stringify({ range: "all" }),
  });
  assert.equal(res.statusCode, 200);
  assert.equal(store.analytics.topHourly("tab", "0000", "9999").length, 0);
  assert.equal(store.analytics.topHourly("click", "0000", "9999").length, 0);

  // clear requires auth
  const noauth = await app.inject({
    method: "POST",
    url: "/api/cms/analytics/clear",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ range: "all" }),
  });
  assert.equal(noauth.statusCode, 401);
  await app.close();
});

async function postEvents(app: Awaited<ReturnType<typeof appWithStore>>["app"], events: unknown[]) {
  return app.inject({
    method: "POST",
    url: "/api/pulse",
    headers: { "content-type": "text/plain" },
    payload: JSON.stringify({ events }),
  });
}

test("records module and visit dimensions, drops unknown module ids", async () => {
  const { app, store } = await appWithStore();
  const [first, second] = store.ia.getModules();
  assert.ok(first && second);
  const res = await postEvents(app, [
    { d: "visit", k: "scroll" },
    { d: "module", k: first.id },
    { d: "module_entry", k: first.id },
    { d: "module_dwell", k: `${first.id}|5-15s` },
    { d: "module_flow", k: `${first.id}>${second.id}` },
    { d: "module_exit", k: second.id },
    { d: "session_modules", k: "2" },
    { d: "module", k: "no-such-module" },
    { d: "visit", k: "bogus" },
  ]);
  assert.equal(res.statusCode, 204);
  for (const d of ["visit", "module", "module_entry", "module_dwell", "module_flow", "module_exit", "session_modules"] as const) {
    assert.equal(store.analytics.topHourly(d, "0000", "9999").length, 1, d);
  }
  assert.equal(store.analytics.topHourly("module", "0000", "9999")[0]?.key, first.id);
  await app.close();
});

test("only the first 80 events of a beacon are read", async () => {
  const { app, store } = await appWithStore();
  const events = [
    ...Array.from({ length: 80 }, () => ({ d: "click", k: "contact-cta" })),
    { d: "session_tabs", k: "1" },
  ];
  assert.equal((await postEvents(app, events)).statusCode, 204);
  assert.equal(store.analytics.topHourly("click", "0000", "9999")[0]?.count, 80);
  assert.equal(store.analytics.topHourly("session_tabs", "0000", "9999").length, 0);
  await app.close();
});
