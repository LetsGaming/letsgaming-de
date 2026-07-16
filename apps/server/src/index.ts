import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { getStore } from "./store.js";
import { SyncRunner } from "./sync/runner.js";
import { ingestLog } from "./analytics/ingest.js";
import cron from "node-cron";
import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";

/** Where docker-compose mounts ACCESS_LOG_DIR inside the container. */
const LOG_MOUNT = "/logs";

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
      const message = (err as Error).message;
      // ACCESS_LOG_DIR is the HOST directory; ACCESS_LOG is the path INSIDE the
      // container, under the /logs mount. Both look like paths, and setting them
      // consistently — the intuitive move — is wrong. "ENOENT" is technically
      // true and useless: the file exists, just not where we were told to look.
      // If the same basename is sitting under /logs, say the actual fix.
      if (message.includes("ENOENT") && !file.startsWith(`${LOG_MOUNT}/`)) {
        const guess = `${LOG_MOUNT}/${basename(file)}`;
        if (existsSync(guess)) {
          app.log.warn(
            `[analytics] ACCESS_LOG is "${file}", which doesn't exist in the container — ` +
              `that looks like the HOST path. The log is mounted at ${LOG_MOUNT}. ` +
              `Set ACCESS_LOG=${guess} (ACCESS_LOG_DIR stays the host directory).`,
          );
          return;
        }
      }
      // EACCES: the file is there and we can't read it. The container runs as
      // `node` (see Dockerfile) and a proxy access log is typically root:adm 0640,
      // so this is the default outcome, not an edge case. "permission denied" is
      // true and unactionable — report who we are and what the file wants, so the
      // fix is arithmetic rather than a guess.
      if (message.includes("EACCES")) {
        try {
          const st = statSync(file);
          const mode = (st.mode & 0o777).toString(8).padStart(4, "0");
          const where =
            st.gid === 0
              ? // Joining group 0 would hand the container root's group rights and
                // undo `USER node`. A file that is root:root 0600 has no group to
                // borrow — it has to be given one on the host first.
                `give it a readable group on the host (chgrp <group> ${file} && chmod 640), ` +
                `then add that gid via compose group_add`
              : `add the container to its group (compose: group_add: ["${st.gid}"])`;
          app.log.warn(
            `[analytics] can't read ${file}: mode ${mode}, owner ${st.uid}:${st.gid}; ` +
              `this process is ${process.getuid?.() ?? "?"}:${process.getgid?.() ?? "?"}. ` +
              `To fix, ${where}. Whatever writes the log must keep that mode — ` +
              `logrotate's "create" directive, or the writer's umask — or the next ` +
              `rotation silently reverts it.`,
          );
          return;
        } catch {
          /* fall through to the generic warning */
        }
      }
      app.log.warn(`[analytics] ingest skipped: ${message}`);
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
