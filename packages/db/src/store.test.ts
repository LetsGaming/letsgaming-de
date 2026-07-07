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
};

test("seed populates content and IA", () => {
  const store = openStore(":memory:");
  const content = store.content.getContent();
  assert.equal(content.meta.name, "Domenic");
  assert.equal(content.projects.length, 3);
  assert.ok(content.projects.some((p) => p.featured));
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
