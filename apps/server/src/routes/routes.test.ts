import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore, type Store } from "@lg/db";
import { buildApp } from "../app.js";
import { loadEnv } from "../env.js";

const TOKEN = "b".repeat(40);

/** A CMS-enabled app (bearer token) backed by an empty in-memory store. */
async function enabledApp(extra: NodeJS.ProcessEnv = {}) {
  const env = loadEnv({ CMS_TOKEN: TOKEN, WEB_ORIGIN: "http://localhost:4321", ...extra });
  const store = openStore(":memory:");
  const app = await buildApp(store, env);
  (app as unknown as { __store: Store }).__store = store;
  return app;
}
/** Reach the in-memory store an enabledApp() was built with (for seeding). */
function getTestStore(app: Awaited<ReturnType<typeof enabledApp>>): Store {
  return (app as unknown as { __store: Store }).__store;
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

test("cms presence: the category allow-list validates and persists", async () => {
  const app = await enabledApp();
  const auth = { authorization: `Bearer ${TOKEN}` };

  // Unknown category → rejected by the schema.
  const bad = await app.inject({
    method: "PUT",
    url: "/api/cms/presence",
    headers: auth,
    payload: { show: ["game", "bogus"] },
  });
  assert.equal(bad.statusCode, 400);

  const ok = await app.inject({
    method: "PUT",
    url: "/api/cms/presence",
    headers: auth,
    payload: { show: ["game", "steam"] },
  });
  assert.equal(ok.statusCode, 200);

  // Read back through the CMS content endpoint.
  const content = await app.inject({ method: "GET", url: "/api/cms/content", headers: auth });
  assert.deepEqual(content.json().content.presence.show, ["game", "steam"]);
  await app.close();
});

test("cms gallery: references a library asset, resolves to a picture, and deletes", async () => {
  const app = await enabledApp();
  const auth = { authorization: `Bearer ${TOKEN}` };

  // A non-asset reference is rejected by the schema.
  const bad = await app.inject({
    method: "PUT",
    url: "/api/cms/gallery/x1",
    headers: auth,
    payload: { id: "x1", module: "gallery", asset: "/media/x.webp", caption: { en: "" } },
  });
  assert.equal(bad.statusCode, 400);

  // Seed a real image asset directly in the store, then reference it.
  const store = getTestStore(app);
  store.assets.create({ id: "img1", hash: "h".repeat(64), kind: "image", ext: "png", mime: "image/png", bytes: 10, width: 800, height: 600, filename: "p.png", alt: "A cat" });

  const ok = await app.inject({
    method: "PUT",
    url: "/api/cms/gallery/x1",
    headers: auth,
    payload: { id: "x1", module: "gallery", asset: "asset:img1", caption: { en: "Hi" }, sort: 0 },
  });
  assert.equal(ok.statusCode, 200);

  const site = await app.inject({ method: "GET", url: "/api/site" });
  const img = site.json().modules.gallery.data.images[0];
  assert.equal(img.image.kind, "image");
  assert.equal(img.image.src, "/assets/img1");
  assert.ok(img.image.srcsetWebp.includes("/assets/img1/w640.webp 640w"));
  assert.equal(img.caption, "Hi");
  assert.equal(img.image.alt, "Hi"); // caption overrides the asset's alt

  // Usage is now recorded, so the library can warn before deleting the asset.
  assert.deepEqual(store.assets.usagesFor("img1").map((u) => u.context), ["gallery:gallery"]);

  await app.inject({ method: "DELETE", url: "/api/cms/gallery/x1", headers: auth });
  const after = await app.inject({ method: "GET", url: "/api/site" });
  assert.deepEqual(after.json().modules.gallery.data.images, []);
  assert.equal(store.assets.usageCount("img1"), 0); // usage cleared on removal
  await app.close();
});

test("cms gallery instances: create a second gallery, images stay scoped, delete cleans up", async () => {
  const app = await enabledApp();
  const auth = { authorization: `Bearer ${TOKEN}` };
  getTestStore(app).assets.create({ id: "trip1", hash: "t".repeat(64), kind: "image", ext: "png", mime: "image/png", bytes: 10, width: 800, filename: "t.png" });

  const created = await app.inject({
    method: "POST",
    url: "/api/cms/gallery-module",
    headers: auth,
    payload: { heading: { en: "Travel" } },
  });
  assert.equal(created.statusCode, 200);
  const newId = created.json().id as string;
  assert.match(newId, /^gallery-/);

  await app.inject({
    method: "PUT",
    url: "/api/cms/gallery/t1",
    headers: auth,
    payload: { id: "t1", module: newId, asset: "asset:trip1", caption: { en: "Trip" } },
  });
  const site = await app.inject({ method: "GET", url: "/api/site" });
  assert.deepEqual(site.json().modules.gallery.data.images, []); // default gallery still empty

  const protectDefault = await app.inject({ method: "DELETE", url: "/api/cms/gallery-module/gallery", headers: auth });
  assert.equal(protectDefault.statusCode, 400);
  const del = await app.inject({ method: "DELETE", url: `/api/cms/gallery-module/${newId}`, headers: auth });
  assert.equal(del.statusCode, 200);
  const content = await app.inject({ method: "GET", url: "/api/cms/content", headers: auth });
  assert.ok(!content.json().modules.some((m: { id: string }) => m.id === newId));
  assert.ok(!content.json().content.gallery.some((g: { id: string }) => g.id === "t1"));
  await app.close();
});

test("cms layout: reorder, move across areas, hide, and reject empty/duplicate/unknown", async () => {
  const app = await enabledApp();
  const auth = { authorization: `Bearer ${TOKEN}` };

  const before = (await app.inject({ method: "GET", url: "/api/cms/content", headers: auth })).json();
  const life = before.nav.find((n: { id: string }) => n.id === "life");
  const work = before.nav.find((n: { id: string }) => n.id === "work");
  const moved = life.modules[0];

  const ok = await app.inject({
    method: "PUT",
    url: "/api/cms/layout",
    headers: auth,
    payload: {
      order: [
        { area: "life", modules: life.modules.slice(1) },
        { area: "work", modules: [...work.modules, moved] },
      ],
    },
  });
  assert.equal(ok.statusCode, 200);
  const after = (await app.inject({ method: "GET", url: "/api/cms/content", headers: auth })).json();
  assert.ok(after.nav.find((n: { id: string }) => n.id === "work").modules.includes(moved));
  assert.ok(!after.nav.find((n: { id: string }) => n.id === "life").modules.includes(moved));

  // Hiding = leaving a module out of every area (now allowed).
  const life2 = after.nav.find((n: { id: string }) => n.id === "life").modules as string[];
  const hide = await app.inject({
    method: "PUT",
    url: "/api/cms/layout",
    headers: auth,
    payload: { order: [{ area: "life", modules: life2.slice(1) }] },
  });
  assert.equal(hide.statusCode, 200);

  // Emptying an area is refused by nav-lint (no empty leaf).
  const empty = await app.inject({
    method: "PUT",
    url: "/api/cms/layout",
    headers: auth,
    payload: { order: [{ area: "about", modules: [] }] },
  });
  assert.equal(empty.statusCode, 400);

  // Duplicate placement + unknown module + unknown area are refused.
  assert.equal(
    (await app.inject({ method: "PUT", url: "/api/cms/layout", headers: auth, payload: { order: [{ area: "life", modules: ["hobbies", "hobbies"] }] } })).statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ method: "PUT", url: "/api/cms/layout", headers: auth, payload: { order: [{ area: "life", modules: ["nope"] }] } })).statusCode,
    400,
  );
  assert.equal(
    (await app.inject({ method: "PUT", url: "/api/cms/layout", headers: auth, payload: { order: [{ area: "ghost", modules: [] }] } })).statusCode,
    400,
  );
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
