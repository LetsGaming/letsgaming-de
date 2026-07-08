#!/usr/bin/env tsx
/**
 * `pnpm sync` — run every source once and exit. Handy for the first boot, for
 * cron on the host, or for a manual refresh. Exits non-zero if any source failed.
 */
import { openStore } from "@lg/db";
import { loadEnv } from "../env.js";
import { SyncRunner } from "./runner.js";

const env = loadEnv();
const store = openStore(env.dbPath);
const runner = new SyncRunner(store, {
  githubUsername: env.github.username,
  githubToken: env.github.token,
  ...(env.wakapi ? { wakapiUrl: env.wakapi.url, wakapiKey: env.wakapi.key } : {}),
  ...(env.steam ? { steamApiKey: env.steam.apiKey, steamId: env.steam.steamId } : {}),
  useMocks: process.env.NODE_ENV !== "production",
});

const results = await runner.runAll();
store.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) {
  const tag = r.ok ? "ok" : "FAILED";
  console.log(`${r.sourceId}: ${tag}${r.mock ? " (mock)" : ""}${r.error ? ` — ${r.error}` : ""}`);
}
process.exit(failed.length > 0 ? 1 : 0);
