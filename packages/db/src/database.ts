import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runMigrations } from "./migrate.js";

const here = dirname(fileURLToPath(import.meta.url));

/** The store handle type. node:sqlite is built in — no native build step, which
 *  keeps local dev, Docker, and CI free of node-gyp/prebuild surprises. */
export type DB = DatabaseSync;

/**
 * Open the store, set connection pragmas, and bring the schema up to date via the
 * versioned migration runner (see migrate.ts).
 *
 * @param path - file path, or ":memory:" for tests.
 */
export function openDatabase(path: string): DB {
  const db = new DatabaseSync(path);
  // Connection pragmas: WAL journalling with its safe/fast durability pairing,
  // foreign-key enforcement, and a busy timeout so a brief writer lock retries
  // instead of throwing SQLITE_BUSY (the sync worker and request-path writes
  // contend on a single-writer store).
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA busy_timeout = 5000");
  runMigrations(db, resolveMigrationsDir());
  return db;
}

/** Locate the migrations directory in both dev (src/) and built (dist/) layouts. */
function resolveMigrationsDir(): string {
  // In dist/ the migrations are copied alongside the JS (dist/migrations); in src/
  // (tsx dev/tests) they sit next to this file.
  const candidates = [join(here, "migrations"), join(here, "..", "src", "migrations")];
  for (const dir of candidates) {
    if (existsSync(join(dir, "0001_init.sql"))) return dir;
  }
  return candidates[0]!;
}

export { DatabaseSync };
