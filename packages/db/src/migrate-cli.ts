#!/usr/bin/env tsx
/**
 * `pnpm db:migrate:down --to <version> [--db <path>]` — revert every applied
 * migration newer than <version>, newest first, using its NNNN_name.down.sql.
 *
 * Stop the server and copy the database file first. Opens the file without running
 * forward migrations, so reverting never re-applies what it just removed.
 */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrateDown } from "./migrate.js";

const { values } = parseArgs({
  options: { to: { type: "string" }, db: { type: "string" } },
});

if (values.to === undefined) {
  console.error("usage: db:migrate:down --to <version> [--db <path>]   (default db: DB_PATH or ./data/letsgaming.sqlite)");
  process.exit(2);
}

const dbPath = resolve(values.db ?? process.env.DB_PATH ?? "./data/letsgaming.sqlite");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000");

try {
  const reverted = migrateDown(db, { to: values.to });
  if (reverted.length === 0) {
    console.log(`db: nothing to revert, no applied migration is newer than ${values.to}.`);
  } else {
    for (const m of reverted) console.log(`db: reverted ${m.name}`);
    console.log(`db: ${reverted.length} migration(s) reverted in ${dbPath}.`);
  }
} catch (err) {
  console.error(`db: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  db.close();
}
