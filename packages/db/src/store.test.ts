import { lintNav, resolveSiteView, type GitHubData } from "@lg/core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { openDatabase, openStore, iaRepo, reconcileIa, seedIfEmpty } from "./index.js";

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

test("guestbook: new entries are pending (hidden), approving reveals them", () => {
  const store = openStore(":memory:");
  const id1 = store.guestbook.add({ name: "A", message: "hi", createdAt: "2026-01-01T00:00:00Z", flags: [], score: 0 });
  store.guestbook.add({ name: "B", message: "spammy", createdAt: "2026-01-02T00:00:00Z", flags: ["links"], score: 3 });

  assert.equal(store.guestbook.listApproved().length, 0);
  assert.equal(store.guestbook.countPending(), 2);

  store.guestbook.setStatus(id1, "approved");
  const pub = store.guestbook.listApproved();
  assert.equal(pub.length, 1);
  assert.equal(pub[0]?.name, "A");
  assert.equal(store.guestbook.countPending(), 1);
  assert.ok(!("flags" in (pub[0] as object)) && !("status" in (pub[0] as object)));
  store.close();
});

test("guestbook: moderation queue puts pending first, most-suspicious first", () => {
  const store = openStore(":memory:");
  const low = store.guestbook.add({ name: "L", message: "hi", createdAt: "2026-01-03T00:00:00Z", flags: [], score: 0 });
  const high = store.guestbook.add({ name: "H", message: "buy", createdAt: "2026-01-01T00:00:00Z", flags: ["links", "profanity"], score: 4 });
  const approved = store.guestbook.add({ name: "OK", message: "nice", createdAt: "2026-01-05T00:00:00Z", flags: [], score: 0 });
  store.guestbook.setStatus(approved, "approved");

  const queue = store.guestbook.listForModeration();
  assert.equal(queue[0]?.id, high);
  assert.equal(queue[1]?.id, low);
  assert.equal(queue[2]?.status, "approved");

  assert.equal(store.guestbook.remove(low), true);
  assert.equal(store.guestbook.remove(9999), false);
  store.close();
});

test("gallery: CRUD + ordering, module grouping, and it flows through getContent", () => {
  const store = openStore(":memory:");
  assert.deepEqual(store.content.getGallery(), []);
  store.content.upsertGalleryItem(
    { id: "a", module: "gallery", asset: "asset:aaa", caption: { en: "One" } },
    0,
  );
  store.content.upsertGalleryItem(
    { id: "b", module: "gallery", asset: "asset:bbb", caption: { en: "Two" } },
    1,
  );
  store.content.upsertGalleryItem(
    { id: "c", module: "gallery-travel", asset: "asset:ccc", caption: { en: "Trip" } },
    0,
  );
  assert.deepEqual(store.content.getGallery().map((g) => g.id).sort(), ["a", "b", "c"]);
  assert.equal(store.content.getGallery().find((g) => g.id === "a")?.asset, "asset:aaa");

  // Deleting a whole gallery module drops only its images.
  store.content.deleteGalleryModule("gallery-travel");
  assert.deepEqual(store.content.getGallery().map((g) => g.id).sort(), ["a", "b"]);

  assert.equal(store.content.getContent().gallery?.length, 2);
  store.content.deleteGalleryItem("a");
  assert.deepEqual(store.content.getGallery().map((g) => g.id), ["b"]);
  store.close();
});

test("presence settings: seeded default, roundtrip, and sanitized on write", () => {
  const store = openStore(":memory:");
  // Seeded with the default allow-list.
  assert.deepEqual(
    [...store.content.getPresence().show].sort(),
    ["custom", "game", "music", "steam", "streaming"],
  );
  // Unknown categories are dropped on the way in.
  store.content.setPresence({ show: ["game", "steam", "bogus"] as never });
  assert.deepEqual(store.content.getPresence().show, ["game", "steam"]);
  // getContent() carries it through.
  assert.deepEqual(store.content.getContent().presence?.show, ["game", "steam"]);
  store.close();
});

test("reconcileIa adds and places a newly-registered launch module (IA migration)", () => {
  const db = openDatabase(":memory:");
  seedIfEmpty(db);
  const ia = iaRepo(db);

  // Simulate a store seeded before `highlights` existed: drop its descriptor and
  // its placement in the Work leaf.
  const nav = ia.getNav();
  const work = nav.find((n) => n.id === "work");
  if (!work) throw new Error("expected a work leaf");
  work.modules = ["activity", "projects"];
  ia.setNav(nav);
  ia.setModules(ia.getModules().filter((m) => m.id !== "highlights"));
  assert.ok(!ia.getModules().some((m) => m.id === "highlights"));

  const res = reconcileIa(db);
  assert.deepEqual(res.addedModules, ["highlights"]);
  assert.deepEqual(res.placed, ["highlights"]);
  assert.ok(ia.getModules().some((m) => m.id === "highlights"));
  const work2 = ia.getNav().find((n) => n.id === "work");
  // Placed in launch order — between activity and projects — without disturbing them.
  assert.deepEqual(work2?.modules, ["activity", "highlights", "projects"]);

  // Idempotent: running again changes nothing.
  const again = reconcileIa(db);
  assert.deepEqual(again.addedModules, []);
  assert.deepEqual(again.placed, []);
  db.close();
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

test("assets: content-hash dedupe — same bytes never create a second asset", () => {
  const store = openStore(":memory:");
  const a = store.assets.create({
    id: "a1", hash: "sha-AAA", kind: "image", ext: "png", mime: "image/png",
    bytes: 1000, width: 800, height: 600, filename: "photo.png", tags: ["trip"],
  });
  // Same hash, different id/name → returns the ORIGINAL, no new row.
  const dup = store.assets.create({
    id: "a2", hash: "sha-AAA", kind: "image", ext: "png", mime: "image/png",
    bytes: 1000, filename: "copy.png",
  });
  assert.equal(dup.id, "a1");
  assert.equal(store.assets.list().length, 1);
  assert.deepEqual(a.tags, ["trip"]);
  store.close();
});

test("assets: folders, tags, kind, and search all filter the library", () => {
  const store = openStore(":memory:");
  store.assets.createFolder({ id: "f1", name: "Travel", parentId: null });
  store.assets.create({ id: "i1", hash: "h1", kind: "image", ext: "jpg", mime: "image/jpeg", bytes: 1, filename: "alps.jpg", folderId: "f1", tags: ["mountains"], title: "Alps" });
  store.assets.create({ id: "p1", hash: "h2", kind: "pdf", ext: "pdf", mime: "application/pdf", bytes: 2, filename: "cv.pdf", tags: ["docs"] });

  assert.deepEqual(store.assets.list({ folderId: "f1" }).map((a) => a.id), ["i1"]);
  assert.deepEqual(store.assets.list({ folderId: null }).map((a) => a.id), ["p1"]);
  assert.deepEqual(store.assets.list({ kind: "pdf" }).map((a) => a.id), ["p1"]);
  assert.deepEqual(store.assets.list({ tag: "mountains" }).map((a) => a.id), ["i1"]);
  assert.deepEqual(store.assets.list({ q: "alp" }).map((a) => a.id), ["i1"]);
  assert.deepEqual(store.assets.allTags(), ["docs", "mountains"]);

  // Deleting the folder drops the asset back to root (ON DELETE SET NULL).
  store.assets.deleteFolder("f1");
  assert.equal(store.assets.getById("i1")?.folderId, null);
  store.close();
});

test("assets: variants cache + usage tracking + cascade on delete", () => {
  const store = openStore(":memory:");
  store.assets.create({ id: "i1", hash: "h1", kind: "image", ext: "png", mime: "image/png", bytes: 1, filename: "x.png" });

  assert.equal(store.assets.hasVariant("i1", "webp", 800), false);
  store.assets.addVariant("i1", { format: "webp", width: 800, bytes: 12000 });
  store.assets.addVariant("i1", { format: "avif", width: 800, bytes: 9000 });
  assert.equal(store.assets.hasVariant("i1", "webp", 800), true);
  assert.equal(store.assets.listVariants("i1").length, 2);

  // Usage: recording a context replaces that context's rows.
  store.assets.recordUsage("hero", [{ assetId: "i1", label: "Home hero" }]);
  store.assets.recordUsage("gallery:travel", [{ assetId: "i1", label: "Travel gallery" }]);
  assert.equal(store.assets.usageCount("i1"), 2);
  store.assets.recordUsage("hero", []); // hero no longer uses it
  assert.equal(store.assets.usageCount("i1"), 1);
  assert.deepEqual(store.assets.usagesFor("i1").map((u) => u.context), ["gallery:travel"]);

  // Deleting the asset cascades variants + usages.
  assert.equal(store.assets.remove("i1"), true);
  assert.equal(store.assets.listVariants("i1").length, 0);
  assert.equal(store.assets.usageCount("i1"), 0);
  store.close();
});

test("assets: markdown slug lookup", () => {
  const store = openStore(":memory:");
  store.assets.create({ id: "m1", hash: "h1", kind: "markdown", ext: "md", mime: "text/markdown", bytes: 10, filename: "About.md", slug: "about" });
  assert.equal(store.assets.getBySlug("about")?.id, "m1");
  assert.equal(store.assets.getBySlug("missing"), null);
  store.close();
});
