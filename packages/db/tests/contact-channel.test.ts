import { resolveSiteView } from "@lg/core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSiteView, openStore } from "../src/index.js";

/**
 * Which contact affordance a deployment gets.
 *
 * The module used to render its form unconditionally and discover on submit that
 * no relay existed — a form that looked like it worked, took a typed message, and
 * only then said "not configured". The capability is knowable at render time, so
 * these pin the three states it resolves to.
 *
 * `buildSiteView` reads the environment for this, and the relay condition it
 * applies (`SMTP_HOST` *and* `CONTACT_TO`) is a deliberate copy of the server's
 * `ServerEnv` — `@lg/db` can't import the server without depending on it. Copies
 * drift, so the last test here fails if they stop agreeing.
 */

/** Run `fn` with a patched environment, restoring whatever was there before. */
async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const before = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of before) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const CLEAR = { SMTP_HOST: undefined, CONTACT_TO: undefined, CONTACT_PUBLIC_EMAIL: undefined };

async function channelFor(vars: Record<string, string | undefined>) {
  const store = openStore(":memory:");
  return withEnv({ ...CLEAR, ...vars }, async () => {
    const view = await buildSiteView(store, { locale: "en", mediaDir: "" });
    const contact = view.modules.contact;
    assert.equal(contact?.kind, "contact");
    return contact.kind === "contact" ? contact.data.channel : undefined;
  });
}

test("a configured relay renders the form", async () => {
  const channel = await channelFor({ SMTP_HOST: "smtp.example.com", CONTACT_TO: "me@example.com" });
  assert.deepEqual(channel, { kind: "form" });
});

test("no relay but a published address renders a mailto", async () => {
  const channel = await channelFor({ CONTACT_PUBLIC_EMAIL: "hi@example.com" });
  assert.deepEqual(channel, { kind: "mailto", email: "hi@example.com" });
});

test("CONTACT_TO is the fallback address when nothing is published explicitly", async () => {
  // Host missing, so there's no relay — but the destination address is still a
  // real way to reach the owner, and it's what the form would have used.
  const channel = await channelFor({ CONTACT_TO: "me@example.com" });
  assert.deepEqual(channel, { kind: "mailto", email: "me@example.com" });
});

test("CONTACT_PUBLIC_EMAIL wins over CONTACT_TO, so the relay inbox can stay private", async () => {
  const channel = await channelFor({ CONTACT_TO: "inbox@example.com", CONTACT_PUBLIC_EMAIL: "hi@example.com" });
  assert.deepEqual(channel, { kind: "mailto", email: "hi@example.com" });
});

test("neither configured resolves to no channel at all", async () => {
  assert.deepEqual(await channelFor({}), { kind: "none" });
});

test("an empty value is unset, not an address", async () => {
  // Compose passes `${VAR:-}` through as "", so truthiness alone would publish a
  // `mailto:` with nothing after the colon.
  assert.deepEqual(await channelFor({ CONTACT_TO: "   " }), { kind: "none" });
});

test("a form is offered whenever the relay works, never a mailto as well", async () => {
  // Two ways to do one thing under one heading, and the mailto is the worse of
  // them whenever the form works — so the relay wins outright rather than adding.
  const channel = await channelFor({
    SMTP_HOST: "smtp.example.com",
    CONTACT_TO: "me@example.com",
    CONTACT_PUBLIC_EMAIL: "hi@example.com",
  });
  assert.deepEqual(channel, { kind: "form" });
});

test("the relay condition matches the server's definition of configured", async () => {
  // `ServerEnv` builds `smtp` only when SMTP_HOST and CONTACT_TO are both present.
  // This is that rule, asserted from the other side of the copy: each half alone
  // must NOT produce a form, or the page would offer one to an endpoint that
  // answers 503.
  assert.notDeepEqual(await channelFor({ SMTP_HOST: "smtp.example.com" }), { kind: "form" });
  assert.notDeepEqual(await channelFor({ CONTACT_TO: "me@example.com" }), { kind: "form" });
  assert.deepEqual(
    await channelFor({ SMTP_HOST: "smtp.example.com", CONTACT_TO: "me@example.com" }),
    { kind: "form" },
  );
});

test("the resolver stays pure — an explicit channel overrides the environment", async () => {
  // The env read is a default, not a rule: a caller that knows better (a test, a
  // static build) can say so, and nothing consults `process.env` behind its back.
  const view = resolveSiteView({
    content: {
      meta: { name: "D", handle: "x", location: { en: "DE" }, role: { en: "dev" } },
      headline: { before: { en: "a" }, highlight: { en: "b" }, after: { en: "c" } },
      lede: { en: "l" },
      status: { verb: { en: "v" }, now: { en: "n" } },
      bio: [],
      links: [],
      projects: [],
      hobbies: [],
      now: [],
    },
    source: {},
    nav: [{ id: "about", label: { en: "About" }, modules: ["contact"] }],
    modules: [{ id: "contact", kind: "contact", heading: { en: "Get in touch" } }],
    contact: { relay: false, email: "explicit@example.com" },
  });
  const contact = view.modules.contact;
  assert.equal(contact?.kind, "contact");
  if (contact.kind === "contact") {
    assert.deepEqual(contact.data.channel, { kind: "mailto", email: "explicit@example.com" });
  }
});
