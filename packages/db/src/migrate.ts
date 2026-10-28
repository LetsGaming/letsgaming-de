/**
 * Migration runner. Replaces the previous "re-exec schema.sql + swallow-all
 * ALTER" approach with a versioned system:
 *
 *   - migrations live in ./migrations as NNNN_name.sql, applied in numeric order;
 *   - each is applied once, in its own transaction, and recorded in
 *     schema_migrations with its sha256 checksum;
 *   - an optional NNNN_name.down.sql reverses a migration (see migrateDown); the
 *     forward runner and its checksums ignore down files;
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
import { resolveMigrationsDir } from "./database.js";

export interface AppliedMigration {
  version: number;
  name: string;
  checksum: string;
  appliedAt: string;
}

const MIGRATION_FILE = /^(\d+)_.+\.sql$/;
const DOWN_FILE = /^(\d+)_.+\.down\.sql$/;

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
      if (!match || DOWN_FILE.test(name)) return null;
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

export interface RevertedMigration {
  version: number;
  name: string;
}

export interface MigrateDownOptions {
  /** Revert every applied version strictly greater than this (e.g. 20 or "0020"). */
  to: number | string;
  dir?: string;
}

function parseVersion(value: number | string): number {
  const version = typeof value === "number" ? value : /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Invalid migration version: ${String(value)}`);
  }
  return version;
}

function discoverDown(dir: string): Map<number, { name: string; sql: string }> {
  const found = new Map<number, { name: string; sql: string }>();
  for (const name of readdirSync(dir)) {
    const match = DOWN_FILE.exec(name);
    if (match) found.set(Number(match[1]), { name, sql: readFileSync(join(dir, name), "utf8") });
  }
  return found;
}

/**
 * Revert applied migrations newer than `to`, newest first, each in its own
 * transaction. Aborts before changing anything if any of them has no down file.
 */
export function migrateDown(db: DB, options: MigrateDownOptions): RevertedMigration[] {
  const to = parseVersion(options.to);
  const dir = options.dir ?? resolveMigrationsDir();

  const targets: RevertedMigration[] = rows(
    db.prepare("SELECT version, name FROM schema_migrations WHERE version > ? ORDER BY version DESC"),
    to,
  ).map((row) => ({ version: Number(row.version), name: String(row.name) }));

  const downs = discoverDown(dir);
  const missing = targets.filter((target) => !downs.has(target.version));
  if (missing.length > 0) {
    throw new Error(
      `Cannot revert to ${to}: no .down.sql for applied migration(s) ${missing
        .map((m) => m.name)
        .join(", ")}. Nothing was changed.`,
    );
  }

  for (const target of targets) {
    const down = downs.get(target.version)!;
    try {
      transact(db, () => {
        db.exec(down.sql);
        db.prepare("DELETE FROM schema_migrations WHERE version = ?").run(target.version);
      });
    } catch (err) {
      throw new Error(`Reverting ${target.name} via ${down.name} failed: ${(err as Error).message}`);
    }
  }
  return targets;
}
