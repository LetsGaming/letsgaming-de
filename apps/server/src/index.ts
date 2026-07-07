import { buildApp } from "./app.js";
import { loadEnv } from "./env.js";
import { getStore } from "./store.js";
import { SyncRunner } from "./sync/runner.js";

const env = loadEnv();
const store = getStore(env.dbPath);

const app = await buildApp(store, env);

// The sync worker lives in-process (§10: one container for API + CMS + sync).
const runner = new SyncRunner(
  store,
  { githubUsername: env.github.username, githubToken: env.github.token },
  (msg) => app.log.info(msg),
);
runner.start();

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  runner.stop();
  await app.close();
  store.close();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await app.listen({ port: env.port, host: env.host });
