import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";

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
    url: "/api/pulse",
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

  const tab = store.analytics.topHourly("tab", "0000", "9999");
  assert.equal(tab.length, 1);
  assert.equal(tab[0]?.key, "work");
  assert.equal(tab[0]?.count, 1);
  assert.equal(store.analytics.topHourly("transition", "0000", "9999")[0]?.key, "home>work");
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
