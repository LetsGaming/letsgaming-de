import { lintNav, resolveSiteView, type GitHubData } from "@lg/core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "./index.js";

const sampleGitHub: GitHubData = {
  stats: { repos: 17, commitsYear: 428, commitsAllTime: 2100, longestStreakDays: 19 },
  languages: [
    { name: "TypeScript", pct: 42 },
    { name: "Python", pct: 31 },
  ],
  contributions: [0, 1, 3, 5, 2, 0, 4, 1],
  events: [
    { type: "commit", text: "Pushed 3 commits to plantcare-tracker", at: new Date().toISOString() },
  ],
  // Provided newest-push first (as the GraphQL query returns them).
  repos: [
    { name: "recent-a", stars: 5, pushedAt: "2026-01-04T00:00:00Z", url: "https://github.com/x/recent-a", language: "TypeScript", description: "A" },
    { name: "recent-c", stars: 0, pushedAt: "2026-01-03T00:00:00Z", url: "https://github.com/x/recent-c" },
    { name: "pinned-b", stars: 2, pushedAt: "2026-01-01T00:00:00Z", url: "https://github.com/x/pinned-b", language: "Python", description: "B" },
  ],
  pinned: ["pinned-b"],
};

test("seed populates content and IA", () => {
  const store = openStore(":memory:");
  const content = store.content.getContent();
  assert.equal(content.meta.name, "Domenic");
  // Projects are now driven by GitHub (pinned + recent), so the seed intentionally
  // populates none — the seed provides identity, bio, hobbies, links and IA.
  assert.equal(content.projects.length, 0);
  assert.ok(content.hobbies.length > 0);
  const nav = store.ia.getNav();
  const modules = store.ia.getModules();
  assert.equal(nav.length, 4);
  assert.ok(lintNav(nav, { knownModuleIds: modules.map((m) => m.id) }).ok);
  store.close();
});

test("recording a snapshot updates current and appends history", () => {
  const store = openStore(":memory:");
  store.source.record("github", "2026-01-01T00:00:00.000Z", sampleGitHub);
  store.source.record("github", "2026-01-02T00:00:00.000Z", {
    ...sampleGitHub,
    stats: { ...sampleGitHub.stats, commitsAllTime: 2110 },
  });

  const current = store.source.getCurrent<GitHubData>("github");
  assert.equal(current?.stats.commitsAllTime, 2110, "current reflects the latest sync");

  const history = store.source.history<GitHubData>("github");
  assert.equal(history.length, 2, "every sync is archived");
  assert.equal(store.source.latestSyncedAt(), "2026-01-02T00:00:00.000Z");
  store.close();
});

test("store + core resolve into a render-ready SiteView", () => {
  const store = openStore(":memory:");
  store.source.record("github", "2026-01-02T00:00:00.000Z", sampleGitHub);

  const view = resolveSiteView({
    content: store.content.getContent(),
    source: store.source.getAllCurrent(),
    nav: store.ia.getNav(),
    modules: store.ia.getModules(),
    syncedAt: store.source.latestSyncedAt(),
    now: new Date("2026-01-05T00:00:00.000Z"),
  });

  assert.equal(view.meta.name, "Domenic");
  const activity = view.modules["activity"];
  assert.equal(activity?.kind, "activity");
  if (activity?.kind === "activity") {
    assert.equal(activity.data.stats[0]?.value, "17");
    assert.equal(activity.data.stats[2]?.value, "2.1k");
    assert.deepEqual(activity.data.sources, ["GitHub"]);
    assert.equal(activity.data.contributions.levels.length, 8);
  }
  const hero = view.modules["hero"];
  assert.equal(hero?.kind, "hero");
  store.close();
});

test("projects come from GitHub — pinned first, then most-recent", () => {
  const store = openStore(":memory:");
  store.source.record("github", "2026-01-02T00:00:00.000Z", sampleGitHub);

  const view = resolveSiteView({
    content: store.content.getContent(),
    source: store.source.getAllCurrent(),
    nav: store.ia.getNav(),
    modules: store.ia.getModules(),
    now: new Date("2026-01-05T00:00:00.000Z"),
  });

  const projects = view.modules["projects"];
  assert.equal(projects?.kind, "projects");
  if (projects?.kind === "projects") {
    const names = projects.data.projects.map((p) => p.name);
    assert.deepEqual(names, ["pinned-b", "recent-a", "recent-c"]);
    assert.equal(projects.data.projects[0]?.featured, true);
    assert.equal(projects.data.githubUrl, "https://github.com/LetsGaming");
    assert.equal(projects.data.projects[0]?.href, "https://github.com/x/pinned-b");
  }
  store.close();
});

test("rollupAndPrune bundles old hourly into daily and prunes", () => {
  const store = openStore(":memory:");
  const old = new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 13);
  const recent = new Date().toISOString().slice(0, 13);
  store.analytics.recordHourly([
    { bucket: old, dimension: "path", key: "/" },
    { bucket: old, dimension: "path", key: "/" },
    { bucket: recent, dimension: "path", key: "/work" },
  ]);

  const res = store.analytics.rollupAndPrune(90); // keep 90 days of hourly
  assert.ok(res.pruned >= 1);

  // The old bucket is gone from hourly…
  assert.equal(store.analytics.topHourly("path", "0000", "9999").length, 1);
  assert.equal(store.analytics.topHourly("path", "0000", "9999")[0]?.key, "/work");
  // …and rolled into daily with its summed count.
  const day = old.slice(0, 10);
  const daily = store.analytics.top("path", day, day);
  assert.equal(daily[0]?.key, "/");
  assert.equal(daily[0]?.count, 2);
  store.close();
});
