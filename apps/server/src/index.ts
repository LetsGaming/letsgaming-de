import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { getStore } from "./store.js";
import { SyncRunner } from "./sync/runner.js";
import { ingestLog } from "./analytics/ingest.js";
import cron from "node-cron";

const env = loadEnv();
const store = getStore(env.dbPath);

const app = await buildApp(store, env);

// The sync worker lives in-process (§10: one container for API + CMS + sync).
const runner = new SyncRunner(
  store,
  {
    githubUsername: env.github.username,
    githubToken: env.github.token,
    ...(env.wakapi ? { wakapiUrl: env.wakapi.url, wakapiKey: env.wakapi.key } : {}),
    ...(env.steam ? { steamApiKey: env.steam.apiKey, steamId: env.steam.steamId } : {}),
    useMocks: process.env.NODE_ENV !== "production",
  },
  (msg) => app.log.info(msg),
  env.retainHourlyDays,
);
runner.start();

// Traffic analytics: if an access log is configured, ingest it in-process on a
// schedule (incremental + idempotent) so path/referrer/browser/OS/device stats
// populate without a separate cron. Engagement analytics come from the live
// beacon; this is the log-derived half. Missing/rotated files degrade quietly.
let ingestTask: ReturnType<typeof cron.schedule> | undefined;
if (env.accessLog) {
  const file = env.accessLog;
  const ownHost =
    env.analyticsOwnHost ??
    (() => {
      try {
        return new URL(env.webOrigin).host;
      } catch {
        return undefined;
      }
    })();
  const runIngest = () => {
    try {
      const r = ingestLog(store, file, ownHost);
      if (r.hits) {
        app.log.info(`[analytics] ingested ${r.linesRead} line(s), ${r.hits} hit(s)`);
      } else if (r.linesRead > 0) {
        // Lines were read and none parsed. ADR 0013's "degrade quietly" is right
        // for a *missing* log and wrong for a present, unreadable one: the two
        // looked identical, so a format mismatch was indistinguishable from "not
        // configured". The parser wants nginx/Apache combined; Caddy and Traefik
        // default to JSON. Say so once, with evidence, instead of nothing.
        app.log.warn(
          `[analytics] read ${r.linesRead} line(s) from ${r.file} and parsed none — ` +
            `the parser expects nginx/Apache combined format. First unreadable line: ` +
            `${r.unparsedSample ?? "(none captured)"}`,
        );
      }
    } catch (err) {
      app.log.warn(`[analytics] ingest skipped: ${(err as Error).message}`);
    }
  };
  runIngest(); // once at boot
  ingestTask = cron.schedule("*/5 * * * *", runIngest); // then every 5 minutes
  app.log.info(`[analytics] access-log ingest scheduled for ${file}`);
}

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  runner.stop();
  ingestTask?.stop();
  await app.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: env.port, host: env.host });
