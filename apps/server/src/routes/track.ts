/**
 * Engagement tracking relay (PROJECT.md §9, privacy addendum).
 *
 * The public site sends small, cookieless (endpoint deliberately named neutrally so tracker-blockers do not match it) `navigator.sendBeacon` payloads
 * describing *anonymous, already-bucketed* engagement — which section was
 * viewed, for how long (bucketed), where the visitor moved to/from, how far
 * they scrolled, and named clicks. This endpoint validates every event against
 * the shared vocabulary and the live nav, then increments aggregate counters.
 *
 * Privacy properties, by construction:
 *   - no cookie is read or set; no session id; no identifier of any kind.
 *   - the client IP is used only for a transient in-memory rate limit and is
 *     never stored (same posture as the contact relay).
 *   - only counters are written (day, dimension, key) — never raw event rows,
 *     so a single visit can't be reconstructed.
 *   - the day is assigned by the server; the client sends no timestamps.
 */

import { type EngagementDimension, type NavNode, validateTrackEvent } from "@lg/core";
import type { HourlyHit, Store } from "@lg/db";
import type { FastifyInstance } from "fastify";

const MAX_EVENTS = 40; // a whole visit fits comfortably; caps abuse

/** Current UTC hour bucket, "YYYY-MM-DDTHH". */
function isoHour(d: Date): string {
  return d.toISOString().slice(0, 13);
}

/** All node ids in the nav tree — the set of valid section ids for tracking. */
function collectNavIds(nodes: NavNode[], into: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    into.add(n.id);
    if (n.children) collectNavIds(n.children, into);
  }
  return into;
}

/** Tiny in-memory limiter (no IP stored): cap beacons per client per window. */
class Limiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;
  constructor(
    private readonly max = 300,
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

export function registerTrackRoutes(app: FastifyInstance, store: Store): void {
  const limiter = new Limiter();

  app.post("/api/pulse", async (req, reply) => {
    if (!limiter.allow(req.ip)) return reply.code(429).send();

    // Body arrives as text/plain (sendBeacon, to avoid a CORS preflight) or JSON.
    let parsed: unknown = req.body;
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return reply.code(400).send();
      }
    }
    const events = (parsed as { events?: unknown })?.events;
    if (!Array.isArray(events)) return reply.code(400).send();

    const sectionIds = collectNavIds(store.ia.getNav());
    const bucket = isoHour(new Date());
    const hits: HourlyHit[] = [];
    for (const e of events.slice(0, MAX_EVENTS)) {
      if (!e || typeof e !== "object") continue;
      const valid = validateTrackEvent(e as { d: EngagementDimension; k: string }, sectionIds);
      if (valid) hits.push({ bucket, dimension: valid.dimension, key: valid.key });
    }
    if (hits.length) store.analytics.recordHourly(hits);

    // Nothing to return; sendBeacon ignores the response.
    return reply.code(204).send();
  });
}
