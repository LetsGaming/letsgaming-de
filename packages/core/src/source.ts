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
  /** Stable id, e.g. "github". Used as the store key and the source label. */
  id: string;
  /** Default nav area its modules belong to, if any. */
  targetArea?: string;
  /** How often the sync runner polls it — a cron-ish interval string. */
  schedule: string;
  /**
   * Hit the external API. Returns a typed Result rather than throwing — an
   * unavailable/slow upstream is expected, and the sync worker degrades (keeps
   * the last-good snapshot) on a failure instead of crashing the run.
   */
  fetch(): Promise<Result<Raw>>;
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
  steam?: SteamData;
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

/** Steam (public Web API): what I actually play. Enriches the Discord widget. */
export interface SteamData {
  /** Currently in-game, if the public profile exposes it. */
  playing?: { name: string; appId: number };
  /** Recently played (last 2 weeks), most-played first. */
  recent: { name: string; appId: number; minutes2Weeks: number; iconUrl?: string }[];
}

export type SourceId = keyof SourceData;
