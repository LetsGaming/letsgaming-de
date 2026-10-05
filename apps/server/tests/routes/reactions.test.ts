import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { buildApp } from "../../src/app.js";
import { loadEnv } from "../../src/env.js";
import { RATE_LIMIT } from "../../src/rate-limit.js";

async function appWithStore() {
  const env = loadEnv({ CMS_TOKEN: "b".repeat(40), WEB_ORIGIN: "http://localhost:4321" });
  const store = openStore(":memory:");
  return { app: await buildApp(store, env), store };
}

test("wave: each POST increments the global counter and GET reads it", async () => {
  const { app } = await appWithStore();
  assert.equal((await app.inject({ method: "GET", url: "/api/reactions/wave" })).json().count, 0);
  const first = await app.inject({ method: "POST", url: "/api/reactions/wave" });
  assert.equal(first.statusCode, 200);
  assert.equal(first.json().count, 1);
  const second = await app.inject({ method: "POST", url: "/api/reactions/wave" });
  assert.equal(second.json().count, 2);
  assert.equal((await app.inject({ method: "GET", url: "/api/reactions/wave" })).json().count, 2);
  await app.close();
});

test("wave: the same address is limited, another address is not, and the count stays put", async () => {
  const { app, store } = await appWithStore();
  for (let i = 0; i < RATE_LIMIT.wave; i++) {
    const ok = await app.inject({ method: "POST", url: "/api/reactions/wave", remoteAddress: "10.0.0.1" });
    assert.equal(ok.statusCode, 200);
  }
  const blocked = await app.inject({ method: "POST", url: "/api/reactions/wave", remoteAddress: "10.0.0.1" });
  assert.equal(blocked.statusCode, 429);
  assert.equal(store.reactions.count("wave"), RATE_LIMIT.wave);

  const other = await app.inject({ method: "POST", url: "/api/reactions/wave", remoteAddress: "10.0.0.2" });
  assert.equal(other.statusCode, 200);
  await app.close();
});

test("wave: the count rides along in the site view's hero", async () => {
  const { app } = await appWithStore();
  await app.inject({ method: "POST", url: "/api/reactions/wave" });
  const site = await app.inject({ method: "GET", url: "/api/site" });
  assert.equal(site.json().modules.hero.data.waves, 1);
  await app.close();
});
