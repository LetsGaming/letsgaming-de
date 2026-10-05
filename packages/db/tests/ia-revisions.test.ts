import assert from "node:assert/strict";
import { test } from "node:test";
import { iaRepo, openDatabase, openStore } from "../src/index.js";

test("setNav and setModules archive the state before the write", () => {
  const store = openStore(":memory:");
  const nav = store.ia.getNav();
  const modules = store.ia.getModules();
  const startCount = store.ia.listRevisions(1000).length;

  store.ia.setNav(nav);
  store.ia.setModules(modules.filter((m) => m.id !== "posts"));

  const revs = store.ia.listRevisions(1000);
  assert.equal(revs.length, startCount + 2);
  assert.equal(revs[0]?.reason, "modules");
  assert.equal(revs[1]?.reason, "nav");
});

test("an empty site_ia has nothing to archive", () => {
  const ia = iaRepo(openDatabase(":memory:"));
  ia.setNav([]);
  assert.equal(ia.listRevisions().length, 0);
});

test("a write that throws leaves no revision", () => {
  const store = openStore(":memory:");
  const count = store.ia.listRevisions(1000).length;
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assert.throws(() => store.ia.setNav(circular as never));
  assert.equal(store.ia.listRevisions(1000).length, count);
});

test("revisions are pruned to the cap, oldest first", () => {
  const store = openStore(":memory:");
  const nav = store.ia.getNav();
  for (let i = 0; i < 520; i++) store.ia.setNav(nav);
  const revs = store.ia.listRevisions(10_000);
  assert.equal(revs.length, 500);
  assert.ok((revs[0]?.id ?? 0) > (revs.at(-1)?.id ?? 0));
});
