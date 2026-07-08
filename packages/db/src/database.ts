import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The store handle type. node:sqlite is built in — no native build step, which
 *  keeps local dev, Docker, and CI free of node-gyp/prebuild surprises. */
export type DB = DatabaseSync;

/**
 * Open the store and ensure the schema exists.
 *
 * @param path - file path, or ":memory:" for tests.
 */
export function openDatabase(path: string): DB {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(readFileSync(resolveSchemaPath(), "utf8"));
  migrateColumns(db);
  return db;
}

/**
 * Additive column migrations for tables that predate a column. `ADD COLUMN` is
 * idempotent here because a duplicate-column error is caught and ignored — so
 * fresh databases (which already have the column from schema.sql) are unaffected.
 */
function migrateColumns(db: DB): void {
  const adds = [
    "ALTER TABLE gallery ADD COLUMN module TEXT NOT NULL DEFAULT 'gallery'",
    "ALTER TABLE gallery ADD COLUMN alt TEXT",
  ];
  for (const sql of adds) {
    try {
      db.exec(sql);
    } catch {
      /* column already exists — expected on fresh/upgraded databases */
    }
  }
}

function resolveSchemaPath(): string {
  // In dist/ the sql ships one dir up in src/; in src/ (tsx dev/tests) it's local.
  const candidates = [join(here, "schema.sql"), join(here, "..", "src", "schema.sql")];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return candidates[0]!;
}

export { DatabaseSync };
