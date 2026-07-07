#!/usr/bin/env tsx
/**
 * `pnpm analytics <access.log> [ownHost]` — parse new log lines into anonymous
 * aggregates and exit. Point it at your reverse-proxy access log; schedule it
 * (cron/systemd timer) on the host. The IP is never stored.
 */
import { openStore } from "@lg/db";
import { loadEnv } from "../env.js";
import { ingestLog } from "./ingest.js";

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm analytics <access.log> [ownHost]");
  process.exit(2);
}
const ownHost = process.argv[3];

const env = loadEnv();
const store = openStore(env.dbPath);
const result = ingestLog(store, file, ownHost);
store.close();

console.log(
  `analytics: ${result.linesRead} new line(s), ${result.hits} aggregate hit(s) ` +
    `(offset ${result.fromOffset} → ${result.toOffset})`,
);
