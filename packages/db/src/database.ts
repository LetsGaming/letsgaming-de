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
  return db;
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
