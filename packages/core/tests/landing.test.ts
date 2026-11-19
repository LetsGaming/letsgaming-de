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
  { id: "home", label: en("Home"), modules: ["hero", "week", "playing", "recent"] },
  { id: "code", label: en("Code"), modules: ["projects"] },
  { id: "life", label: en("Life"), modules: ["playtime"] },
  { id: "about", label: en("About"), modules: ["bio"] },
  { id: "blog", label: en("Blog"), modules: ["posts"] },
];
const modules: ModuleDescriptor[] = [
  { id: "hero", kind: "hero" },
  { id: "week", kind: "week", heading: en("This week") },
  { id: "playing", kind: "playing", heading: en("Games and music") },
  { id: "recent", kind: "recent", heading: en("Latest on GitHub") },
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

const week = (over: Partial<ResolveInput> = {}) => {
  const m = resolve(over).modules.week;
  return m?.kind === "week" ? m.data : undefined;
};
const sentence = (over: Partial<ResolveInput> = {}) => week(over)?.parts.map((p) => p.text).join("");

const playing = (over: Partial<ResolveInput> = {}) => {
  const m = resolve(over).modules.playing;
  return m?.kind === "playing" ? m.data : undefined;
};

const recent = (over: Partial<ResolveInput> = {}) => {
  const m = resolve(over).modules.recent;
  return m?.kind === "recent" ? m.data : undefined;
};

const syncedAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const HOUR_MS = 60 * 60 * 1000;
const freshInput = (over: { wakapi?: number; github?: number } = {}) => ({
  syncedAt: { wakapi: syncedAgo(over.wakapi ?? 10), github: syncedAgo(over.github ?? 10) },
  ttl: { wakapi: HOUR_MS, github: HOUR_MS },
});
const github = {
  stats: { repos: 1, commitsYear: 1, commitsAllTime: 1, longestStreakDays: 1 },
  languages: [],
  contributions: [],
  events: [{ type: "commit" as const, repo: "plantcare-tracker", at: hoursAgo(48) }],
};
const wakapi = {
  range: "last 7 days",
  totalSeconds: Math.round(28.3 * 3600),
  languages: [{ name: "TypeScript", pct: 46, seconds: 46_000 }],
};
const playHistory = {
  ledger: [
    { day: "2026-03-09", minutes: 90 },
    { day: "2026-03-10", minutes: 30 },
    { day: "2026-01-01", minutes: 600 },
  ],
  heat: [],
  timeZone: "UTC",
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

test("week: one sentence from code hours, play hours and the latest event, each fact linked", () => {
  const input = { source: { github, wakapi }, playHistory, freshness: freshInput() };
  assert.equal(
    sentence(input),
    "I coded for 28.3 hours (46% TypeScript) and played for 2 hours. Pushed to plantcare-tracker, 2d ago.",
  );
  const linked = week(input)?.parts.filter((p) => p.href);
  assert.deepEqual(
    linked?.map((p) => [p.role, p.href]),
    [
      ["code", "/code"],
      ["games", "/life"],
      ["event", "/code"],
    ],
  );
});

test("week: German keeps its own word order and number format", () => {
  const text = sentence({ source: { github, wakapi }, playHistory, freshness: freshInput(), locale: "de" });
  assert.equal(
    text,
    "Ich habe 28,3 Stunden (46 % TypeScript) programmiert und 2 Stunden gespielt. Push nach plantcare-tracker, vor 2 T.",
  );
});

test("week: one hour is singular", () => {
  const one = { ledger: [{ day: "2026-03-10", minutes: 60 }], heat: [], timeZone: "UTC" };
  assert.equal(sentence({ playHistory: one }), "I played for 1 hour.");
});

test("week: a clause with no data is dropped, and the sentence still reads whole", () => {
  assert.equal(
    sentence({ source: { wakapi }, freshness: freshInput() }),
    "I coded for 28.3 hours (46% TypeScript).",
  );
  assert.equal(
    sentence({ source: { github }, freshness: freshInput() }),
    "Pushed to plantcare-tracker, 2d ago.",
  );
});

test("week: old numbers are never presented as this week's", () => {
  const staleWakapi = freshInput({ wakapi: 300 });
  const v = week({ source: { github, wakapi }, playHistory, freshness: staleWakapi });
  assert.equal(v?.parts.map((p) => p.text).join(""), "I played for 2 hours. Pushed to plantcare-tracker, 2d ago.");
  assert.equal(v?.freshness?.state, "stale");

  const failed = week({
    source: { github, wakapi },
    freshness: { ...freshInput(), failedAt: { github: syncedAgo(1) } },
  });
  assert.equal(failed?.parts.map((p) => p.text).join(""), "I coded for 28.3 hours (46% TypeScript).");
  assert.equal(failed?.freshness?.state, "failed");

  const otherRange = { ...wakapi, range: "last 30 days" };
  assert.equal(sentence({ source: { wakapi: otherRange }, freshness: freshInput() }), undefined);
});

test("week: play hours follow the Show switches, and the module resolves to nothing when empty", () => {
  const allOff = content({ presence: { show: [], hidden: [] } as SiteContent["presence"] });
  assert.equal(week({ playHistory, content: allOff }), undefined);
  assert.equal(week(), undefined);
});

test("playing: top games and songs, capped, with hidden games and switched-off categories left out", () => {
  const playtime = ["A", "B", "C", "D", "E", "Secret"].map((name, i) => ({ name, minutes: 100 - i, exact: true }));
  const musicHistory = {
    topSongs: [1, 2, 3, 4, 5].map((n) => ({ name: `Song ${n}`, minutes: 10, plays: n, by: "Band" })),
    topArtists: [],
    topAlbums: [],
    ledger: [],
    trackCount: 5,
    artistCount: 1,
    timeZone: "UTC",
  };
  const hidden = content({ presence: { show: ["game", "music"], hidden: ["secret"] } as SiteContent["presence"] });
  const v = playing({ playtime, musicHistory, content: hidden });
  assert.deepEqual(v?.games.map((g) => g.name), ["A", "B", "C", "D"]);
  assert.deepEqual(v?.songs.map((s) => s.name), ["Song 1", "Song 2", "Song 3", "Song 4"]);
  assert.equal(v?.moreHref, "/life");

  const gamesOnly = content({ presence: { show: ["game"], hidden: [] } as SiteContent["presence"] });
  assert.deepEqual(playing({ playtime, musicHistory, content: gamesOnly })?.songs, []);

  const none = content({ presence: { show: [], hidden: [] } as SiteContent["presence"] });
  assert.equal(playing({ playtime, musicHistory, content: none }), undefined);
  assert.equal(playing(), undefined);
});

test("recent: the newest events first, at most five, with the GitHub freshness state", () => {
  const events = Array.from({ length: 8 }, (_, i) => ({
    type: "commit" as const,
    repo: `repo-${i}`,
    at: hoursAgo(i + 1),
  }));
  const v = recent({ source: { github: { ...github, events } }, freshness: freshInput() });
  assert.equal(v?.events.length, 5);
  assert.deepEqual(v?.events.map((e) => e.text), [0, 1, 2, 3, 4].map((i) => `Pushed to repo-${i}`));
  assert.equal(v?.freshness?.state, "fresh");
  assert.equal(v?.moreHref, "/code");

  const stale = recent({ source: { github }, freshness: freshInput({ github: 300 }) });
  assert.equal(stale?.freshness?.state, "stale");
  assert.equal(recent(), undefined);
});