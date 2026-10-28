import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migrateDown, runMigrations } from "../src/migrate.js";

function fixture(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lg-migrate-"));
  mkdirSync(dir, { recursive: true });
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

const FILES = {
  "0001_a.sql": "CREATE TABLE a (id INTEGER);",
  "0001_a.down.sql": "DROP TABLE a;",
  "0002_b.sql": "CREATE TABLE b (id INTEGER);",
  "0002_b.down.sql": "DROP TABLE b;",
  "0003_c.sql": "CREATE TABLE c (id INTEGER);",
};

const tables = (db: DatabaseSync): string[] =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('a','b','c') ORDER BY name").all() as { name: string }[]).map((r) => r.name);
const versions = (db: DatabaseSync): number[] =>
  (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as { version: number }[]).map((r) => r.version);

function withDir(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = fixture(files);
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("down files are not forward migrations and do not alter forward checksums", () => {
  withDir(FILES, (dir) => {
    const db = new DatabaseSync(":memory:");
    const applied = runMigrations(db, dir);
    assert.deepEqual(applied.map((m) => m.version), [1, 2, 3]);
    assert.deepEqual(tables(db), ["a", "b", "c"]);
    assert.deepEqual(runMigrations(db, dir), [], "second run verifies checksums and applies nothing");
  });
});

test("down reverts exactly the later migrations and removes their rows", () => {
  withDir({ ...FILES, "0003_c.down.sql": "DROP TABLE c;" }, (dir) => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db, dir);
    const reverted = migrateDown(db, { to: "0001", dir });
    assert.deepEqual(reverted.map((m) => m.version), [3, 2]);
    assert.deepEqual(tables(db), ["a"]);
    assert.deepEqual(versions(db), [1]);
  });
});

test("down aborts without changes when a down file is missing", () => {
  withDir(FILES, (dir) => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db, dir);
    assert.throws(() => migrateDown(db, { to: 0, dir }), /0003_c\.sql/);
    assert.deepEqual(tables(db), ["a", "b", "c"]);
    assert.deepEqual(versions(db), [1, 2, 3]);
  });
});

test("up again after down re-applies the reverted migrations", () => {
  withDir({ ...FILES, "0003_c.down.sql": "DROP TABLE c;" }, (dir) => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db, dir);
    migrateDown(db, { to: 1, dir });
    const again = runMigrations(db, dir);
    assert.deepEqual(again.map((m) => m.version), [2, 3]);
    assert.deepEqual(tables(db), ["a", "b", "c"]);
  });
});

test("reverting to the current version is a no-op and bad versions are rejected", () => {
  withDir(FILES, (dir) => {
    const db = new DatabaseSync(":memory:");
    runMigrations(db, dir);
    assert.deepEqual(migrateDown(db, { to: 3, dir }), []);
    assert.throws(() => migrateDown(db, { to: "abc", dir }), /Invalid migration version/);
  });
});
