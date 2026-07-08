import type { GuestbookEntry, GuestbookStatus, PublicGuestbookEntry } from "@lg/core";
import type { DB } from "./database.js";

interface Row {
  id: number;
  name: string;
  message: string;
  created_at: string;
  status: string;
  flags: string;
  score: number;
}

const toEntry = (r: Row): GuestbookEntry => ({
  id: r.id,
  name: r.name,
  message: r.message,
  createdAt: r.created_at,
  status: r.status as GuestbookStatus,
  flags: r.flags ? r.flags.split(",") : [],
  score: r.score,
});

/**
 * Repository for the pre-moderated guestbook. New entries land as `pending` and
 * are invisible to the public until the owner approves them. Only name, message
 * and a server timestamp are stored — no IP, no identifier (§ privacy).
 */
export function guestbookRepo(db: DB) {
  return {
    /** Insert a new pending entry; returns its id. `flags`/`score` sort the queue. */
    add(entry: { name: string; message: string; createdAt: string; flags: string[]; score: number }): number {
      const res = db
        .prepare(
          `INSERT INTO guestbook (name, message, created_at, status, flags, score)
           VALUES (?, ?, ?, 'pending', ?, ?)`,
        )
        .run(entry.name, entry.message, entry.createdAt, entry.flags.join(","), entry.score);
      return Number(res.lastInsertRowid);
    },

    /** Approved entries the public site may render, newest first. */
    listApproved(limit = 100): PublicGuestbookEntry[] {
      const rows = db
        .prepare(
          `SELECT id, name, message, created_at FROM guestbook
           WHERE status = 'approved' ORDER BY created_at DESC LIMIT ?`,
        )
        .all(limit) as Pick<Row, "id" | "name" | "message" | "created_at">[];
      return rows.map((r) => ({ id: r.id, name: r.name, message: r.message, createdAt: r.created_at }));
    },

    /**
     * The moderation queue for the CMS: pending first (most-suspicious first so
     * obvious spam is quick to clear), then the rest, newest within each group.
     */
    listForModeration(limit = 200): GuestbookEntry[] {
      const rows = db
        .prepare(
          `SELECT * FROM guestbook
           ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END,
                    CASE status WHEN 'pending' THEN score ELSE 0 END DESC,
                    created_at DESC
           LIMIT ?`,
        )
        .all(limit) as unknown as Row[];
      return rows.map(toEntry);
    },

    /** Count entries awaiting a decision (for a CMS badge). */
    countPending(): number {
      const row = db
        .prepare("SELECT COUNT(*) AS n FROM guestbook WHERE status = 'pending'")
        .get() as { n: number };
      return row.n;
    },

    /** Set an entry's status (approve/reject). Returns whether a row changed. */
    setStatus(id: number, status: GuestbookStatus): boolean {
      const res = db.prepare("UPDATE guestbook SET status = ? WHERE id = ?").run(status, id);
      return Number(res.changes) > 0;
    },

    /** Hard-delete an entry. Returns whether a row was removed. */
    remove(id: number): boolean {
      const res = db.prepare("DELETE FROM guestbook WHERE id = ?").run(id);
      return Number(res.changes) > 0;
    },
  };
}

export type GuestbookRepo = ReturnType<typeof guestbookRepo>;
