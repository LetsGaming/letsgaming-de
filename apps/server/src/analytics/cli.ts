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

// Defaults to the log the server is already ingesting, so the path can't drift
// from the one in ACCESS_LOG — inside the container that's a path under /logs.
const file = process.argv[2] ?? env.accessLog;
if (!file) {
  console.error("usage: analytics <access.log> [ownHost]   (or set ACCESS_LOG)");
  process.exit(2);
}
/**
 * The site's own hostname, so internal navigation isn't filed as a referral.
 *
 * `ANALYTICS_OWN_HOST` is the setting that exists for this; the `WEB_ORIGIN`
 * host is a fallback so the common case needs no extra configuration. It was
 * optional and easy to omit, and omitting it is not harmless: the proxy's
 * HTTP→HTTPS redirect makes the browser send `Referer: http://<site>` on the
 * follow-up request, so every visit would report the site as its own referrer.
 */
function resolveOwnHost(): string | undefined {
  if (process.argv[3]) return process.argv[3];
  if (env.analyticsOwnHost) return env.analyticsOwnHost;
  try {
    return new URL(env.webOrigin.split(",")[0]!.trim()).host || undefined;
  } catch {
    return undefined;
  }
}
const ownHost = resolveOwnHost();

const store = openStore(env.dbPath);
const result = ingestLog(store, file, ownHost);
store.close();

console.log(
  `analytics: ${result.linesRead} new line(s), ${result.hits} aggregate hit(s) ` +
    `(offset ${result.fromOffset} → ${result.toOffset})`,
);
