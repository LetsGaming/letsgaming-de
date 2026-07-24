#!/usr/bin/env tsx
/**
 * `pnpm analytics:reclassify` — re-file already-stored rows through the current
 * classifiers, and report what moved.
 *
 * Classification happens at ingest, so rows written before a rule existed keep
 * their old dimension. When the probe detector was added, every scanner request
 * already in the store was still counted as a page view — and the only other way
 * to clear them was to wait out the 90-day retention or delete the range, which
 * would take the real traffic with it.
 *
 * Safe to run repeatedly: a row that no longer matches is left alone, and one
 * that has already moved isn't in the source dimension any more.
 */
import { openStore } from "@lg/db";
import { loadEnv } from "../env.js";
import { probeFamily } from "./probe.js";

const env = loadEnv();
const store = openStore(env.dbPath);

// `path` rows whose path could only have come from a scanner become `probe`
// rows; anything that still looks like a real request stays put.
const moved = store.analytics.reclassify("path", "probe", (key) => probeFamily(key));

store.close();
console.log(
  moved > 0
    ? `analytics: reclassified ${moved} request(s) from page views to probes.`
    : "analytics: nothing to reclassify — no stored page views look like probes.",
);
