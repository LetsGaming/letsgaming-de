#!/usr/bin/env tsx
/**
 * `pnpm analytics:rollup [--from YYYY-MM-DD --to YYYY-MM-DD]` — (re)build the
 * materialized rollups from the hourly counters.
 *
 * Without a range it catches both grains up from where they stopped (or from the
 * oldest hourly row on a fresh store). With a range it recomputes exactly those
 * Berlin days. Idempotent: running it again changes nothing.
 */
import { openStore } from "@lg/db";
import { loadEnv } from "../env.js";
import { catchUp, rollupDays } from "./rollup.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const from = flag("from");
const to = flag("to");
if ((from && !DAY.test(from)) || (to && !DAY.test(to)) || Boolean(from) !== Boolean(to)) {
  console.error("usage: analytics:rollup [--from YYYY-MM-DD --to YYYY-MM-DD]   (both or neither)");
  process.exit(2);
}
if (from && to && from > to) {
  console.error("analytics:rollup: --from must not be after --to");
  process.exit(2);
}

const env = loadEnv();
const store = openStore(env.dbPath);
const result = from && to ? rollupDays(store, from, to) : catchUp(store);
store.close();

console.log(`analytics: rolled up ${result.day} day bucket(s) and ${result.hour} hour bucket(s).`);
