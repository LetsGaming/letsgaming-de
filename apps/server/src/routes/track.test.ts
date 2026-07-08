import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";

function isoDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function appWithStore() {
  const store = openStore(":memory:"); // seeds the launch IA (home/work/life/about)
  const env = loadEnv({ WEB_ORIGIN: "http://localhost:4321" });
  const app = await buildApp(store, env);
  return { app, store };
}

test("records valid engagement events and drops invalid ones", async () => {
  const { app, store } = await appWithStore();
  const res = await app.inject({
    method: "POST",
    url: "/api/track",
    headers: { "content-type": "text/plain" },
    payload: JSON.stringify({
      events: [
        { d: "tab", k: "work" }, // valid
        { d: "transition", k: "home>work" }, // valid
        { d: "dwell", k: "work|30-60s" }, // valid
        { d: "click", k: "contact-cta" }, // valid
        { d: "tab", k: "not-a-section" }, // dropped (unknown section)
        { d: "click", k: "buy-now" }, // dropped (not allow-listed)
        { d: "evil", k: "x" }, // dropped (unknown dimension)
      ],
    }),
  });
  assert.equal(res.statusCode, 204);

  const today = isoDay();
  const tab = store.analytics.top("tab", today, today);
  assert.equal(tab.length, 1);
  assert.equal(tab[0]?.key, "work");
  assert.equal(tab[0]?.count, 1);
  assert.equal(store.analytics.top("transition", today, today)[0]?.key, "home>work");
  assert.equal(store.analytics.top("click", today, today).length, 1);
  await app.close();
});

test("rejects a malformed body (400)", async () => {
  const { app } = await appWithStore();
  const res = await app.inject({
    method: "POST",
    url: "/api/track",
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
    url: "/api/track",
    headers: { "content-type": "text/plain" },
    payload: JSON.stringify({ events: [{ d: "theme", k: "dark" }] }),
  });
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["set-cookie"], undefined);
  await app.close();
});
