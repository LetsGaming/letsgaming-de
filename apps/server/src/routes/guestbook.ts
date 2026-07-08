/**
 * Public guestbook submit (§ roadmap). Cookieless, pre-moderated: an entry is
 * stored as `pending` and never shown until the owner approves it in the CMS
 * queue. Mirrors the contact relay's defences — a honeypot field and a coarse
 * in-memory per-IP rate limit — and stores only name + message + a server
 * timestamp (no IP, no identifier). The auto-flag score only *sorts* the queue.
 */

import { scoreEntry } from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";

interface GuestbookBody {
  name: string;
  message: string;
  /** Honeypot — real users leave this empty. */
  website?: string;
}

const bodySchema = {
  type: "object",
  required: ["name", "message"],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 60 },
    message: { type: "string", minLength: 1, maxLength: 1000 },
    website: { type: "string" },
  },
  additionalProperties: false,
} as const;

/** Naive per-IP limiter: max 3 posts / 10 min, in memory. Bounded via sweep. */
class RateLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;
  constructor(
    private readonly max = 3,
    private readonly windowMs = 10 * 60 * 1000,
  ) {}
  allow(key: string): boolean {
    const now = Date.now();
    if (now - this.lastSweep > this.windowMs) {
      this.lastSweep = now;
      for (const [k, t] of this.hits) if (!t.some((x) => now - x < this.windowMs)) this.hits.delete(k);
    }
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

/** Collapse whitespace/newlines so display stays tidy (message keeps newlines). */
const clean = (v: string) => v.replace(/[ \t]+/g, " ").trim();

export function registerGuestbookRoutes(app: FastifyInstance, store: Store): void {
  const limiter = new RateLimiter();

  app.post<{ Body: GuestbookBody }>(
    "/api/guestbook",
    { schema: { body: bodySchema } },
    async (req, reply) => {
      // Silently accept honeypot hits so bots don't learn.
      if (req.body.website) return { ok: true, pending: true };

      if (!limiter.allow(req.ip)) {
        return reply.code(429).send({ error: "Too many messages — try again later." });
      }

      const name = clean(req.body.name);
      const message = req.body.message.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (!name || !message) return reply.code(400).send({ error: "Name and message are required." });

      const { score, flags } = scoreEntry(name, message);
      store.guestbook.add({ name, message, createdAt: new Date().toISOString(), flags, score });

      // No id returned — the entry isn't public until it's approved.
      return { ok: true, pending: true };
    },
  );
}
