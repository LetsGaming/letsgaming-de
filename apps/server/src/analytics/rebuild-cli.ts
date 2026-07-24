#!/usr/bin/env tsx
/**
 * `pnpm analytics:rebuild <access.log> [ownHost]` — throw away everything derived
 * from the access log and derive it again with the current rules.
 *
 * Reclassifying in place can only fix the dimension it moves. A request that was
 * mistaken for a page view wrote five rows — `path`, `referrer`, `browser`, `os`,
 * `device` — and the aggregates record no link between them, so moving the `path`
 * row into `probe` leaves the other four behind. That's why a dashboard can show
 * "Probes: 1,300" and still report Chrome 863 on a site with forty visitors.
 *
 * The log is the source of truth and the aggregates are a projection of it, so
 * the honest repair is to rebuild the projection. Beacon dimensions (sections,
 * clicks, dwell, visits) are untouched: they come from the browser, and no log
 * replay can reconstruct them.
 *
 * Only rebuilds what the given log file still covers. Rotated-away days are gone
 * — check what your rotation keeps before running this, because it deletes
 * first.
 */
import { openStore, type AnalyticsDimension } from "@lg/db";
import { loadEnv } from "../env.js";
import { ingestLog } from "./ingest.js";

/** Everything `lineToHits` can produce. Keep in step with parse.ts. */
const LOG_DERIVED: readonly AnalyticsDimension[] = [
  "path",
  "referrer",
  "browser",
  "os",
  "device",
  "bot",
  "probe",
];

const env = loadEnv();

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm analytics:rebuild <access.log> [ownHost]");
  process.exit(2);
}

function defaultOwnHost(origin: string): string | undefined {
  try {
    return new URL(origin.split(",")[0]!.trim()).host || undefined;
  } catch {
    return undefined;
  }
}
const ownHost = process.argv[3] ?? defaultOwnHost(env.webOrigin);

const store = openStore(env.dbPath);
const removed = store.analytics.clearDimensions(LOG_DERIVED);
// Rewind so the ingest re-reads the file from the start instead of resuming
// where it left off and rebuilding nothing.
store.analytics.setOffset(file, 0);
const result = ingestLog(store, file, ownHost);
store.close();

console.log(
  `analytics: dropped ${removed} log-derived row(s), re-read ${result.linesRead} line(s), ` +
    `wrote ${result.hits} aggregate hit(s). Engagement (beacon) data was not touched.`,
);
