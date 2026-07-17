/**
 * Public guestbook submit (§ roadmap). Cookieless, pre-moderated: an entry is
 * stored as `pending` and never shown until the owner approves it in the CMS
 * queue. Mirrors the contact relay's defences — a honeypot field and a coarse
 * in-memory per-IP rate limit — and stores only name + message + a server
 * timestamp (no IP, no identifier). The auto-flag score only *sorts* the queue.
 */

import { scoreEntry, FIELD_LIMITS } from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import { badRequest, tooManyRequests } from "../errors.js";
import { RATE_LIMIT, RateLimiter } from "../rate-limit.js";

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
    name: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.guestbookName },
    message: { type: "string", minLength: 1, maxLength: FIELD_LIMITS.guestbookMessage },
    website: { type: "string" },
  },
  additionalProperties: false,
} as const;

/** Collapse whitespace/newlines so display stays tidy (message keeps newlines). */
const clean = (v: string) => v.replace(/[ \t]+/g, " ").trim();

export function registerGuestbookRoutes(app: FastifyInstance, store: Store): void {
  const limiter = new RateLimiter({ max: RATE_LIMIT.guestbook });

  app.post<{ Body: GuestbookBody }>(
    "/api/guestbook",
    { schema: { body: bodySchema } },
    async (req, reply) => {
      // Silently accept honeypot hits so bots don't learn.
      if (req.body.website) return { ok: true, pending: true };

      if (!limiter.allow(req.ip)) {
        throw tooManyRequests("Too many messages — try again later.");
      }

      const name = clean(req.body.name);
      const message = req.body.message.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (!name || !message) throw badRequest("Name and message are required.");

      const { score, flags } = scoreEntry(name, message);
      store.guestbook.add({ name, message, createdAt: new Date().toISOString(), flags, score });

      // No id returned — the entry isn't public until it's approved.
      return { ok: true, pending: true };
    },
  );
}
