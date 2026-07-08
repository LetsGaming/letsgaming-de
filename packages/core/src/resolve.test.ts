import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSiteView, safeHref } from "./resolve.js";
import { en } from "./i18n.js";
import type { SiteContent } from "./content.js";
import type { ModuleDescriptor } from "./modules.js";
import type { NavNode } from "./nav.js";
import type { GitHubData } from "./source.js";

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

test("resolver folds Wakapi into coding and presence config + Steam into presence", () => {
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
    content: { ...content, presence: { show: ["game", "steam"] } },
    nav,
    modules,
    source: {
      wakapi: { range: "last 7 days", totalSeconds: 7200, languages: [{ name: "TS", pct: 100, seconds: 7200 }] },
      steam: { recent: [{ name: "CS2", appId: 730, minutes2Weeks: 120 }] },
    },
    presence: { discordId: "123" },
  });

  const coding = view.modules["coding"];
  if (!coding || coding.kind !== "coding") throw new Error("expected coding module");
  assert.equal(coding.data.coding?.totalHours, 2);
  assert.equal(coding.data.coding?.languages[0]?.hours, 2);

  const presence = view.modules["presence"];
  if (!presence || presence.kind !== "presence") throw new Error("expected presence module");
  // "game" is a live category + a discord id is set → the client is told to poll.
  assert.equal(presence.data.live, true);
  // "steam" is enabled → the (already-synced) Steam section reaches the client.
  assert.equal(presence.data.steam?.recent[0]?.name, "CS2");
  // The client is NOT given the Discord id or the category list.
  assert.ok(!("discordId" in presence.data) && !("show" in presence.data));
});

test("presence gating: disabled Steam is withheld; no live category means not live", () => {
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
    source: { steam: { recent: [{ name: "CS2", appId: 730, minutes2Weeks: 60 }] } },
  };

  // Steam configured but NOT in the allow-list → withheld from the client.
  const noSteam = resolveSiteView({
    ...base,
    content: { ...base.content, presence: { show: ["game"] } },
    presence: { discordId: "1" },
  });
  const m1 = noSteam.modules["presence"];
  if (!m1 || m1.kind !== "presence") throw new Error("expected presence");
  assert.equal(m1.data.steam, undefined);
  assert.equal(m1.data.live, true);

  // Only "steam" enabled (no live category) → not live, but Steam shows.
  const steamOnly = resolveSiteView({
    ...base,
    content: { ...base.content, presence: { show: ["steam"] } },
    presence: { discordId: "1" },
  });
  const m2 = steamOnly.modules["presence"];
  if (!m2 || m2.kind !== "presence") throw new Error("expected presence");
  assert.equal(m2.data.live, false);
  assert.equal(m2.data.steam?.recent[0]?.name, "CS2");

  // No Discord id → never live even if categories are enabled.
  const noId = resolveSiteView({
    ...base,
    content: { ...base.content, presence: { show: ["game"] } },
  });
  const m3 = noId.modules["presence"];
  if (!m3 || m3.kind !== "presence") throw new Error("expected presence");
  assert.equal(m3.data.live, false);
});

test("safeHref passes through http(s), mailto, and site-relative URLs", () => {
  assert.equal(safeHref("https://example.com/x"), "https://example.com/x");
  assert.equal(safeHref("http://example.com"), "http://example.com");
  assert.equal(safeHref("mailto:me@example.com"), "mailto:me@example.com");
  assert.equal(safeHref("/work"), "/work");
});

test("highlights merges releases/PRs/gists newest-first with relative times", () => {
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
  const nav: NavNode[] = [{ id: "work", label: en("Work"), modules: ["highlights"] }];
  const modules: ModuleDescriptor[] = [
    { id: "highlights", kind: "highlights", heading: en("Recently shipped") },
  ];
  const github: GitHubData = {
    stats: { repos: 1, commitsYear: 1, commitsAllTime: 1, longestStreakDays: 1 },
    languages: [],
    contributions: [],
    events: [],
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

  const mod = view.modules["highlights"];
  if (!mod || mod.kind !== "highlights") throw new Error("expected a highlights module");
  const items = mod.data.items;
  assert.equal(items.length, 3);
  // Newest-first across the three types: PR (01-09) > release (01-05) > gist (01-01).
  assert.deepEqual(
    items.map((i) => i.type),
    ["pr", "release", "gist"],
  );
  assert.match(items[0]!.text, /Merged/);
  assert.equal(items[1]?.meta, "v1"); // release tag
  assert.equal(items[2]?.meta, "2 files"); // gist file count
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
