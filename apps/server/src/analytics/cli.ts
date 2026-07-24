#!/usr/bin/env tsx
/**
 * `pnpm analytics <access.log> [ownHost]` — parse new log lines into anonymous
 * aggregates and exit. Point it at your reverse-proxy access log; schedule it
 * (cron/systemd timer) on the host. The IP is never stored.
 */
import { openStore } from "@lg/db";
import { loadEnv } from "../env.js";
import { ingestLog } from "./ingest.js";

const env = loadEnv();

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm analytics <access.log> [ownHost]");
  process.exit(2);
}
/**
 * The site's own hostname, so internal navigation isn't filed as a referral.
 *
 * Defaults to the host of `WEB_ORIGIN` rather than requiring the argument. It
 * was optional and easy to omit, and omitting it is not harmless: the proxy's
 * HTTP→HTTPS redirect makes the browser send `Referer: http://<site>` on the
 * follow-up request, so every visit would report the site as its own referrer.
 */
function defaultOwnHost(origin: string): string | undefined {
  try {
    return new URL(origin.split(",")[0]!.trim()).host || undefined;
  } catch {
    return undefined;
  }
}
const ownHost = process.argv[3] ?? defaultOwnHost(env.webOrigin);

const store = openStore(env.dbPath);
const result = ingestLog(store, file, ownHost);
store.close();

console.log(
  `analytics: ${result.linesRead} new line(s), ${result.hits} aggregate hit(s) ` +
    `(offset ${result.fromOffset} → ${result.toOffset})`,
);
