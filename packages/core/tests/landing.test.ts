import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSiteView, type ResolveInput } from "../src/resolve.js";
import { en } from "../src/i18n.js";
import type { SiteContent } from "../src/content.js";
import type { ModuleDescriptor } from "../src/modules.js";
import type { NavNode } from "../src/nav.js";

const NOW = new Date("2026-03-10T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

const content = (over: Partial<SiteContent> = {}): SiteContent => ({
  meta: { name: "D", handle: "LetsGaming", location: en("Germany"), role: en("web developer") },
  headline: { before: en("a "), highlight: en("b"), after: en(" c") },
  lede: en("l"),
  status: { verb: en("building"), now: en("x") },
  bio: [],
  links: [{ id: "gh", label: en("GitHub"), href: "https://github.com/x", primary: true }],
  projects: [],
  hobbies: [],
  now: [],
  ...over,
});

const nav: NavNode[] = [
  { id: "home", label: en("Home"), modules: ["hero", "teasers"] },
  { id: "code", label: en("Code"), modules: ["projects"] },
  { id: "life", label: en("Life"), modules: ["playtime"] },
  { id: "about", label: en("About"), modules: ["bio"] },
  { id: "blog", label: en("Blog"), modules: ["posts"] },
];
const modules: ModuleDescriptor[] = [
  { id: "hero", kind: "hero" },
  { id: "teasers", kind: "teasers", heading: en("Jump in") },
  { id: "projects", kind: "projects" },
  { id: "playtime", kind: "playtime" },
  { id: "bio", kind: "bio" },
  { id: "posts", kind: "posts" },
];

const resolve = (over: Partial<ResolveInput> = {}) =>
  resolveSiteView({ content: content(), source: {}, nav, modules, locale: "en", now: NOW, ...over });

const hero = (over: Partial<ResolveInput> = {}) => {
  const m = resolve(over).modules.hero;
  if (m?.kind !== "hero") throw new Error("expected hero");
  return m.data;
};

const teasers = (over: Partial<ResolveInput> = {}) => {
  const m = resolve(over).modules.teasers;
  return m?.kind === "teasers" ? m.data.teasers : undefined;
};

const postAsset = {
  id: "p1",
  kind: "markdown" as const,
  slug: "blog/hello",
  filename: "hello.md",
  markdown: "---\ntitle: Hello world\ndate: 2026-03-09\n---\nBody text.",
};

test("hero: an internal primary CTA leads and the CMS links step back to secondary", () => {
  const links = hero().links;
  assert.equal(links[0]?.href, "/code");
  assert.equal(links[0]?.primary, true);
  assert.equal(links.find((l) => l.id === "gh")?.primary, false);
});

test("hero: injecting the CTA never drops an authored link (4 CMS links)", () => {
  const links = hero({
    content: content({
      links: ["a", "b", "c", "d"].map((id) => ({ id, label: en(id), href: `https://x.test/${id}` })),
    }),
  }).links;
  assert.deepEqual(
    links.map((l) => l.id),
    ["hero-explore", "a", "b", "c", "d"],
  );
});

test("hero: a CMS link that already points at Code or Life is left alone", () => {
  const links = hero({
    content: content({ links: [{ id: "mine", label: en("Mine"), href: "#life", primary: true }] }),
  }).links;
  assert.deepEqual(
    links.map((l) => l.id),
    ["mine"],
  );
  assert.equal(links[0]?.primary, true);
});

test("hero: idle state names the last activity only for categories that are shown", () => {
  const recentActivity = {
    games: [{ name: "Minecraft", at: hoursAgo(2) }],
    track: { name: "Some Song", at: hoursAgo(5) },
  };
  const shown = hero({ recentActivity }).lastActivity;
  assert.equal(shown?.kind, "game");
  assert.equal(shown?.name, "Minecraft");
  assert.equal(shown?.relative, "2h");

  const gamesOff = hero({
    recentActivity,
    content: content({ presence: { show: ["music"], hidden: [] } as SiteContent["presence"] }),
  }).lastActivity;
  assert.equal(gamesOff?.kind, "music");

  const allOff = hero({
    recentActivity,
    content: content({ presence: { show: [], hidden: [] } as SiteContent["presence"] }),
  });
  assert.equal(allOff.lastActivity, undefined);
  assert.equal(allOff.presenceEnabled, false);
});

test("hero: a hidden activity is skipped in favour of the next most recent one", () => {
  const last = hero({
    recentActivity: {
      games: [
        { name: "Secret Game", at: hoursAgo(1) },
        { name: "Minecraft", at: hoursAgo(3) },
      ],
    },
    content: content({ presence: { show: ["game"], hidden: ["secret game"] } as SiteContent["presence"] }),
  }).lastActivity;
  assert.equal(last?.name, "Minecraft");
});

test("hero carries the wave count", () => {
  assert.equal(hero({ reactions: { wave: 7 } }).waves, 7);
  assert.equal(hero().waves, 0);
});

test("teasers: Blog is absent until there is a post, then shows the latest", () => {
  assert.equal(teasers()?.some((t) => t.id === "blog"), false);
  const withPost = teasers({ assets: new Map([["p1", postAsset]]) });
  const blog = withPost?.find((t) => t.id === "blog");
  assert.equal(blog?.value, "Hello world");
  assert.equal(blog?.href, "/blog");
});

test("teasers: Life shows hours played this week and the top artist, gated by the Show switches", () => {
  const playHistory = {
    ledger: [
      { day: "2026-03-09", minutes: 90 },
      { day: "2026-03-10", minutes: 30 },
      { day: "2026-01-01", minutes: 600 },
    ],
    heat: [],
    timeZone: "UTC",
  };
  const musicHistory = {
    topSongs: [],
    topArtists: [{ name: "Icona Pop", minutes: 40, plays: 5 }],
    topAlbums: [],
    ledger: [],
    trackCount: 0,
    artistCount: 1,
    timeZone: "UTC",
  };
  const life = teasers({ playHistory, musicHistory })?.find((t) => t.id === "life");
  assert.equal(life?.value, "2 h played this week");
  assert.equal(life?.detail, "Top artist: Icona Pop");

  const hiddenAll = teasers({
    playHistory,
    musicHistory,
    content: content({ presence: { show: [], hidden: [] } as SiteContent["presence"] }),
  });
  assert.equal(hiddenAll?.some((t) => t.id === "life"), false);
});

test("teasers: every card links to its area and the module resolves to nothing when empty", () => {
  const cards = teasers() ?? [];
  assert.deepEqual(
    cards.map((c) => c.href),
    ["/about"],
  );
  const bare = resolveSiteView({
    content: content(),
    source: {},
    nav: [{ id: "home", label: en("Home"), modules: ["teasers"] }],
    modules,
    locale: "en",
    now: NOW,
  });
  assert.equal(bare.modules.teasers, undefined);
});
