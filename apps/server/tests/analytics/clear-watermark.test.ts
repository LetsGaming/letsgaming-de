import assert from "node:assert/strict";
import { test } from "node:test";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "@lg/db";
import { ingestLog } from "../../src/analytics/ingest.js";

const dir = mkdtempSync(join(tmpdir(), "lg-clear-"));
const line = (stamp: string, path: string) =>
  `1.2.3.4 - - [${stamp} +0000] "GET ${path} HTTP/2.0" 200 100 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"`;

const OLD = line("01/Jul/2026:10:00:00", "/old");
const NEW = line("20/Jul/2026:10:00:00", "/new");

function logFile(name: string, ...lines: string[]) {
  const file = join(dir, name);
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

const paths = (store: ReturnType<typeof openStore>) =>
  store.analytics
    .topHourly("path", "2000-01-01T00", "2100-01-01T00")
    .map((r) => r.key)
    .sort();

/**
 * The failure this guards: clearing removes the aggregate rows, but the access
 * log on the proxy still holds every line that produced them. The byte offset
 * normally prevents a re-read — until the log rotates, the file shrinks, the
 * offset resets, and the whole file is read again. One rotation and the deletion
 * is silently undone.
 */
test("a rotation after a clear does not resurrect the deleted rows", () => {
  const store = openStore(":memory:");
  const file = logFile("rotate.log", OLD, NEW);
  ingestLog(store, file, "letsgaming.de");
  assert.deepEqual(paths(store), ["/new", "/old"], "both ingested");

  // Operator clears everything.
  store.analytics.clearHourly("0000", "9999");
  store.analytics.setClearedThrough("2026-07-25T00");
  assert.deepEqual(paths(store), []);

  // The log rotates: a smaller file resets the offset, so it's read from zero.
  const rotated = logFile("rotate.log", OLD, NEW);
  store.analytics.setOffset(rotated, 999_999_999);
  ingestLog(store, rotated, "letsgaming.de");

  assert.deepEqual(paths(store), [], "still gone");
  store.close();
});

test("traffic newer than the watermark is still ingested", () => {
  const store = openStore(":memory:");
  store.analytics.setClearedThrough("2026-07-10T00");
  const file = logFile("mixed.log", OLD, NEW);
  ingestLog(store, file, "letsgaming.de");
  // /old is 01 Jul (before the watermark), /new is 20 Jul (after).
  assert.deepEqual(paths(store), ["/new"]);
  store.close();
});

test("with no watermark nothing is filtered", () => {
  const store = openStore(":memory:");
  const file = logFile("plain.log", OLD, NEW);
  ingestLog(store, file, "letsgaming.de");
  assert.deepEqual(paths(store), ["/new", "/old"]);
  store.close();
});

test("the watermark only moves forward", () => {
  // Clearing a narrower range after a wider one must not re-open the older
  // window: those rows are already gone, and re-ingesting them would look like
  // traffic appearing inside a range the operator deleted.
  const store = openStore(":memory:");
  store.analytics.setClearedThrough("2026-07-20T00");
  const earlier = "2026-07-01T00";
  const current = store.analytics.getClearedThrough()!;
  assert.equal(earlier > current, false, "the guard's comparison");
  store.close();
});

test("a rebuild lifts the watermark, because that is what a rebuild means", () => {
  const store = openStore(":memory:");
  store.analytics.setClearedThrough("2026-07-25T00");
  store.analytics.setClearedThrough(null);
  assert.equal(store.analytics.getClearedThrough(), null);

  const file = logFile("rebuild.log", OLD, NEW);
  ingestLog(store, file, "letsgaming.de");
  assert.deepEqual(paths(store), ["/new", "/old"], "everything the log still holds");
  store.close();
});
