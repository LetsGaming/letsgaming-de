import type { GuestbookEntry, PublicGuestbookEntry } from "@lg/core";
import { GuestbookStatus, toGuestbookStatus } from "@lg/core";
import type { DB } from "./database.js";
import { asNumber, asText, mapRow, mapRows, type Row } from "./row-mapper.js";

const toEntry = (r: Row): GuestbookEntry => ({
  id: asNumber(r.id),
  name: asText(r.name),
  message: asText(r.message),
  createdAt: asText(r.created_at),
  status: toGuestbookStatus(r.status),
  flags: r.flags ? asText(r.flags).split(",") : [],
  score: asNumber(r.score),
});

const toPublicEntry = (r: Row): PublicGuestbookEntry => ({
  id: asNumber(r.id),
  name: asText(r.name),
  message: asText(r.message),
  createdAt: asText(r.created_at),
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
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(entry.name, entry.message, entry.createdAt, GuestbookStatus.Pending, entry.flags.join(","), entry.score);
      return Number(res.lastInsertRowid);
    },

    /** Approved entries the public site may render, newest first. */
    listApproved(limit = 100): PublicGuestbookEntry[] {
      return mapRows(
        db.prepare(
          `SELECT id, name, message, created_at FROM guestbook
           WHERE status = ? ORDER BY created_at DESC LIMIT ?`,
        ),
        toPublicEntry,
        GuestbookStatus.Approved,
        limit,
      );
    },

    /**
     * The moderation queue for the CMS: pending first (most-suspicious first so
     * obvious spam is quick to clear), then the rest, newest within each group.
     */
    listForModeration(limit = 200): GuestbookEntry[] {
      return mapRows(
        db.prepare(
          `SELECT * FROM guestbook
           ORDER BY CASE status WHEN ? THEN 0 ELSE 1 END,
                    CASE status WHEN ? THEN score ELSE 0 END DESC,
                    created_at DESC
           LIMIT ?`,
        ),
        toEntry,
        GuestbookStatus.Pending,
        GuestbookStatus.Pending,
        limit,
      );
    },

    /** Count entries awaiting a decision (for a CMS badge). */
    countPending(): number {
      return (
        mapRow(
          db.prepare("SELECT COUNT(*) AS n FROM guestbook WHERE status = ?"),
          (r) => asNumber(r.n),
          GuestbookStatus.Pending,
        ) ?? 0
      );
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
