/**
 * The one audited place where an untyped SQLite row becomes a typed value.
 *
 * node:sqlite returns rows as `unknown` — previously every repository cast that
 * with `as unknown as Row[]`, which is `any` in disguise: a renamed/removed column
 * compiled fine and broke at runtime. Instead, reads go through `mapRows`/`mapRow`
 * with a per-table reader function, so the only unchecked step (row → object) lives
 * here, once, and is easy to reason about.
 */

import type { DB } from "./database.js";
import type { StatementSync, SQLInputValue } from "node:sqlite";

/** A raw DB row: a bag of columns whose values still need narrowing. */
export type Row = Record<string, unknown>;

/** Run a prepared statement and return raw rows. The single audited cast. */
export function rows(stmt: StatementSync, ...params: SQLInputValue[]): Row[] {
  // `.all()` is typed `unknown[]`; each element is a column-keyed object. This is
  // the only place we assert that shape — everything downstream is narrowed by hand.
  return stmt.all(...params) as Row[];
}

/** Run a statement and map each row through a typed reader. */
export function mapRows<T>(stmt: StatementSync, read: (row: Row) => T, ...params: SQLInputValue[]): T[] {
  return rows(stmt, ...params).map(read);
}

/** Run a statement expected to return at most one row; map it if present. */
export function mapRow<T>(stmt: StatementSync, read: (row: Row) => T, ...params: SQLInputValue[]): T | undefined {
  const row = stmt.get(...params) as Row | undefined;
  return row ? read(row) : undefined;
}

// ── column coercers (narrow `unknown` explicitly) ────────────────────────────
export const asText = (v: unknown): string => String(v);
export const asNullableText = (v: unknown): string | null => (v == null ? null : String(v));
export const asNumber = (v: unknown): number => Number(v);
/** SQLite stores booleans as 0/1. */
export const asBool = (v: unknown): boolean => v === 1 || v === true;
export const boolToInt = (b: boolean | undefined): 0 | 1 => (b ? 1 : 0);
/** Parse a JSON TEXT column into a domain shape. */
export const json = <T>(v: unknown): T => JSON.parse(String(v)) as T;

// ── shared data-layer constants + tiny write helpers ─────────────────────────
/** The id of a single-row ("singleton") table (site_content, site_ia, …). */
export const SINGLETON_ID = 1;

/**
 * Depth counter per connection, so `transact` can nest. SQLite errors on a
 * `BEGIN` issued while already inside a transaction, and `content-repo.ts`'s
 * `write()` (itself a `transact`) is called from within callers that may
 * already be inside one (e.g. seeding several content entities as one atomic
 * boot step). Only the outermost call opens/closes the real transaction;
 * inner calls just run `fn` — a thrown error still unwinds to the outermost
 * catch, which is the only one that issues ROLLBACK.
 */
const txDepth = new WeakMap<DB, number>();

/**
 * Run `fn` inside a transaction: commit on return, roll back on throw.
 *
 * The BEGIN / try / COMMIT / catch-ROLLBACK-rethrow block was written out eight
 * times across five repositories — identical every time, which is the point:
 * it's mechanical, so it's the half that should be factored out while the SQL
 * stays where you can read it. Hand-copied, the copies drift (one of them had
 * an inverted sweep guard), and the copy that forgets its ROLLBACK leaves the
 * connection in a transaction with no error to explain it.
 *
 * node:sqlite is synchronous, so `fn` is too: there's no await inside a
 * transaction, and therefore no way to interleave a second one by accident.
 */
export function transact<T>(db: DB, fn: () => T): T {
  const depth = txDepth.get(db) ?? 0;
  const isOutermost = depth === 0;
  txDepth.set(db, depth + 1);
  if (isOutermost) db.exec("BEGIN");
  try {
    const result = fn();
    if (isOutermost) db.exec("COMMIT");
    return result;
  } catch (err) {
    if (isOutermost) db.exec("ROLLBACK");
    throw err;
  } finally {
    txDepth.set(db, depth);
  }
}

/**
 * Delete a row by primary key. `table` is always a static identifier from repo
 * code (never user input), so interpolating it is safe; the id is bound.
 */
export function deleteById(db: DB, table: string, id: string | number): boolean {
  const res = db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  return Number(res.changes) > 0;
}
