import assert from "node:assert/strict";
import { test } from "node:test";
import { rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore, type Store } from "@lg/db";
import { BURST_MIN, BURST_WINDOW_SECONDS, markBursts, type BurstEntry } from "../../src/analytics/burst.js";
import { ingestLog } from "../../src/analytics/ingest.js";

const OWN = "letsgaming.de";
const FF = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0";
const CH = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

test("markBursts: a page view with enough probes or dead links nearby is flagged", () => {
  const entries: BurstEntry[] = [
    { second: 100, class: "pageview" },
    ...Array.from({ length: BURST_MIN }, (_, i) => ({ second: 100 + i, class: i % 2 ? "probe" : "notfound" }) as BurstEntry),
  ];
  assert.deepEqual(markBursts(entries), [true, false, false, false]);
});

test("markBursts: one probe fewer than the minimum is not a burst", () => {
  const entries: BurstEntry[] = [
    { second: 100, class: "pageview" },
    ...Array.from({ length: BURST_MIN - 1 }, () => ({ second: 100, class: "probe" }) as BurstEntry),
  ];
  assert.equal(markBursts(entries)[0], false);
});

test("markBursts: the window is inclusive and reaches both ways", () => {
  const w = BURST_WINDOW_SECONDS;
  const probes = (at: number[]): BurstEntry[] => at.map((second) => ({ second, class: "notfound" }));
  const view: BurstEntry = { second: 1000, class: "pageview" };
  assert.equal(markBursts([view, ...probes([1000 - w, 1000, 1000 + w])])[0], true);
  assert.equal(markBursts([view, ...probes([1000 - w - 1, 1000, 1000 + w])])[0], false);
  assert.equal(markBursts([view, ...probes([1000 - w, 1000, 1000 + w + 1])])[0], false);
});

test("markBursts: only probes and dead links count, not bots, assets or other page views", () => {
  const entries: BurstEntry[] = [
    { second: 5, class: "pageview" },
    { second: 5, class: "pageview" },
    { second: 5, class: "bot" },
    { second: 5, class: "ignored" },
    { second: 5, class: "pageview" },
  ];
  assert.deepEqual(markBursts(entries), [false, false, false, false, false]);
});

test("markBursts: input order does not matter", () => {
  const sorted: BurstEntry[] = [
    { second: 1, class: "notfound" },
    { second: 2, class: "probe" },
    { second: 3, class: "pageview" },
    { second: 4, class: "notfound" },
  ];
  const shuffled = [sorted[3]!, sorted[2]!, sorted[0]!, sorted[1]!];
  assert.equal(markBursts(shuffled)[1], true);
});

const stamp = (secondOfDay: number): string => {
  const h = String(Math.floor(secondOfDay / 3600)).padStart(2, "0");
  const m = String(Math.floor((secondOfDay % 3600) / 60)).padStart(2, "0");
  const s = String(secondOfDay % 60).padStart(2, "0");
  return `26/Oct/2026:${h}:${m}:${s} +0000`;
};
const line = (secondOfDay: number, target: string, status: number, ua = CH): string =>
  `203.0.113.7 - - [${stamp(secondOfDay)}] "GET ${target} HTTP/2.0" ${status} 5120 "-" "${ua}"`;

const SCAN_PATHS = ["/login", "/register", "/contact", "/dashboard", "/billing", "/cart"];
const scan = (at: number, n: number): string[] =>
  Array.from({ length: n }, (_, i) => line(at, SCAN_PATHS[i % SCAN_PATHS.length]!, 404));

const DIMENSIONS = ["path", "referrer", "browser", "os", "device", "traffic", "exclusion", "bot", "probe", "source"] as const;
const snapshot = (store: Store): string =>
  JSON.stringify(
    DIMENSIONS.map((d) =>
      store.analytics
        .topHourly(d, "2026-10-01T00", "2026-10-31T23", 500)
        .map((r) => [r.key, r.count] as const)
        .sort((a, b) => a[0].localeCompare(b[0])),
    ),
  );

const LATE = Date.parse("2026-10-30T00:00:00Z");

function withLog(body: string, run: (file: string, store: Store) => void): void {
  const store = openStore(":memory:");
  const file = join(tmpdir(), `lg-burst-${process.pid}-${Math.random().toString(36).slice(2)}.log`);
  try {
    writeFileSync(file, body);
    run(file, store);
  } finally {
    rmSync(file, { force: true });
    store.close();
  }
}

function wholeFileSnapshot(body: string): string {
  let out = "";
  withLog(body, (file, store) => {
    ingestLog(store, file, OWN, LATE);
    out = snapshot(store);
  });
  return out;
}

/** Ingest the log in growing prefixes, as a scheduled job would while it is written. */
function incrementalSnapshot(body: string, cuts: number[], clockAt: (cut: number) => number): string {
  let out = "";
  const store = openStore(":memory:");
  const file = join(tmpdir(), `lg-burst-inc-${process.pid}-${Math.random().toString(36).slice(2)}.log`);
  try {
    const bytes = Buffer.from(body, "utf8");
    for (const cut of [...cuts, bytes.length]) {
      writeFileSync(file, bytes.subarray(0, cut));
      ingestLog(store, file, OWN, cut === bytes.length ? LATE : clockAt(cut));
    }
    out = snapshot(store);
  } finally {
    rmSync(file, { force: true });
    store.close();
  }
  return out;
}

test("a lone page view with only assets near it stays a page view", () => {
  const body =
    [
      line(1000, "/_nuxt/entry.js", 200, FF),
      line(1001, "/", 200, FF),
      line(1002, "/_nuxt/entry.css", 200, FF),
    ].join("\n") + "\n";
  withLog(body, (file, store) => {
    ingestLog(store, file, OWN, LATE);
    const traffic = Object.fromEntries(store.analytics.topHourly("traffic", "2026-10-26T00", "2026-10-26T23").map((r) => [r.key, r.count]));
    assert.deepEqual(traffic, { pageview: 1 });
  });
});

test("ingest reclassifies a page view that sits in a burst", () => {
  const body = [...scan(2000, 2), line(2000, "/", 200, FF), ...scan(2003, 2)].join("\n") + "\n";
  withLog(body, (file, store) => {
    ingestLog(store, file, OWN, LATE);
    const traffic = Object.fromEntries(store.analytics.topHourly("traffic", "2026-10-26T00", "2026-10-26T23").map((r) => [r.key, r.count]));
    assert.deepEqual(traffic, { notfound: 4, bot: 1 });
    assert.deepEqual(store.analytics.topHourly("path", "2026-10-26T00", "2026-10-26T23"), []);
  });
});

test("a page view whose window is still open is held back and recorded once, later", () => {
  const first = [line(3000, "/", 200, FF), ...scan(3001, 1)].join("\n") + "\n";
  const second = scan(3004, 3).join("\n") + "\n";
  withLog(first, (file, store) => {
    // The log's own clock has only just reached the page view, so more lines may follow.
    const early = ingestLog(store, file, OWN, Date.parse("2026-10-26T00:50:02Z"));
    assert.equal(early.toOffset, 0, "offset stays at the start of the held-back page view");
    assert.equal(store.analytics.topHourly("traffic", "2026-10-26T00", "2026-10-26T23").length, 0);

    writeFileSync(file, first + second);
    ingestLog(store, file, OWN, LATE);
    const traffic = Object.fromEntries(store.analytics.topHourly("traffic", "2026-10-26T00", "2026-10-26T23").map((r) => [r.key, r.count]));
    assert.deepEqual(traffic, { notfound: 4, bot: 1 });

    const again = ingestLog(store, file, OWN, LATE);
    assert.equal(again.hits, 0, "re-running records nothing twice");
  });
});

test("a quiet log is settled by the wall clock", () => {
  const body = line(4000, "/", 200, FF) + "\n";
  withLog(body, (file, store) => {
    const r = ingestLog(store, file, OWN, LATE);
    assert.equal(r.toOffset, statSync(file).size);
    assert.equal(store.analytics.topHourly("path", "2026-10-26T00", "2026-10-26T23")[0]?.key, "/");
  });
});

test("rebuild and incremental ingest agree on the fixture-style log, cut anywhere", () => {
  const body =
    [
      line(5000, "/", 200, FF),
      ...scan(5100, 4),
      line(5102, "/", 200, FF),
      line(5103, "/about", 200, CH),
      ...scan(5104, 3),
      line(5200, "/work", 200, FF),
      line(5300, "/", 200, FF),
      ...scan(5303, 3),
    ].join("\n") + "\n";
  const expected = wholeFileSnapshot(body);
  const size = Buffer.byteLength(body);
  const cuts = [37, Math.floor(size / 5), Math.floor(size / 3) + 11, Math.floor(size / 2), Math.floor((size * 3) / 4) + 5, size - 40];
  const clock = (cut: number): number => {
    const seen = body.slice(0, cut).split("\n").filter((l) => l.endsWith('"'));
    const last = seen[seen.length - 1];
    const m = last ? /\[26\/Oct\/2026:(\d\d):(\d\d):(\d\d)/.exec(last) : null;
    return m ? Date.parse(`2026-10-26T${m[1]}:${m[2]}:${m[3]}Z`) : 0;
  };
  assert.equal(incrementalSnapshot(body, cuts, clock), expected);
});

test("a burst that straddles two read chunks counts the same as one pass", () => {
  const CHUNK = 64 * 1024;
  const filler: string[] = [];
  let bytes = 0;
  while (bytes < CHUNK - 600) {
    const l = line(6000, "/_nuxt/entry.js", 200, FF);
    filler.push(l);
    bytes += Buffer.byteLength(l) + 1;
  }
  const before = scan(7000, 2);
  const view = line(7001, "/", 200, FF);
  const after = scan(7002, 6);
  const body = [...filler, ...before, view, ...after].join("\n") + "\n";

  const viewStart = Buffer.byteLength([...filler, ...before].join("\n") + "\n");
  const lastStart = Buffer.byteLength([...filler, ...before, view, ...after.slice(0, -1)].join("\n") + "\n");
  assert.ok(viewStart < CHUNK && lastStart > CHUNK, "the burst crosses the 64 KiB chunk boundary");

  const expected = wholeFileSnapshot(body);
  const traffic = JSON.parse(expected)[5] as [string, number][];
  assert.deepEqual(Object.fromEntries(traffic), { bot: 1, notfound: 8 });

  const cutInsideBurst = viewStart + 30;
  const clock = (): number => Date.parse("2026-10-26T01:56:41Z");
  assert.equal(incrementalSnapshot(body, [cutInsideBurst], clock), expected);
});
