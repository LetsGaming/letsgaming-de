import type { Result } from "./result.js";

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
  /** Stable id — the store key, the `SourceData` field, the freshness label. */
  id: SourceId;
  /** How often the sync runner polls it — a cron-ish interval string. */
  schedule: string;
  /**
   * How long this source's data stays *true*, in milliseconds. Distinct from
   * `schedule`: that's how often we ask, this is how long the answer holds.
   * Discord presence is worthless after a minute; a fortnight of coding stats is
   * fine an hour old.
   *
   * Past it the module renders `stale` — the data plus its age — rather than
   * pretending to be current. The site's entire claim is that it updates itself,
   * so rendering old data as fresh is the worst bug available to it.
   *
   * A `ttl` shorter than `schedule` means the source is stale by design; that's
   * a config error, not a strictness setting.
   *
   * **Set this from {@link SOURCE_TTL}, never inline.** The read API can't ask an
   * adapter — an unconfigured source still has stored data, and its age still has
   * to be judged — so it reads the table, and the table is what makes a module
   * stale. An adapter that declares its own number is declaring a value nothing
   * consumes, next to a table that quietly says something else.
   */
  ttl: number;
  /**
   * Hit the external API. Returns a typed Result rather than throwing — an
   * unavailable/slow upstream is expected, and the sync worker degrades (keeps
   * the last-good snapshot) on a failure instead of crashing the run.
   */
  fetch(): Promise<Result<Raw>>;
  /** Map the raw response to the common shape stored in the DB. Pure. */
  normalize(raw: Raw): Normalized;
  /**
   * Optional async pass over the normalized shape, before it's persisted.
   *
   * `normalize` is pure and synchronous, and that's worth keeping — it's what
   * makes the whole pipeline testable without a network. But some enrichment
   * genuinely needs I/O (sampling a colour out of an image the normalized shape
   * points at), and doing it in `fetch` doesn't work because the thing to fetch
   * is only known once normalize has built it.
   *
   * So: name the async step instead of making the pure one lie. Failures inside
   * must degrade to the un-enriched shape, never throw — enrichment is a bonus,
   * not a dependency.
   */
  enrich?(normalized: Normalized): Promise<Normalized>;
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
   * Per-repo facts, newest-push first. Drives the Projects section directly
   * (pinned first, then most-recently-updated) and enriches any curated cards.
   */
  repos?: GitHubRepo[];
  /** Repo names the owner pinned on their profile, in pin order. */
  pinned?: string[];
  /** Latest published releases across repos, newest first (§ GitHub extras). */
  releases?: GitHubRelease[];
  /** Recently merged pull requests, newest first. */
  mergedPrs?: GitHubPullRequest[];
  /** Public gists, most-recently-updated first. */
  gists?: GitHubGist[];
}

/** A published release, friendly-facing (repo + tag + when). */
export interface GitHubRelease {
  repo: string;
  /** Release title; falls back to the tag when GitHub has no name. */
  name: string;
  tagName: string;
  url: string;
  /** ISO timestamp. */
  publishedAt: string;
}

/** A merged pull request — "shipped this" for non-devs. */
export interface GitHubPullRequest {
  repo: string;
  title: string;
  url: string;
  /** ISO timestamp. */
  mergedAt: string;
}

/** A public gist — a shared snippet. */
export interface GitHubGist {
  /** Human description; may be empty (GitHub allows it). */
  description: string;
  url: string;
  /** File count, for a "N files" chip. */
  files: number;
  /** ISO timestamp. */
  updatedAt: string;
}

export interface GitHubRepo {
  name: string;
  stars: number;
  /** ISO timestamp of the last push. */
  pushedAt: string;
  /** Repo description, if any. */
  description?: string;
  /** Canonical GitHub URL for the repo. */
  url: string;
  /** Primary language, if GitHub reports one. */
  language?: string;
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
  wakapi?: WakapiData;
}

/** Wakapi (self-hosted WakaTime): coding time by language over a range. */
export interface WakapiData {
  /** Human range label, e.g. "last 7 days". */
  range: string;
  /** Total tracked seconds in the range. */
  totalSeconds: number;
  /** Coding time by language, most-used first, as percentages. */
  languages: { name: string; pct: number; seconds: number }[];
}

export type SourceId = keyof SourceData;

/** Every source id, for iteration and for narrowing an untrusted store row. */
export const SOURCE_IDS = ["github", "wakapi"] as const satisfies readonly SourceId[];

export function isSourceId(value: unknown): value is SourceId {
  return typeof value === "string" && (SOURCE_IDS as readonly string[]).includes(value);
}

/**
 * How long each source's data stays true, in ms. The one home for the value:
 * adapters set `Source.ttl` from here, and the read API hands the whole table to
 * the resolver.
 *
 * It's static, and keyed by `SourceId` rather than `string`, and both matter.
 *
 * *Static*, because a TTL is a fact about the upstream, not about this
 * deployment's config: an unconfigured source still has yesterday's rows in the
 * store, and their age still has to be judged. Deriving the table from the
 * *registered* sources would leave those rows with no TTL — and a missing TTL
 * resolves to `fresh`, so the failure mode is a module that silently claims to be
 * current forever. That's the exact bug the freshness model exists to prevent, so
 * the table can't be allowed to have holes.
 *
 * *`Record<SourceId, …>`*, because that's what makes the hole impossible: add a
 * field to `SourceData` and this stops compiling until it has a TTL. Before, it
 * was `Record<string, number>` — a new source typechecked, shipped, and rendered
 * `fresh` in perpetuity.
 *
 * GitHub is 8h and not the 2h originally wanted: it polls every 6h, so any TTL
 * under the poll interval marks it stale for most of every cycle by construction.
 * 8h is one missed sync of slack. Tighten `schedule` and this can come down.
 */
export const SOURCE_TTL: Record<SourceId, number> = {
  github: 8 * 60 * 60 * 1000,
  wakapi: 2 * 60 * 60 * 1000,
};

/** Human label per source, for the "sources" line on a module. */
export const SOURCE_LABEL: Record<SourceId, string> = {
  github: "GitHub",
  wakapi: "Wakapi",
};
