import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSiteView, safeHref } from "../src/resolve.js";
import { en } from "../src/i18n.js";
import type { SiteContent } from "../src/content.js";
import type { ModuleDescriptor } from "../src/modules.js";
import type { NavNode } from "../src/nav.js";
import type { GitHubData } from "../src/source.js";

test("resolver localizes to the requested locale and falls back to English per-field", () => {
  const content: SiteContent = {
    meta: {
      name: "D",
      handle: "LetsGaming",
      location: { en: "Germany", de: "Deutschland" },
      role: { en: "web developer" }, // no German — must fall back
    },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"),
    status: { verb: en("building"), now: en("x") },
    bio: [{ en: "English bio", de: "Deutsche Bio" }],
    links: [],
    projects: [],
    hobbies: [],
    now: [],
  };
  const nav: NavNode[] = [{ id: "about", label: { en: "About", de: "Über" }, modules: ["bio"] }];
  const modules: ModuleDescriptor[] = [{ id: "bio", kind: "bio", heading: en("About") }];

  const view = resolveSiteView({ content, source: {}, nav, modules, locale: "de" });
  assert.equal(view.locale, "de");
  assert.equal(view.meta.location, "Deutschland"); // translated
  assert.equal(view.meta.role, "web developer"); // fell back to English
  assert.equal(view.nav[0]?.label, "Über"); // nav label translated
  const bio = view.modules["bio"];
  if (!bio || bio.kind !== "bio") throw new Error("expected a bio module");
  const first = bio.data.blocks[0];
  assert.equal(first?.kind === "text" ? first.text : "", "Deutsche Bio");
});

test("resolver folds Wakapi into coding and presence config", () => {
  const content: SiteContent = {
    meta: { name: "D", handle: "LetsGaming", location: en("DE"), role: en("dev") },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"),
    status: { verb: en("building"), now: en("x") },
    bio: [en("p1")],
    links: [],
    projects: [],
    hobbies: [],
    now: [],
  };
  const nav: NavNode[] = [{ id: "life", label: en("Life"), modules: ["coding", "presence"] }];
  const modules: ModuleDescriptor[] = [
    { id: "coding", kind: "coding", heading: en("Coding") },
    { id: "presence", kind: "presence", heading: en("Presence") },
  ];

  const view = resolveSiteView({
    content: { ...content, presence: { show: ["game"] } },
    nav,
    modules,
    source: {
      wakapi: { range: "last 7 days", totalSeconds: 7200, languages: [{ name: "TS", pct: 100, seconds: 7200 }] },
    },
  });

  const coding = view.modules["coding"];
  if (!coding || coding.kind !== "coding") throw new Error("expected coding module");
  assert.equal(coding.data.coding?.totalHours, 2);
  assert.equal(coding.data.coding?.languages[0]?.hours, 2);

  const presence = view.modules["presence"];
  if (!presence || presence.kind !== "presence") throw new Error("expected presence module");
  // "game" is shown → the widget is told to poll. No Discord id is involved
  // here: enablement is a CMS display decision, decoupled from whether the server
  // is configured to reach Lanyard.
  assert.equal(presence.data.enabled, true);
  // Presence is present-tense and entirely live — no history reaches it. The
  // recently-played shelf and the ledger live in the playtime module.
  assert.ok(!("recent" in presence.data), "no history in the presence card");
  assert.ok(!("playtime" in presence.data), "no playtime in the presence card");
  // The client is NOT given the Discord id or the category list.
  assert.ok(!("discordId" in presence.data) && !("show" in presence.data));
});

test("presence enablement: driven by the allow-list, not by any Discord id", () => {
  const base = {
    content: {
      meta: { name: "D", handle: "LetsGaming", location: en("DE"), role: en("dev") },
      headline: { before: en("a "), highlight: en("b"), after: en(" c") },
      lede: en("l"),
      status: { verb: en("building"), now: en("x") },
      bio: [en("p")],
      links: [],
      projects: [],
      hobbies: [],
      now: [],
    } as SiteContent,
    nav: [{ id: "life", label: en("Life"), modules: ["presence"] }] as NavNode[],
    modules: [{ id: "presence", kind: "presence", heading: en("P") }] as ModuleDescriptor[],
    source: {},
  };

  // A category is shown → enabled. No presence input at all: the resolver takes
  // no Discord id, so enablement can't depend on one.
  const gameOnly = resolveSiteView({
    ...base,
    content: { ...base.content, presence: { show: ["game"] } },
  });
  const m1 = gameOnly.modules["presence"];
  if (!m1 || m1.kind !== "presence") throw new Error("expected presence");
  assert.equal(m1.data.enabled, true);

  // The decoupling, stated as a test: a live category is enough, with no Discord
  // id anywhere in the resolve. (Under the old design this same input resolved to
  // `live: false`; that env coupling is gone.)
  const noPresenceInput = resolveSiteView({
    ...base,
    content: { ...base.content, presence: { show: ["music", "custom"] } },
  });
  const m3 = noPresenceInput.modules["presence"];
  if (!m3 || m3.kind !== "presence") throw new Error("expected presence");
  assert.equal(m3.data.enabled, true);
});

test("safeHref passes through http(s), mailto, and site-relative URLs", () => {
  assert.equal(safeHref("https://example.com/x"), "https://example.com/x");
  assert.equal(safeHref("http://example.com"), "http://example.com");
  assert.equal(safeHref("mailto:me@example.com"), "mailto:me@example.com");
  assert.equal(safeHref("/work"), "/work");
});

test("activity merges commits and releases/PRs/gists into one newest-first stream", () => {
  const content: SiteContent = {
    meta: { name: "D", handle: "LetsGaming", location: en("DE"), role: en("dev") },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"),
    status: { verb: en("building"), now: en("x") },
    bio: [en("p1")],
    links: [],
    projects: [],
    hobbies: [],
    now: [],
  };
  const nav: NavNode[] = [{ id: "code", label: en("Code"), modules: ["activity"] }];
  const modules: ModuleDescriptor[] = [{ id: "activity", kind: "activity", heading: en("Recent") }];
  const github: GitHubData = {
    stats: { repos: 1, commitsYear: 1, commitsAllTime: 1, longestStreakDays: 1 },
    languages: [],
    contributions: [],
    events: [
      { type: "commit", text: "Pushed to c", meta: "m", at: "2026-01-07T00:00:00Z" },
    ],
    releases: [
      { repo: "a", name: "R", tagName: "v1", url: "https://x/r", publishedAt: "2026-01-05T00:00:00Z" },
    ],
    mergedPrs: [{ repo: "b", title: "T", url: "https://x/p", mergedAt: "2026-01-09T00:00:00Z" }],
    gists: [{ description: "G", url: "https://x/g", files: 2, updatedAt: "2026-01-01T00:00:00Z" }],
  };

  const view = resolveSiteView({
    content,
    source: { github },
    nav,
    modules,
    now: new Date("2026-01-10T00:00:00Z"),
  });

  const mod = view.modules["activity"];
  if (!mod || mod.kind !== "activity") throw new Error("expected an activity module");
  const items = mod.data.events;
  // A release is an event: "Recently shipped" was a second feed sorted by the
  // same key, so both lists land in one stream.
  assert.equal(items.length, 4);
  // Newest-first across every type: PR (01-09) > commit (01-07) > release (01-05) > gist (01-01).
  assert.deepEqual(
    items.map((i) => i.type),
    ["pr", "commit", "release", "gist"],
  );
  assert.match(items[0]!.text, /Merged/);
  assert.equal(items[2]?.meta, "v1"); // release tag
  assert.equal(items[3]?.meta, "2 files"); // gist file count
  assert.ok(items[0]!.relative.length > 0); // relative time pre-computed
  assert.equal(mod.data.sources[0], "GitHub");
});

test("safeHref neutralizes script-bearing and unknown schemes (SEC-04)", () => {
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.equal(safeHref("JavaScript:alert(1)"), "#");
  assert.equal(safeHref("data:text/html,<script>alert(1)</script>"), "#");
  assert.equal(safeHref("  javascript:alert(1)  "), "#");
  assert.equal(safeHref(undefined), "#");
  assert.equal(safeHref(""), "#");
});

test("resolver expands asset refs: hero avatar + SVG link icon", () => {
  const content: SiteContent = {
    meta: {
      name: "D",
      handle: "LetsGaming",
      location: en("DE"),
      role: en("dev"),
      avatar: "asset:av1",
    },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"),
    status: { verb: en("building"), now: en("x") },
    bio: [en("p1")],
    links: [
      { id: "gh", label: en("GitHub"), href: "https://github.com/x", icon: "gh" }, // built-in
      { id: "co", label: en("Co"), href: "https://co", icon: "asset:ic1" }, // uploaded svg
    ],
    projects: [],
    hobbies: [],
    now: [],
  };
  const nav: NavNode[] = [{ id: "home", label: en("Home"), modules: ["hero"] }];
  const modules: ModuleDescriptor[] = [{ id: "hero", kind: "hero", heading: en("Home") }];
  const assets = new Map([
    ["av1", { id: "av1", kind: "image" as const, width: 1200, variantWidths: [320, 640, 960] }],
    ["ic1", { id: "ic1", kind: "svg" as const, svg: "<svg><path/></svg>" }],
  ]);

  const view = resolveSiteView({ content, source: {}, nav, modules, assets });
  const hero = view.modules["hero"];
  if (!hero || hero.kind !== "hero") throw new Error("expected hero");
  assert.equal(hero.data.avatar?.kind, "image");
  assert.equal(hero.data.avatar?.src, "/assets/av1");
  // Built-in icon stays a name; uploaded icon becomes inline svg.
  const [gh, co] = hero.data.links;
  assert.equal(gh?.icon, "gh");
  assert.equal(gh?.iconSvg, undefined);
  assert.equal(co?.icon, undefined);
  assert.equal(co?.iconSvg, "<svg><path/></svg>");
});

test("freshness: data past its source's TTL renders stale, not fresh", () => {
  const content: SiteContent = {
    meta: { name: "D", handle: "LetsGaming", location: en("DE"), role: en("dev") },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"),
    status: { verb: en("building"), now: en("x") },
    bio: [en("p1")],
    links: [],
    projects: [],
    hobbies: [],
    now: [],
  };
  const nav: NavNode[] = [{ id: "home", label: en("Home"), modules: ["glance"] }];
  const modules: ModuleDescriptor[] = [{ id: "glance", kind: "glance", heading: en("At a glance") }];
  const github: GitHubData = {
    stats: { repos: 1, commitsYear: 1, commitsAllTime: 1, longestStreakDays: 1 },
    languages: [],
    contributions: [],
    events: [],
  };
  const now = new Date("2026-01-10T12:00:00Z");
  const build = (syncedAt: string) =>
    resolveSiteView({
      content,
      source: { github },
      nav,
      modules,
      now,
      freshness: { syncedAt: { github: syncedAt }, ttl: { github: 60 * 60 * 1000 } },
    });

  const fresh = build("2026-01-10T11:30:00Z"); // 30m old, TTL 1h
  const g1 = fresh.modules["glance"];
  if (!g1 || g1.kind !== "glance") throw new Error("expected glance");
  assert.equal(g1.data.freshness?.state, "fresh");

  const stale = build("2026-01-10T09:00:00Z"); // 3h old, TTL 1h
  const g2 = stale.modules["glance"];
  if (!g2 || g2.kind !== "glance") throw new Error("expected glance");
  // The site's claim is that it updates itself, so old data must say so rather
  // than wear the fresh state.
  assert.equal(g2.data.freshness?.state, "stale");
  assert.ok(g2.data.freshness?.relative);

  // No sync has ever landed: a real state, not an error.
  const never = resolveSiteView({ content, source: {}, nav, modules, now });
  const g3 = never.modules["glance"];
  if (!g3 || g3.kind !== "glance") throw new Error("expected glance");
  assert.equal(g3.data.freshness?.state, "never");
});

// ── in-page targets are URLs ─────────────────────────────────────────────────

/** A minimal site with a hero on `/` and a contact module in `about`. */
const baseInput = {
  content: {
    meta: { name: "D", handle: "LetsGaming", location: en("DE"), role: en("dev") },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"),
    status: { verb: en("building"), now: en("x") },
    bio: [en("p1")],
    links: [] as SiteContent["links"],
    projects: [],
    hobbies: [],
    now: [],
  } satisfies SiteContent,
  source: {},
  nav: [
    { id: "home", label: en("Home"), modules: ["hero"] },
    { id: "about", label: en("About"), modules: ["bio", "contact"] },
  ] satisfies NavNode[],
  modules: [
    { id: "hero", kind: "hero", heading: en("Hi") },
    { id: "bio", kind: "bio", heading: en("About") },
    { id: "contact", kind: "contact", heading: en("Contact") },
  ] satisfies ModuleDescriptor[],
  locale: "en" as const,
};

test("an in-page target resolves to the URL that shows it", () => {
  // The seed's hero CTA is `href: "#contact"`, and `contact` is a module in the
  // `about` area. That's `/about#contact` — a real link, which a browser follows
  // with no JavaScript, a person can middle-click, and a crawler can index.
  const view = resolveSiteView({
    ...baseInput,
    content: {
      ...baseInput.content,
      links: [
        { id: "contact", label: en("Get in touch"), href: "#contact", primary: true },
        { id: "gh", label: en("GitHub"), href: "https://github.com/LetsGaming" },
      ],
    },
  });
  const hero = view.modules.hero;
  assert.equal(hero?.kind, "hero");
  const links = hero.kind === "hero" ? hero.data.links : [];
  assert.equal(links.find((l) => l.id === "contact")?.href, "/about#contact");
  // An external href is untouched.
  assert.equal(links.find((l) => l.id === "gh")?.href, "https://github.com/LetsGaming");
});

test("a fragment is not a script sink, and is not treated as one", () => {
  // `safeHref` used to reject `#contact` because HREF_PATTERN allowed only
  // http(s)/mailto/`/`. It returned "#", so the CMS's own default CTA pointed
  // nowhere — and HeroSection's click handler swallowed the click, so nobody saw.
  // A fragment has no scheme; it was never what that pattern guards against.
  assert.equal(safeHref("#contact"), "#contact");
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.equal(safeHref("data:text/html,<script>"), "#");
  assert.equal(safeHref("  #contact  "), "#contact");
});

test("a target in a draft area stays inert rather than 404ing", () => {
  // visibleNav strips hidden nodes before targetHref sees them, so a link into an
  // unpublished area falls through to `#target` — which goes nowhere, honestly,
  // instead of to a URL that 404s. (The field is `hidden`, not `draft`; my first
  // draft of this test said `draft: true` and the resolver happily produced
  // `/secret#bio` — an excess property on an object literal in a spread isn't
  // checked, so the test lied in the same way the code used to.)
  const view = resolveSiteView({
    ...baseInput,
    nav: [
      { id: "home", label: en("Home"), modules: ["hero"] },
      { id: "secret", label: en("Secret"), modules: ["bio"], hidden: true },
    ],
    content: {
      ...baseInput.content,
      links: [{ id: "l", label: en("Peek"), href: "#bio" }],
    },
  });
  const hero = view.modules.hero;
  const links = hero?.kind === "hero" ? hero.data.links : [];
  assert.equal(links[0]?.href, "#bio");
});

test("hidden games are dropped from the recently-played chart but not from the data", () => {
  const content: SiteContent = {
    meta: { name: "D", handle: "LetsGaming", location: en("DE"), role: en("dev") },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"),
    status: { verb: en("building"), now: en("x") },
    bio: [en("p")],
    links: [],
    projects: [],
    hobbies: [],
    now: [],
  };
  const nav: NavNode[] = [{ id: "life", label: en("Life"), modules: ["playtime"] }];
  const modules: ModuleDescriptor[] = [{ id: "playtime", kind: "playtime", heading: en("Time played") }];

  const view = resolveSiteView({
    content: {
      ...content,
      // hide Doom; games shown. The hidden-games filter guards the playtime
      // module's recently-played shelf.
      presence: { show: ["game"], hidden: ["doom"] },
    },
    nav,
    modules,
    source: {},
    // observed games — one of them hidden, matched case-insensitively.
    playtime: [
      { name: "Counter-Strike 2", minutes: 120, sessions: 4, exact: true },
      { name: "Minecraft", minutes: 60, sessions: 2, exact: true },
      { name: "DOOM", minutes: 45, sessions: 1, exact: true },
    ],
  });

  const playtime = view.modules["playtime"];
  if (!playtime || playtime.kind !== "playtime") throw new Error("expected playtime");
  const names = playtime.data.recent.map((g) => g.name);
  assert.ok(names.includes("Counter-Strike 2"), "shown game survives");
  assert.ok(names.includes("Minecraft"), "shown game survives");
  assert.ok(!names.some((n) => n.toLowerCase() === "doom"), "Doom is hidden regardless of casing");
});

test("music module: shapes history into the view, passing art through and empty-safe", () => {
  const content: SiteContent = {
    meta: { name: "D", handle: "LetsGaming", location: en("Germany"), role: en("dev") },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"), status: { verb: en("x"), now: en("y") },
    bio: [], links: [], projects: [], hobbies: [], now: [],
  };
  const nav: NavNode[] = [{ id: "life", label: en("Life"), modules: ["music"] }];
  const modules: ModuleDescriptor[] = [{ id: "music", kind: "music", heading: en("Listening") }];

  // with data
  const view = resolveSiteView({
    content, source: {}, nav, modules, locale: "en",
    musicHistory: {
      topSongs: [{ name: "Von Dutch", by: "Charli xcx", minutes: 214, plays: 47, artUrl: "https://i.scdn.co/image/x" }],
      topArtists: [{ name: "Charli xcx", minutes: 612, plays: 133 }],
      topAlbums: [{ name: "Brat", by: "Charli xcx", minutes: 588, plays: 128, artUrl: "https://i.scdn.co/image/b" }],
      ledger: [{ day: "2026-07-10", minutes: 60 }, { day: "2026-07-11", minutes: 120 }],
      trackCount: 173, artistCount: 42, since: "2026-07-10",
    },
  });
  const m = view.modules["music"];
  if (!m || m.kind !== "music") throw new Error("expected a music module");
  assert.equal(m.data.totalHours, 3, "180 min ledger → 3h");
  assert.equal(m.data.trackCount, 173);
  assert.equal(m.data.artistCount, 42);
  assert.equal(m.data.topSongs[0]?.artUrl, "https://i.scdn.co/image/x", "song art survives resolve");
  assert.equal(m.data.topArtists[0]?.artUrl, undefined, "artist without art stays undefined");
  assert.equal(m.data.since, "2026-07-10");
  assert.equal(m.data.initialCount, 5, "default initial count when content has no music setting");
  assert.equal(m.data.maxCount, 15, "default max count when content has no music setting");

  // CMS-configured display counts flow through to the view. (The lists are capped
  // to maxCount server-side in the db query; the resolver just carries the numbers
  // the frontend needs to collapse/expand.)
  const configured = resolveSiteView({
    content: { ...content, music: { initialCount: 3, maxCount: 8 } },
    source: {}, nav, modules, locale: "en",
    musicHistory: { topSongs: [], topArtists: [], topAlbums: [], ledger: [], trackCount: 0, artistCount: 0 },
  });
  const cm = configured.modules["music"];
  if (!cm || cm.kind !== "music") throw new Error("expected a music module");
  assert.equal(cm.data.initialCount, 3, "CMS initial count reaches the view");
  assert.equal(cm.data.maxCount, 8, "CMS max count reaches the view");

  // absent history → empty module, not an error
  const empty = resolveSiteView({ content, source: {}, nav, modules, locale: "en" });
  const em = empty.modules["music"];
  if (!em || em.kind !== "music") throw new Error("expected a music module");
  assert.equal(em.data.totalHours, 0);
  assert.equal(em.data.trackCount, 0);
  assert.deepEqual(em.data.topSongs, []);
  assert.deepEqual(em.data.ledger, []);
});

test("playtime module carries the recently-played shelf from observed sessions", () => {
  const content: SiteContent = {
    meta: { name: "D", handle: "LetsGaming", location: en("DE"), role: en("dev") },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"), status: { verb: en("x"), now: en("y") },
    bio: [], links: [], projects: [], hobbies: [], now: [],
  };
  const nav: NavNode[] = [{ id: "life", label: en("Life"), modules: ["playtime"] }];
  const modules: ModuleDescriptor[] = [{ id: "playtime", kind: "playtime", heading: en("Time played") }];

  const view = resolveSiteView({
    content: { ...content, presence: { show: ["game"] } },
    nav, modules,
    source: {},
    // every game the shelf shows comes from observed sessions now
    playtime: [
      { name: "Counter-Strike 2", minutes: 120, sessions: 4, exact: true },
      { name: "Minecraft", minutes: 60, sessions: 2, exact: false },
    ],
  });

  const pt = view.modules["playtime"];
  if (!pt || pt.kind !== "playtime") throw new Error("expected playtime");
  const byName = Object.fromEntries(pt.data.recent.map((g) => [g.name, g]));
  assert.ok(byName["Counter-Strike 2"], "game present");
  assert.equal(byName["Counter-Strike 2"]?.minutes, 120);
  assert.ok(byName["Minecraft"], "second game present");
  // an inexact total (Discord-undated sessions) stays flagged
  assert.equal(byName["Minecraft"]?.exact, false);
});

test("playtime recently-played is gated on the game category, like the old presence chart", () => {
  const content: SiteContent = {
    meta: { name: "D", handle: "LetsGaming", location: en("DE"), role: en("dev") },
    headline: { before: en("a "), highlight: en("b"), after: en(" c") },
    lede: en("l"), status: { verb: en("x"), now: en("y") },
    bio: [], links: [], projects: [], hobbies: [], now: [],
  };
  const nav: NavNode[] = [{ id: "life", label: en("Life"), modules: ["playtime"] }];
  const modules: ModuleDescriptor[] = [{ id: "playtime", kind: "playtime", heading: en("Time played") }];

  // "game" NOT in the allow-list → no recently-played shelf, even with data.
  const view = resolveSiteView({
    content: { ...content, presence: { show: ["music"] } }, // no "game"
    nav, modules,
    source: {},
    playtime: [{ name: "Minecraft", minutes: 60, sessions: 1, exact: true }],
  });
  const pt = view.modules["playtime"];
  if (!pt || pt.kind !== "playtime") throw new Error("expected playtime");
  assert.deepEqual(pt.data.recent, [], "game disabled → empty shelf");
});
