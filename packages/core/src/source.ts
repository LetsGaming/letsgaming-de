/**
 * The Source contract (PROJECT.md §4 "The Source contract — the key abstraction").
 *
 * Every integration is an adapter implementing one interface. Adding a source =
 * writing one adapter and registering it. The store, the read API, and the whole
 * frontend stay untouched because they only ever speak the *normalized* shape —
 * never a raw API response.
 *
 * At launch there is exactly one source: GitHub. The contract exists so the next
 * one is trivial.
 */

/**
 * @typeParam Raw        - whatever the external API returns (adapter-private).
 * @typeParam Normalized - the common shape persisted to the store and served.
 */
export interface Source<Raw = unknown, Normalized = unknown> {
  /** Stable id, e.g. "github". Used as the store key and the source label. */
  id: string;
  /** Default nav area its modules belong to, if any. */
  targetArea?: string;
  /** How often the sync runner polls it — a cron-ish interval string. */
  schedule: string;
  /** Hit the external API. Kept separate from normalize so it's mockable. */
  fetch(): Promise<Raw>;
  /** Map the raw response to the common shape stored in the DB. */
  normalize(raw: Raw): Normalized;
}

/**
 * A persisted snapshot: the store appends one of these every sync (the archive)
 * and upserts a "current" copy (what the site reads). Accumulating snapshots is
 * how the store ends up holding data GitHub's API won't hand you directly —
 * all-time totals, long-range trends (§4 "Accumulation beyond the public API").
 */
export interface SourceSnapshot<Normalized = unknown> {
  sourceId: string;
  /** ISO timestamp the sync ran. */
  syncedAt: string;
  data: Normalized;
}

// ── Normalized outputs ──────────────────────────────────────────────────────
// One normalized shape per source. These are the ONLY thing downstream sees.

/** GitHub, normalized (PROJECT.md §6 "Normalized source output"). */
export interface GitHubData {
  stats: {
    repos: number;
    commitsYear: number;
    commitsAllTime: number;
    longestStreakDays: number;
  };
  languages: { name: string; pct: number }[];
  /** Per-day contribution intensity, accumulated over time. */
  contributions: number[];
  events: GitHubEvent[];
  /**
   * Lightweight per-repo facts, used to enrich curated project cards (stars,
   * freshness) so authored meta doesn't drift. Keyed lookups happen by name.
   */
  repos?: GitHubRepo[];
}

export interface GitHubRepo {
  name: string;
  stars: number;
  /** ISO timestamp of the last push. */
  pushedAt: string;
}

export type GitHubEventType = "commit" | "pr" | "star" | "repo";

export interface GitHubEvent {
  type: GitHubEventType;
  text: string;
  meta?: string;
  /** ISO timestamp. */
  at: string;
}

/** Registry of every source's normalized shape, keyed by source id. */
export interface SourceData {
  github?: GitHubData;
}

export type SourceId = keyof SourceData;
