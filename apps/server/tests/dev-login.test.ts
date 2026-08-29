import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { buildApp } from "../src/app.js";
import { loadEnv } from "../src/env.js";

/** A non-production app, optionally with TRUST_PROXY, backed by an in-memory store. */
async function devApp(extra: NodeJS.ProcessEnv = {}) {
  const env = loadEnv({ WEB_ORIGIN: "http://localhost:4321", ...extra });
  return buildApp(openStore(":memory:"), env);
}

test("dev login is not registered in production (guard 1)", async () => {
  const env = loadEnv({ NODE_ENV: "production", WEB_ORIGIN: "http://localhost:4321" });
  const app = await buildApp(openStore(":memory:"), env);
  const res = await app.inject({ method: "GET", url: "/auth/dev/login" });
  assert.equal(res.statusCode, 404);
  await app.close();
});

test("dev login accepts a real loopback caller", async () => {
  const app = await devApp();
  // light-my-request's default injected remoteAddress is 127.0.0.1.
  const res = await app.inject({ method: "GET", url: "/auth/dev/login" });
  assert.equal(res.statusCode, 302);
  await app.close();
});

test("dev login rejects a spoofed X-Forwarded-For even with TRUST_PROXY on (guard 2, SEC-audit)", async () => {
  // Before the fix, guard 2 checked `req.ip`, which reflects X-Forwarded-For
  // whenever TRUST_PROXY is set — a non-production, publicly reachable
  // deployment behind a proxy could spoof this header and mint a session.
  // `req.socket.remoteAddress` (the fix) ignores the header entirely, so this
  // must still be rejected as coming from a non-loopback peer.
  const app = await devApp({ TRUST_PROXY: "true" });
  const res = await app.inject({
    method: "GET",
    url: "/auth/dev/login",
    remoteAddress: "203.0.113.7", // attacker's real address (TEST-NET-3)
    headers: { "x-forwarded-for": "127.0.0.1" },
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});
