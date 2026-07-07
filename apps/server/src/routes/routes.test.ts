import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";

const TOKEN = "b".repeat(40);

/** A CMS-enabled app (bearer token) backed by an empty in-memory store. */
async function enabledApp(extra: NodeJS.ProcessEnv = {}) {
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321", ...extra });
  return buildApp(openStore(":memory:"), env);
}

test("CMS write is rejected without auth (401)", async () => {
  const app = await enabledApp();
  const res = await app.inject({ method: "GET", url: "/api/cms/me" });
  assert.equal(res.statusCode, 401);
  await app.close();
});

test("CMS write is accepted with the bearer token", async () => {
  const app = await enabledApp();
  const res = await app.inject({
    method: "GET",
    url: "/api/cms/me",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().login, "LetsGaming");
  await app.close();
});

test("CMS fails closed (503) when neither token nor OAuth is configured", async () => {
  const env = loadEnv({ WEB_ORIGIN: "http://localhost:4321" }); // no CMS creds
  const app = await buildApp(openStore(":memory:"), env);
  const res = await app.inject({ method: "GET", url: "/api/cms/me" });
  assert.equal(res.statusCode, 503);
  await app.close();
});

test("media serve blocks path traversal filenames (404)", async () => {
  const app = await enabledApp();
  for (const bad of ["..%2f..%2fetc%2fpasswd", "../../etc/passwd", "foo.png", "a/b.webp"]) {
    const res = await app.inject({ method: "GET", url: `/media/${bad}` });
    assert.equal(res.statusCode, 404, `expected 404 for ${bad}`);
  }
  await app.close();
});

test("security headers are present on responses (QUAL-03)", async () => {
  const app = await enabledApp();
  const res = await app.inject({ method: "GET", url: "/health" });
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["x-frame-options"], "DENY");
  await app.close();
});

test("explicit origin gets credentialed CORS", async () => {
  const app = await enabledApp();
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { origin: "http://localhost:4321" },
  });
  assert.equal(res.headers["access-control-allow-credentials"], "true");
  await app.close();
});

test("WEB_ORIGIN=* never combines credentials with a reflected origin (SEC-02)", async () => {
  const app = await enabledApp({ WEB_ORIGIN: "*" });
  const res = await app.inject({
    method: "GET",
    url: "/health",
    headers: { origin: "http://evil.example" },
  });
  assert.notEqual(res.headers["access-control-allow-credentials"], "true");
  await app.close();
});

test("contact honeypot is silently accepted and relays nothing", async () => {
  const app = await enabledApp({
    SMTP_HOST: "smtp.example.com",
    CONTACT_TO: "you@example.com",
  });
  const res = await app.inject({
    method: "POST",
    url: "/api/contact",
    payload: { name: "Bot", email: "bot@example.com", message: "spam", website: "trap" },
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { ok: true });
  await app.close();
});

test("contact reports not-configured (503) when SMTP is unset", async () => {
  const app = await enabledApp();
  const res = await app.inject({
    method: "POST",
    url: "/api/contact",
    payload: { name: "A", email: "a@example.com", message: "hi" },
  });
  assert.equal(res.statusCode, 503);
  await app.close();
});

test("contact rejects a malformed body via schema (400)", async () => {
  const app = await enabledApp({ SMTP_HOST: "smtp.example.com", CONTACT_TO: "you@example.com" });
  const res = await app.inject({
    method: "POST",
    url: "/api/contact",
    payload: { name: "", email: "not-an-email", message: "" },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});
