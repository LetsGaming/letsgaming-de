/**
 * A coarse in-memory per-IP limiter for the two public write endpoints.
 *
 * It was written twice — once in `contact.ts`, once in `guestbook.ts` — as the
 * same class under the same name, differing only in the cap. The copies had
 * already drifted where it counts: one factored its sweep into a method guarded
 * by `now - lastSweep < windowMs` and returned early, the other inlined it with
 * the comparison the other way round. Both are *defences*, and a defence with two
 * implementations has one you've read and one you haven't.
 *
 * Deliberately naive and in-process: the server is one container (§10), so a
 * shared store would be infrastructure bought for a limiter that only needs to
 * make casual spam boring. It resets on restart, which is fine — a bot that waits
 * for a deploy has earned the message.
 */

/** The window both endpoints share. Spam comes in bursts; ten minutes covers one. */
const WINDOW_MS = 10 * 60 * 1000;

export interface RateLimitOptions {
  /** Allowed requests per key per window. */
  max: number;
  windowMs?: number;
}

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = 0;
  private readonly max: number;
  private readonly windowMs: number;

  constructor(opts: RateLimitOptions) {
    this.max = opts.max;
    this.windowMs = opts.windowMs ?? WINDOW_MS;
  }

  /** True if `key` may proceed; records the hit when it may. */
  allow(key: string): boolean {
    const now = Date.now();
    this.sweep(now);
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.max) {
      // Keep the trimmed list: a blocked caller shouldn't reset its own window.
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Drop keys with no hits in the current window, so the map can't grow forever.
   *  Once per window is enough — the per-key filter in `allow` does the exact work. */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    for (const [key, times] of this.hits) {
      if (!times.some((t) => now - t < this.windowMs)) this.hits.delete(key);
    }
  }
}

/**
 * Per-endpoint caps. Different numbers because the endpoints ask for different
 * things: a contact message is a considered act, a guestbook note is a drive-by.
 */
export const RATE_LIMIT = {
  /** Messages relayed to email, per IP per window. */
  contact: 5,
  /** Guestbook submissions, per IP per window. */
  guestbook: 3,
} as const;
