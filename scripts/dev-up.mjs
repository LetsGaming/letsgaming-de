#!/usr/bin/env node
/**
 * Run this BEFORE doing any manual/dashboard work in this repo. Starts an
 * isolated backend (Fastify, `apps/server`) + frontend (Nuxt, `apps/web`) pair
 * — own SQLite file, own media dir, own log dir, own free ports — migrates
 * that database (the server does this on boot) and seeds it with realistic
 * mock data covering guestbook, playtime, and listening history, then prints
 * the URLs to use.
 *
 * `NODE_ENV` is deliberately left unset (not "production"), which is what
 * makes the server register `/auth/dev/login` and fall back to the
 * deterministic GitHub/Wakapi mock sources (`useMocks: !isProduction` in
 * `apps/server/src/sync/runner.ts`) — real repos/languages/graph data with no
 * token needed.
 *
 * `--id <name>` (default: "default") namespaces everything — data/agent-<id>/
 * — so multiple sessions working in this same checkout at once never collide
 * on the same database file or port. Nested under `data/`, which the repo
 * already `.gitignore`s at the root. Always pair with
 * `scripts/dev-down.mjs --id <name>` when done.
 *
 * Usage: node scripts/dev-up.mjs [--id <name>]
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const serverDir = path.join(repoRoot, "apps", "server");
const webDir = path.join(repoRoot, "apps", "web");

function parseArgs(argv) {
  const args = { id: "default" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id" && argv[i + 1] !== undefined) args.id = argv[++i];
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(args.id)) {
    throw new Error(`--id must be alphanumeric/dash/underscore only, got: ${args.id}`);
  }
  return args;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // Not listening yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/** Detached + unref'd so the child outlives this script's own process, with its output going straight to a log file instead of a pipe this process would otherwise need to stay alive to drain. */
function spawnBackground(command, args, { cwd, env, logFile }) {
  const fd = fs.openSync(logFile, "a");
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  child.unref();
  return child;
}

/** apps/server and apps/web depend on the workspace packages (@lg/core, @lg/db,
 *  @lg/sources) as built `dist/` output, not source — same as the root `dev`
 *  script (`pnpm -r --filter=./packages/* build`). Running it here means a dev
 *  session always reflects the current source, not a stale prior build. */
function buildWorkspacePackages(log) {
  log("building workspace packages (@lg/core, @lg/db, @lg/sources)...");
  const result = spawnSync("pnpm", ["-r", "--filter=./packages/*", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`workspace package build failed (exit ${result.status})`);
  }
}

async function main() {
  const { id } = parseArgs(process.argv.slice(2));
  const log = (msg) => console.log(`[dev-up:${id}] ${msg}`);

  // Nested under data/agent-<id>/ so both the database and its logs fall under
  // the repo root's existing `/data/` gitignore entry — no separate ignore rule
  // needed for a top-level logs/ directory.
  const dataDir = path.join(repoRoot, "data", `agent-${id}`);
  const logDir = path.join(dataDir, "logs");
  const mediaDir = path.join(dataDir, "media");
  const dbPath = path.join(dataDir, "letsgaming.sqlite");
  const sessionFile = path.join(dataDir, "dev-session.json");

  // Defensive: a previous run under this id may have crashed before
  // dev-down.mjs ran. Start from an actually-clean slate either way.
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(mediaDir, { recursive: true });

  buildWorkspacePackages(log);

  const backendPort = await getFreePort();
  const webPort = await getFreePort();
  const webOrigin = `http://localhost:${webPort}`;
  const apiOrigin = `http://localhost:${backendPort}`;

  // CMS auth: a bearer token (or OAuth) is what "enabled" means to the server
  // (assertSecureConfig in apps/server/src/env.ts refuses to boot the CMS with
  // an empty/default session secret), so both are generated fresh per session.
  // /auth/dev/login (loopback-only, non-production-only — apps/server/src/auth/
  // dev-login.ts) mints the session cookie from these without a GitHub round-trip.
  const cmsToken = randomBytes(24).toString("hex");
  const sessionSecret = randomBytes(32).toString("hex");

  const sharedEnv = {
    ...process.env,
    TZ: "Europe/Berlin",
    DB_PATH: dbPath,
    MEDIA_DIR: mediaDir,
  };
  delete sharedEnv.NODE_ENV; // never "production" here — see module docstring

  const backendEnv = {
    ...sharedEnv,
    PORT: String(backendPort),
    HOST: "127.0.0.1",
    WEB_ORIGIN: webOrigin,
    TRUST_PROXY: "false",
    CMS_TOKEN: cmsToken,
    SESSION_SECRET: sessionSecret,
    CMS_ALLOWED_LOGIN: "LetsGaming",
  };

  const tsxCli = path.join(serverDir, "node_modules", "tsx", "dist", "cli.mjs");

  log(`starting backend on :${backendPort} (db: ${dbPath})`);
  const backendLog = path.join(logDir, "backend.out.log");
  const backend = spawnBackground(process.execPath, [tsxCli, "src/index.ts"], {
    cwd: serverDir,
    env: backendEnv,
    logFile: backendLog,
  });

  const backendReady = await waitForHttp(`${apiOrigin}/health`, 20000);
  if (!backendReady) {
    log(`backend did not respond within 20s — check ${backendLog}`);
    process.exit(1);
  }
  log("backend ready");

  // The sync worker's mock GitHub/Wakapi fetch and the guestbook/presence/music
  // seed below both write to the store, but to disjoint tables, so nothing here
  // depends on the mock sync finishing first — no extra delay needed.
  log("seeding mock data (guestbook, playtime, listening history)...");
  await new Promise((resolve, reject) => {
    const seed = spawn(process.execPath, [tsxCli, "scripts/seed-mock-data.ts"], {
      cwd: serverDir,
      env: backendEnv,
      stdio: "inherit",
    });
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed-mock-data.ts exited with code ${code}`))));
  });

  const webEnv = {
    ...sharedEnv,
    API_URL: apiOrigin,
    PUBLIC_API_URL: apiOrigin,
    PUBLIC_SITE_URL: webOrigin,
  };

  const nuxtCli = path.join(webDir, "node_modules", "nuxt", "bin", "nuxt.mjs");
  log(`starting frontend on :${webPort}`);
  const webLog = path.join(logDir, "web.out.log");
  const web = spawnBackground(process.execPath, [nuxtCli, "dev", "--port", String(webPort)], {
    cwd: webDir,
    env: webEnv,
    logFile: webLog,
  });

  const webReady = await waitForHttp(webOrigin, 30000);
  if (!webReady) {
    log(`frontend did not respond within 30s — check ${webLog}`);
  }

  fs.writeFileSync(
    sessionFile,
    JSON.stringify(
      {
        id,
        backendPort,
        webPort,
        backendPid: backend.pid,
        webPid: web.pid,
        dataDir,
        logDir,
        dbPath,
        mediaDir,
        cmsToken,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  console.log("");
  log("ready.");
  console.log(`  Frontend:   ${webOrigin}`);
  console.log(`  Dev login:  ${apiOrigin}/auth/dev/login  (redirects into ${webOrigin}/admin)`);
  console.log(`  Backend:    ${apiOrigin}`);
  console.log(`  CMS token:  ${cmsToken}  (Authorization: Bearer <token>, if you need the API directly)`);
  console.log(`  Logs:       ${logDir}`);
  console.log(`  When done:  node scripts/dev-down.mjs --id ${id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
