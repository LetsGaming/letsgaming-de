import assert from "node:assert/strict";
import { test } from "node:test";
import { openStore } from "@lg/db";

/**
 * The bug report was "no way to tell an ingest is silently broken from a quiet
 * day with no traffic". These prove the watermark repo methods (used by the
 * cron in src/index.ts and surfaced on the /analytics route) record success
 * and failure independently, and that a later success clears a prior error.
 */

test("no ingest yet reports an empty status", () => {
  const store = openStore(":memory:");
  assert.deepEqual(store.analytics.getIngestStatus("/var/log/access.log"), {});
  store.close();
});

test("a recorded success is readable back", () => {
  const store = openStore(":memory:");
  store.analytics.recordIngestSuccess("/var/log/access.log", "2026-09-18T10:00:00.000Z");
  assert.deepEqual(store.analytics.getIngestStatus("/var/log/access.log"), {
    lastSuccessAt: "2026-09-18T10:00:00.000Z",
  });
  store.close();
});

test("a failure after a success keeps the last-known-good timestamp", () => {
  const store = openStore(":memory:");
  store.analytics.recordIngestSuccess("/var/log/access.log", "2026-09-18T10:00:00.000Z");
  store.analytics.recordIngestFailure("/var/log/access.log", "ENOENT: no such file");
  assert.deepEqual(store.analytics.getIngestStatus("/var/log/access.log"), {
    lastSuccessAt: "2026-09-18T10:00:00.000Z",
    lastError: "ENOENT: no such file",
  });
  store.close();
});

test("a success after a failure clears the error", () => {
  const store = openStore(":memory:");
  store.analytics.recordIngestFailure("/var/log/access.log", "EACCES: permission denied");
  store.analytics.recordIngestSuccess("/var/log/access.log", "2026-09-18T11:00:00.000Z");
  assert.deepEqual(store.analytics.getIngestStatus("/var/log/access.log"), {
    lastSuccessAt: "2026-09-18T11:00:00.000Z",
  });
  store.close();
});

test("different sources track their status independently", () => {
  const store = openStore(":memory:");
  store.analytics.recordIngestSuccess("/var/log/a.log", "2026-09-18T10:00:00.000Z");
  store.analytics.recordIngestFailure("/var/log/b.log", "boom");
  assert.deepEqual(store.analytics.getIngestStatus("/var/log/a.log"), {
    lastSuccessAt: "2026-09-18T10:00:00.000Z",
  });
  assert.deepEqual(store.analytics.getIngestStatus("/var/log/b.log"), { lastError: "boom" });
  store.close();
});
