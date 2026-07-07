import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** The better-sqlite3 instance type, aliased so repos don't import the namespace. */
export type DB = Database.Database;

/**
 * Open the store and ensure the schema exists. Uses better-sqlite3 — synchronous,
 * fast, and the battle-tested standard for a single-process homelab deploy.
 *
 * @param path - file path, or ":memory:" for tests.
 */
export function openDatabase(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
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

export { Database };
