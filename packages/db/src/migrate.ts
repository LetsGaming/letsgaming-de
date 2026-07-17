/**
 * Migration runner. Replaces the previous "re-exec schema.sql + swallow-all
 * ALTER" approach with a versioned, forward-only system:
 *
 *   - migrations live in ./migrations as NNNN_name.sql, applied in numeric order;
 *   - each is applied once, in its own transaction, and recorded in
 *     schema_migrations with its sha256 checksum;
 *   - an already-applied migration whose file changed is a hard error — migrations
 *     are immutable history, so a change means someone edited the past. Add a new
 *     file instead.
 *
 * 0001_init is an idempotent baseline (CREATE TABLE IF NOT EXISTS), so a database
 * that predates this runner adopts it cleanly: the baseline no-ops the existing
 * tables and is recorded as applied.
 */

import { readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { DB } from "./database.js";
import { rows, transact } from "./row-mapper.js";

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

const MIGRATION_FILE = /^(\d+)_.+\.sql$/;

const checksum = (sql: string): string => createHash("sha256").update(sql).digest("hex");

interface Discovered {
  version: number;
  name: string;
  sql: string;
}

/** Discover migration files (NNNN_name.sql), sorted ascending by version. */
function discover(dir: string): Discovered[] {
  return readdirSync(dir)
    .map((name): Discovered | null => {
      const match = MIGRATION_FILE.exec(name);
      if (!match) return null;
      return { version: Number(match[1]), name, sql: readFileSync(join(dir, name), "utf8") };
    })
    .filter((entry): entry is Discovered => entry !== null)
    .sort((a, b) => a.version - b.version);
}

/**
 * Apply all pending migrations from `dir`. Returns the migrations applied on this
 * call (empty when the database is already current). Throws on checksum drift or a
 * failing migration (rolled back).
 */
export function runMigrations(db: DB, dir: string): AppliedMigration[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    checksum   TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Map<number, { name: string; checksum: string }>();
  for (const row of rows(db.prepare("SELECT version, name, checksum FROM schema_migrations"))) {
    applied.set(Number(row.version), { name: String(row.name), checksum: String(row.checksum) });
  }

  const result: AppliedMigration[] = [];
  for (const migration of discover(dir)) {
    const sum = checksum(migration.sql);
    const prior = applied.get(migration.version);

    if (prior) {
      if (prior.checksum !== sum) {
        throw new Error(
          `Migration ${migration.name} changed after being applied (checksum mismatch). ` +
            `Migrations are immutable — add a new migration instead of editing this one.`,
        );
      }
      continue; // already applied and unchanged
    }

    const appliedAt = new Date().toISOString();
    try {
      transact(db, () => {
        db.exec(migration.sql);
        db.prepare(
          "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)",
        ).run(migration.version, migration.name, sum, appliedAt);
      });
    } catch (err) {
      // Name the migration: "syntax error near ORDER" with no file is unfindable.
      throw new Error(`Migration ${migration.name} failed: ${(err as Error).message}`);
    }
    result.push({ version: migration.version, name: migration.name, checksum: sum, appliedAt });
  }
  return result;
}
