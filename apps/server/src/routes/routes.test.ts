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

test("read API selects the locale from ?locale and falls back on an unknown one", async () => {
  const app = await enabledApp();

  const def = await app.inject({ method: "GET", url: "/api/site" });
  assert.equal(def.statusCode, 200);
  assert.equal(def.json().locale, "en"); // default

  const de = await app.inject({ method: "GET", url: "/api/site?locale=de" });
  assert.equal(de.json().locale, "de");

  const bad = await app.inject({ method: "GET", url: "/api/site?locale=fr" });
  assert.equal(bad.json().locale, "en"); // unknown locale falls back
  await app.close();
});

test("guestbook: submit stores a pending entry (not public) and honeypot is silently dropped", async () => {
  const app = await enabledApp();

  const ok = await app.inject({
    method: "POST",
    url: "/api/guestbook",
    payload: { name: "Visitor", message: "Nice site!" },
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().pending, true);

  // Honeypot hit: accepted but not stored.
  await app.inject({
    method: "POST",
    url: "/api/guestbook",
    payload: { name: "Bot", message: "spam", website: "http://x" },
  });

  // Not visible on the public site yet (pending).
  const site = await app.inject({ method: "GET", url: "/api/site" });
  assert.deepEqual(site.json().modules.guestbook.data.entries, []);

  // Exactly one entry is in the moderation queue (honeypot one was dropped).
  const queue = await app.inject({
    method: "GET",
    url: "/api/cms/guestbook",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(queue.json().pending, 1);
  assert.equal(queue.json().entries[0].name, "Visitor");
  await app.close();
});

test("guestbook: approving in the CMS makes an entry public; moderation needs auth", async () => {
  const app = await enabledApp();
  await app.inject({ method: "POST", url: "/api/guestbook", payload: { name: "Sam", message: "hello" } });

  // Moderation is authed.
  const noAuth = await app.inject({ method: "GET", url: "/api/cms/guestbook" });
  assert.equal(noAuth.statusCode, 401);

  const auth = { authorization: `Bearer ${TOKEN}` };
  const id = (
    await app.inject({ method: "GET", url: "/api/cms/guestbook", headers: auth })
  ).json().entries[0].id;

  const bad = await app.inject({ method: "POST", url: `/api/cms/guestbook/${id}/nope`, headers: auth });
  assert.equal(bad.statusCode, 400);

  const approve = await app.inject({ method: "POST", url: `/api/cms/guestbook/${id}/approve`, headers: auth });
  assert.equal(approve.statusCode, 200);

  const site = await app.inject({ method: "GET", url: "/api/site" });
  const entries = site.json().modules.guestbook.data.entries;
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "Sam");
  assert.ok(entries[0].relative); // relative time pre-computed
  await app.close();
});

test("presence endpoint returns an empty, offline snapshot when unconfigured", async () => {
  const app = await enabledApp(); // no DISCORD_USER_ID set
  const res = await app.inject({ method: "GET", url: "/api/presence" });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json(), { status: "offline", cards: [] });
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
