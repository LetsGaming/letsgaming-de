import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { openDatabase, openStore } from "@lg/db";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";
import { ingestLog } from "../src/analytics/ingest.js";
import { catchUp } from "../src/analytics/rollup.js";

const TOKEN = "c".repeat(40);
const auth = { authorization: `Bearer ${TOKEN}` };

async function appWithStore() {
  const store = openStore(":memory:");
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321" });
  return { app: await buildApp(store, env), store };
}

test("the pulse and analytics endpoints never set a cookie", async () => {
  const { app } = await appWithStore();
  const pulse = await app.inject({
    method: "POST",
    url: "/api/pulse",
    headers: { "content-type": "text/plain" },
    payload: JSON.stringify({ events: [{ d: "viewport", k: "desktop" }, { d: "visit", k: "scroll" }] }),
  });
  assert.equal(pulse.statusCode, 204);
  assert.equal(pulse.headers["set-cookie"], undefined);

  for (const url of ["/api/cms/analytics?hours=24", "/api/cms/analytics?hours=720&tz=Europe/Berlin"]) {
    const res = await app.inject({ method: "GET", url, headers: auth });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["set-cookie"], undefined, url);
  }
  await app.close();
});

test("no analytics table has a column that could hold an identifier", () => {
  const db = openDatabase(":memory:");
  const tables = (
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'analytics_%'").all() as { name: string }[]
  ).map((r) => r.name);
  for (const expected of ["analytics_hourly", "analytics_daily", "analytics_rollup", "analytics_summary", "analytics_rollup_state"]) {
    assert.ok(tables.includes(expected), `${expected} exists`);
  }
  const forbidden = /ip|ua|user_agent|visitor|session_id/;
  for (const table of tables) {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    assert.ok(columns.length > 0, table);
    for (const column of columns) assert.doesNotMatch(column, forbidden, `${table}.${column}`);
  }
  db.close();
});

const IPV4 = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
const IPV6 = /(?:[0-9a-f]{1,4}:){2,}[0-9a-f]{0,4}|::[0-9a-f]{1,4}/i;

test("keys written by ingesting a real log contain no IP-shaped strings", () => {
  const dir = mkdtempSync(join(tmpdir(), "lg-privacy-"));
  const file = join(dir, "access.log");
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";
  writeFileSync(
    file,
    [
      `172.71.164.49 - - [24/Jul/2026:07:57:00 +0200] "GET / HTTP/2.0" 200 45472 "http://letsgaming.de" "${ua}"`,
      `172.70.93.84 - - [24/Jul/2026:04:44:38 +0200] "GET /wp-admin/images/index.php HTTP/2.0" 200 100 "-" "${ua}"`,
      `104.23.168.49 - - [24/Jul/2026:07:33:01 +0200] "GET /.env.bak HTTP/2.0" 200 100 "-" "Mozilla/5.0 (compatible; Google-Extended/1.0; +http://www.google.com/bot.html)"`,
      `2606:4700:3030::6815:1a2b - - [24/Jul/2026:08:00:00 +0200] "GET /code HTTP/2.0" 200 100 "https://www.google.com/" "${ua}"`,
      `203.0.113.7 - - [24/Jul/2026:08:01:00 +0200] "GET /about HTTP/2.0" 200 100 "https://example.org/?ip=203.0.113.7" "${ua}"`,
      "",
    ].join("\n"),
  );
  const store = openStore(join(dir, "t.sqlite"));
  try {
    const result = ingestLog(store, file, "letsgaming.de");
    assert.ok(result.hits > 0, "the fixture produced aggregate hits");
    catchUp(store);

    const keys: string[] = [];
    for (const dimension of ["path", "referrer", "browser", "os", "device", "bot", "probe", "exclusion", "traffic", "source"] as const) {
      keys.push(...store.analytics.topHourly(dimension, "0000", "9999", 5000).map((r) => r.key));
      keys.push(...store.analytics.rollupTop("day", dimension, "0000", "9999", 5000).map((r) => r.key));
    }
    assert.ok(keys.length > 0);
    for (const key of keys) {
      assert.doesNotMatch(key, IPV4, `IPv4-shaped key: ${key}`);
      assert.doesNotMatch(key, IPV6, `IPv6-shaped key: ${key}`);
    }
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
