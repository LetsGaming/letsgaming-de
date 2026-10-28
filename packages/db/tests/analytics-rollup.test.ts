import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  ROLLUP_TIME_ZONE,
  bucketDay,
  dayHourSpan,
  hourBucket,
  migrateDown,
  openStore,
  resolveMigrationsDir,
  runMigrations,
  shiftDay,
  type HourlyHit,
  type Store,
} from "../src/index.js";

const HOUR = 3_600_000;

interface Fixture {
  store: Store;
  raw: DatabaseSync;
  dir: string;
  path: string;
  done(): void;
}

/** A file-backed store plus a second connection for reading raw table rows. */
function fixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "lg-rollup-"));
  const path = join(dir, "t.sqlite");
  const store = openStore(path);
  const raw = new DatabaseSync(path);
  return {
    store,
    raw,
    dir,
    path,
    done: () => {
      raw.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

const hit = (bucket: string, dimension: HourlyHit["dimension"], key: string, n = 1): HourlyHit[] =>
  Array.from({ length: n }, () => ({ bucket, dimension, key }));

/** One `path` hit in each UTC hour from `from` to `to` inclusive. */
function everyHour(from: string, to: string): HourlyHit[] {
  const out: HourlyHit[] = [];
  for (let t = Date.parse(`${from}:00:00Z`); t <= Date.parse(`${to}:00:00Z`); t += HOUR) {
    out.push(...hit(hourBucket(t), "path", "/"));
  }
  return out;
}

const snapshot = (raw: DatabaseSync): string =>
  JSON.stringify([
    raw.prepare("SELECT * FROM analytics_rollup ORDER BY grain, bucket, dimension, key").all(),
    raw.prepare("SELECT * FROM analytics_summary ORDER BY grain, bucket, metric").all(),
  ]);

const pageviewsOf = (store: Store, day: string): number =>
  store.analytics.summaryByBucket("day", day, day).get(day)?.pageviews ?? 0;

test("re-running a bucket leaves identical rows", () => {
  const f = fixture();
  try {
    f.store.analytics.recordHourly([
      ...hit("2026-09-10T08", "path", "/", 3),
      ...hit("2026-09-10T08", "path", "/work", 1),
      ...hit("2026-09-10T09", "viewport", "desktop", 2),
      ...hit("2026-09-10T09", "session_dwell", "1-3m", 2),
      ...hit("2026-09-11T10", "visit", "scroll", 1),
    ]);
    for (const day of ["2026-09-10", "2026-09-11"]) f.store.analytics.materialize("day", day);
    for (const h of ["2026-09-10T08", "2026-09-10T09", "2026-09-11T10"]) f.store.analytics.materialize("hour", h);
    const first = snapshot(f.raw);
    for (let i = 0; i < 3; i++) {
      f.store.analytics.materialize("day", "2026-09-10");
      f.store.analytics.materialize("hour", "2026-09-10T08");
    }
    assert.equal(snapshot(f.raw), first);
    assert.equal(pageviewsOf(f.store, "2026-09-10"), 4);
  } finally {
    f.done();
  }
});

test("a day rollup equals the sum of its hourly rows", () => {
  const f = fixture();
  try {
    f.store.analytics.recordHourly([
      ...hit("2026-09-10T08", "path", "/", 3),
      ...hit("2026-09-10T20", "path", "/", 2),
      ...hit("2026-09-10T21", "bot", "Googlebot", 4),
      ...hit("2026-09-10T21", "x:path:os", "/\u0001Linux", 5),
    ]);
    f.store.analytics.materialize("day", "2026-09-10");
    const day = f.raw
      .prepare("SELECT dimension, SUM(count) AS n FROM analytics_rollup WHERE grain='day' GROUP BY dimension ORDER BY dimension")
      .all();
    const hourly = f.raw
      .prepare(
        "SELECT dimension, SUM(count) AS n FROM analytics_hourly WHERE dimension NOT LIKE 'x:%' GROUP BY dimension ORDER BY dimension",
      )
      .all();
    assert.deepEqual(day, hourly);
    assert.equal(
      f.raw.prepare("SELECT COUNT(*) AS n FROM analytics_rollup WHERE dimension LIKE 'x:%'").get()?.n,
      0,
      "pair dimensions are not rolled up",
    );
  } finally {
    f.done();
  }
});

test("Berlin days are 23, 24 or 25 hours long across DST and bucket accordingly", () => {
  assert.equal(dayHourSpan("2026-03-28", ROLLUP_TIME_ZONE).hours, 24);
  assert.equal(dayHourSpan("2026-03-29", ROLLUP_TIME_ZONE).hours, 23);
  assert.equal(dayHourSpan("2026-10-25", ROLLUP_TIME_ZONE).hours, 25);
  assert.equal(dayHourSpan("2026-10-26", ROLLUP_TIME_ZONE).hours, 24);

  const f = fixture();
  try {
    // One hit per UTC hour across both changeovers.
    f.store.analytics.recordHourly([
      ...everyHour("2026-03-27T22", "2026-03-30T23"),
      ...everyHour("2026-10-24T20", "2026-10-26T23"),
    ]);
    for (const day of ["2026-03-28", "2026-03-29", "2026-03-30", "2026-10-24", "2026-10-25", "2026-10-26"]) {
      f.store.analytics.materialize("day", day);
    }
    assert.equal(pageviewsOf(f.store, "2026-03-28"), 24);
    assert.equal(pageviewsOf(f.store, "2026-03-29"), 23);
    assert.equal(pageviewsOf(f.store, "2026-03-30"), 24);
    assert.equal(pageviewsOf(f.store, "2026-10-25"), 25);
    assert.equal(pageviewsOf(f.store, "2026-10-26"), 24);
    // The last evening hours of a UTC day belong to the next Berlin day.
    f.store.analytics.recordHourly(hit("2026-07-01T22", "path", "/late"));
    f.store.analytics.materialize("day", "2026-07-02");
    assert.equal(pageviewsOf(f.store, "2026-07-02"), 1);
    assert.equal(pageviewsOf(f.store, "2026-07-01"), 0);
  } finally {
    f.done();
  }
});

test("pruning never drops a day that is not materialized, and keeps what the day grain holds", () => {
  const f = fixture();
  try {
    const oldDay = shiftDay(new Date().toISOString().slice(0, 10), -120);
    const recentDay = shiftDay(new Date().toISOString().slice(0, 10), -10);
    const span = dayHourSpan(oldDay, ROLLUP_TIME_ZONE);
    const hours: string[] = [];
    for (let t = Date.parse(`${span.fromB}:00:00Z`); t <= Date.parse(`${span.toB}:00:00Z`); t += HOUR) {
      hours.push(hourBucket(t));
    }
    f.store.analytics.recordHourly([
      ...hours.flatMap((h) => hit(h, "path", "/", 2)),
      ...hit(`${recentDay}T12`, "path", "/recent", 3),
    ]);
    assert.equal(f.store.analytics.isMaterialized("day", oldDay), false);

    const res = f.store.analytics.rollupAndPrune(90);
    assert.equal(res.pruned, hours.length, "the whole old Berlin day goes");

    assert.equal(f.store.analytics.isMaterialized("day", oldDay), true);
    f.store.analytics.advanceRollupState("day", shiftDay(oldDay, 1), new Date().toISOString());
    assert.equal(pageviewsOf(f.store, oldDay), hours.length * 2, "no count lost to pruning");
    assert.equal(
      f.raw.prepare("SELECT COUNT(*) AS n FROM analytics_hourly WHERE bucket LIKE ?").get(`${recentDay}%`)?.n,
      1,
      "a day inside retention is untouched",
    );
    assert.equal(f.store.analytics.isMaterialized("day", recentDay), false);

    // Idempotent: a second pass finds nothing to do and keeps the rollup.
    assert.deepEqual(f.store.analytics.rollupAndPrune(90), { rolledUp: 0, pruned: 0 });
    assert.equal(pageviewsOf(f.store, oldDay), hours.length * 2);
  } finally {
    f.done();
  }
});

test("the Berlin day that contains the retention cutoff is kept whole", () => {
  const f = fixture();
  try {
    const cutoffDay = bucketDay(hourBucket(Date.now() - 90 * 86_400_000), ROLLUP_TIME_ZONE);
    const span = dayHourSpan(cutoffDay, ROLLUP_TIME_ZONE);
    f.store.analytics.recordHourly([
      ...hit(span.fromB, "path", "/", 1),
      ...hit(span.toB, "path", "/", 1),
      ...hit(dayHourSpan(shiftDay(cutoffDay, -3), ROLLUP_TIME_ZONE).fromB, "path", "/old", 1),
    ]);
    const res = f.store.analytics.rollupAndPrune(90);
    assert.equal(res.pruned, 1, "only the day wholly before the cutoff day is pruned");
    assert.equal(f.store.analytics.topHourly("path", "0000", "9999").length, 1);
  } finally {
    f.done();
  }
});

test("a bucket with no hourly rows keeps its stored rollup", () => {
  const f = fixture();
  try {
    f.store.analytics.recordHourly(hit("2026-09-10T08", "path", "/", 2));
    f.store.analytics.materialize("day", "2026-09-10");
    f.store.analytics.advanceRollupState("day", "2026-09-11", "2026-09-11T00:00:00Z");
    f.raw.exec("DELETE FROM analytics_hourly");
    assert.equal(f.store.analytics.materialize("day", "2026-09-10"), true);
    assert.equal(pageviewsOf(f.store, "2026-09-10"), 2);
  } finally {
    f.done();
  }
});

test("reads merge stored buckets with the still-open one", () => {
  const f = fixture();
  try {
    f.store.analytics.recordHourly([
      ...hit("2026-09-10T08", "path", "/", 2),
      ...hit("2026-09-11T08", "path", "/", 5),
    ]);
    f.store.analytics.materialize("day", "2026-09-10");
    f.store.analytics.materialize("day", "2026-09-11");
    f.store.analytics.advanceRollupState("day", "2026-09-11", "2026-09-11T09:00:00Z");
    // A hit that lands after the job: the open day is read live, the closed one is stored.
    f.store.analytics.recordHourly(hit("2026-09-11T09", "path", "/", 4));
    assert.equal(pageviewsOf(f.store, "2026-09-10"), 2);
    assert.equal(pageviewsOf(f.store, "2026-09-11"), 9);
    assert.deepEqual(f.store.analytics.rollupTop("day", "path", "2026-09-10", "2026-09-11"), [{ key: "/", count: 11 }]);
    // `through` never moves back.
    f.store.analytics.advanceRollupState("day", "2026-09-01", "2026-09-11T10:00:00Z");
    assert.equal(f.store.analytics.getRollupState("day")?.through, "2026-09-11");
  } finally {
    f.done();
  }
});

test("the first visit event is found in hourly rows, then in day rollups once pruned", () => {
  const f = fixture();
  try {
    assert.equal(f.store.analytics.confirmationSince(), null);
    f.store.analytics.recordHourly([...hit("2026-09-12T10", "visit", "scroll"), ...hit("2026-09-11T10", "visit", "click")]);
    assert.equal(f.store.analytics.confirmationSince(), "2026-09-11T10");
    f.store.analytics.materialize("day", "2026-09-11");
    f.raw.exec("DELETE FROM analytics_hourly WHERE bucket < '2026-09-12'");
    assert.equal(f.store.analytics.confirmationSince(), "2026-09-10T22", "start of the Berlin day 2026-09-11");
  } finally {
    f.done();
  }
});

test("clearing dimensions also drops their rollups and summary figures", () => {
  const f = fixture();
  try {
    f.store.analytics.recordHourly([...hit("2026-09-10T08", "path", "/", 2), ...hit("2026-09-10T08", "viewport", "desktop", 1)]);
    f.store.analytics.materialize("day", "2026-09-10");
    f.store.analytics.clearDimensions(["path"]);
    f.store.analytics.materialize("day", "2026-09-10");
    f.store.analytics.advanceRollupState("day", "2026-09-11", "2026-09-11T00:00:00Z");
    const s = f.store.analytics.summaryByBucket("day", "2026-09-10", "2026-09-10").get("2026-09-10");
    assert.equal(s?.pageviews, 0);
    assert.equal(s?.loads, 1);
  } finally {
    f.done();
  }
});

/** Copy migrations 0001..0020 only, to build a pre-rollup database. */
function legacyMigrationsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lg-legacy-mig-"));
  mkdirSync(dir, { recursive: true });
  const src = resolveMigrationsDir();
  for (const name of readdirSync(src)) {
    const m = /^(\d+)_.+\.sql$/.exec(name);
    if (m && Number(m[1]) <= 20) copyFileSync(join(src, name), join(dir, name));
  }
  return dir;
}

test("legacy analytics_daily rows become day rollups without double counting hourly days", () => {
  const dir = mkdtempSync(join(tmpdir(), "lg-backfill-"));
  const path = join(dir, "t.sqlite");
  const legacy = legacyMigrationsDir();
  try {
    const old = new DatabaseSync(path);
    runMigrations(old, legacy);
    const ins = old.prepare("INSERT INTO analytics_daily (day, dimension, key, count) VALUES (?, ?, ?, ?)");
    const today = new Date().toISOString().slice(0, 10);
    const longAgo = shiftDay(today, -300);
    const hourlyDay = shiftDay(today, -5);
    ins.run(longAgo, "path", "/", 7);
    ins.run(longAgo, "session_dwell", "1-3m", 2);
    ins.run(longAgo, "x:path:os", "/\u0001Linux", 9);
    ins.run(hourlyDay, "path", "/", 100); // already covered by the hourly rows below
    old.prepare("INSERT INTO analytics_hourly (bucket, dimension, key, count) VALUES (?, 'path', '/', 3)").run(`${hourlyDay}T12`);
    old.close();

    const store = openStore(path);
    try {
      const from = shiftDay(today, -365);
      const days = store.analytics.summaryByBucket("day", from, today);
      assert.ok(days.size > 0, "a 1y range is not empty");
      assert.equal(days.get(longAgo)?.pageviews, 7);
      assert.equal(days.get(longAgo)?.completed, 2);
      assert.equal(days.get(longAgo)?.sd_4, 2);
      assert.equal(days.get(hourlyDay)?.pageviews, 3, "the hourly day is not counted twice");
      const total = [...days.values()].reduce((n, s) => n + s.pageviews, 0);
      assert.equal(total, 10);
      assert.equal(store.analytics.getRollupState("day")?.approx, true);
      assert.deepEqual(store.analytics.rollupTop("day", "path", from, today), [{ key: "/", count: 10 }]);
    } finally {
      store.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(legacy, { recursive: true, force: true });
  }
});

test("0021 migrates up, down and up again against the real migrations", () => {
  const db = new DatabaseSync(":memory:");
  const dir = resolveMigrationsDir();
  const tables = (): string[] =>
    (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'analytics_%' ORDER BY name")
        .all() as { name: string }[]
    ).map((r) => r.name);
  const rollupTables = ["analytics_rollup", "analytics_rollup_state", "analytics_summary"];

  runMigrations(db, dir);
  for (const t of rollupTables) assert.ok(tables().includes(t), `${t} created`);
  db.prepare("INSERT INTO analytics_daily (day, dimension, key, count) VALUES ('2020-01-01', 'path', '/', 1)").run();

  const reverted = migrateDown(db, { to: 20, dir });
  assert.deepEqual(reverted.map((m) => m.version), [21]);
  for (const t of rollupTables) assert.ok(!tables().includes(t), `${t} dropped`);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM analytics_daily").get()?.n, 1, "legacy data survives the down");

  const again = runMigrations(db, dir);
  assert.deepEqual(again.map((m) => m.version), [21]);
  for (const t of rollupTables) assert.ok(tables().includes(t), `${t} recreated`);
  assert.equal(
    db.prepare("SELECT SUM(count) AS n FROM analytics_rollup WHERE grain='day'").get()?.n,
    1,
    "the backfill runs again from the surviving daily rows",
  );
});
