import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@lg/db";
import { ingestLog } from "./ingest.js";

/**
 * The bug report was "Top paths / referrers / browsers / OS / devices show no
 * data". Those come from the access-log ingest; this proves that once a log is
 * ingested, the exact read path the CMS uses (`topHourly`) returns the stats.
 */
test("ingesting an access log populates the traffic top-lists (topHourly)", () => {
  const store = openStore(":memory:");
  const file = join(tmpdir(), `lg-access-${process.pid}.log`);
  writeFileSync(
    file,
    [
      '1.2.3.4 - - [10/Oct/2026:13:00:00 +0000] "GET /work HTTP/1.1" 200 500 "https://news.ycombinator.com/" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"',
      '5.6.7.8 - - [10/Oct/2026:13:05:00 +0000] "GET / HTTP/1.1" 200 500 "-" "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Mobile Safari"',
      "",
    ].join("\n"),
  );
  try {
    const r = ingestLog(store, file, "letsgaming.de");
    assert.ok(r.hits > 0, "expected aggregate hits");

    const has = (dim: Parameters<typeof store.analytics.topHourly>[0], key: string) =>
      store.analytics.topHourly(dim, "2026-10-10T00", "2026-10-10T23").some((r) => r.key === key);

    assert.ok(has("path", "/work"));
    assert.ok(has("path", "/"));
    assert.ok(has("referrer", "news.ycombinator.com"));
    assert.ok(has("browser", "Chrome"));
    assert.ok(has("os", "Windows"));
    assert.ok(has("device", "mobile")); // the iPhone line

    // Re-running is incremental: nothing new to read, no double counts.
    const again = ingestLog(store, file, "letsgaming.de");
    assert.equal(again.hits, 0);
  } finally {
    rmSync(file, { force: true });
    store.close();
  }
});
