/**
 * One-click "wave": a single global counter, nothing per visitor.
 *
 * The limiter keys on a salted hash of the IP held only in memory. The salt is
 * random per process, so the keys can't be reversed or correlated across
 * restarts, and nothing about a visitor is stored or logged.
 */

import { createHash, randomBytes } from "node:crypto";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import { tooManyRequests } from "../errors.js";
import { RATE_LIMIT, RateLimiter } from "../rate-limit.js";

export function registerReactionRoutes(app: FastifyInstance, store: Store): void {
  const limiter = new RateLimiter({ max: RATE_LIMIT.wave });
  const salt = randomBytes(16);
  const key = (ip: string) => createHash("sha256").update(salt).update(ip).digest("hex");

  app.get("/api/reactions/wave", async () => ({ count: store.reactions.count("wave") }));

  app.post("/api/reactions/wave", async (req) => {
    if (!limiter.allow(key(req.ip))) throw tooManyRequests("Too many waves, try again later.");
    return { count: store.reactions.increment("wave") };
  });
}
