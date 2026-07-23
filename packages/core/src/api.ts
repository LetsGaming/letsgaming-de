/**
 * What the API returns.
 *
 * These shapes were always real — every endpoint has one. They just weren't
 * written down anywhere, so each was described three times and agreed with itself
 * by luck:
 *
 * 1. **JSON Schema** in `schemas.ts` — the request half only, checked at runtime.
 * 2. **A TypeScript interface** — the entity, not the envelope around it.
 * 3. **A cast at the call site** — `(await cms.listAssets(…)) as AssetListResponse`.
 *
 * `handle()` returned `res.json()`, which is `any`, so (3) was the only thing
 * standing between the client and the wire — and a cast is a check that can't
 * fail. `(await cms.uploadAsset(file)) as PostAsset` compiled, built, shipped, and
 * was wrong: the server returns an `Asset`, and `PostAsset`'s extra fields were
 * simply absent at runtime. The compiler had been told not to look.
 *
 * Living in core means both ends import the same declaration. The server's routes
 * are typed to return these, so a route that stops matching is a **compile error
 * on the server** — the side that can actually be wrong. The client then needs no
 * casts at all, and the one remaining assertion is inside `handle()`, named, with
 * the reason next to it.
 *
 * This is not runtime validation of responses. The server is trusted here — it's
 * ours, it compiles against these types, and a validator on every response would
 * be paying Zod's weight to check that our own code does what it just compiled to
 * do. The requests stay validated (they come from strangers); the responses are
 * type-checked at the boundary that produces them.
 */

import type { Asset, AssetFolder, AssetKind, AssetUsage, AssetVariant } from "./assets.js";
import type { SiteContent } from "./content.js";
import type { GuestbookEntry } from "./guestbook.js";
import type { ModuleDescriptor } from "./modules.js";
import type { NavNode } from "./nav.js";
import type { AnalyticsDimension } from "./analytics.js";

/** Every mutation answers the same way. */
export interface OkResponse {
  ok: true;
}

/** A mutation that created something the caller needs to address. */
export interface OkIdResponse extends OkResponse {
  id: string;
}

export interface MeResponse {
  login: string | null;
}

/** The CMS's whole editable world, in one request. */
export interface CmsContentResponse {
  content: SiteContent;
  modules: ModuleDescriptor[];
  nav: NavNode[];
}

// ── analytics ────────────────────────────────────────────────────────────────

/** One row of an aggregate: a key and how many times it happened. */
export interface AnalyticsRow {
  key: string;
  count: number;
}

/** One point of a series: a time bucket, a key, and a count. */
export interface AnalyticsPoint {
  bucket: string;
  key: string;
  count: number;
}

/**
 * The metrics the dashboard charts.
 *
 * `pageviews` and `sections` are not two facts — they're a bracket. The log can
 * only say a request *claimed* to be a browser; the beacon only fires if one
 * actually ran. Ceiling and floor, with JS-less humans, opt-outs and lying bots in
 * between. `bots` is the ones that didn't lie.
 */
export interface AnalyticsChart {
  unit: "hour" | "day";
  pageviews: AnalyticsPoint[];
  sections: AnalyticsPoint[];
  clicks: AnalyticsPoint[];
  visitLength: AnalyticsPoint[];
  bots: AnalyticsPoint[];
}

export interface AnalyticsEngagement {
  tabs: AnalyticsRow[];
  exits: AnalyticsRow[];
  transitions: AnalyticsRow[];
  dwell: AnalyticsRow[];
  scroll: AnalyticsRow[];
  sessionTabs: AnalyticsRow[];
  sessionDwell: AnalyticsRow[];
  clicks: AnalyticsRow[];
  projects: AnalyticsRow[];
  viewport: AnalyticsRow[];
  theme: AnalyticsRow[];
}

export interface AnalyticsResponse {
  /** The window that was actually summarised — echoed back because the request
   *  asks in hours and the store answers in buckets, and the chart needs the
   *  bucket edges to draw an axis with no data in it. */
  range: {
    from: string;
    to: string;
    hours: number;
    unit: "hour" | "day";
    /**
     * The IANA zone the buckets are expressed in.
     *
     * Day buckets *are* local days — a day boundary is a wall-clock fact, so the
     * grouping has to happen in the reader's zone or the columns are simply the
     * wrong sets of hours. Hour buckets stay UTC (an hour is an hour) and the
     * client shifts only their labels.
     */
    timeZone: string;
  };
  paths: AnalyticsRow[];
  referrers: AnalyticsRow[];
  browsers: AnalyticsRow[];
  os: AnalyticsRow[];
  devices: AnalyticsRow[];
  /** Self-identifying non-humans, by coarse family. Counted, never conflated. */
  bots: AnalyticsRow[];
  chart: AnalyticsChart;
  /**
   * The same metric totals over the window immediately before this one, for a
   * "vs previous period" reading. Absent when that window predates any data, so
   * the UI can distinguish "no change" from "nothing to compare against" —
   * showing −100% for the week before the site existed would be worse than
   * showing nothing.
   */
  previous?: AnalyticsTotals;
  engagement: AnalyticsEngagement;
}

/** Per-metric totals, matching the chart's metric keys. */
export interface AnalyticsTotals {
  pageviews: number;
  sections: number;
  clicks: number;
  visitLength: number;
  bots: number;
}

export interface ClearAnalyticsResponse extends OkResponse {
  removed: number;
}

/** The ledger drill-in: what was played on one day. Games only — the chart is
 *  games, and the route never exposes other categories. Cover art and genre ride
 *  along (from RAWG, by name) so the day view matches the top-games list.
 *
 *  `games` is already capped to the module's `maxCount` server-side; `total` is the
 *  true distinct-game count (for "and N more"), and `minutes` is the day's real
 *  total (not just the shown rows'). The client never receives games past the cap. */
export interface PlaytimeDayResponse {
  day: string;
  games: { name: string; minutes: number; sessions: number; exact: boolean; coverUrl?: string; genre?: string }[];
  /** Distinct games observed this day — the true total behind the capped list. */
  total: number;
  /** Total minutes for the day, across all games (summary line). */
  minutes: number;
}

// ── guestbook ────────────────────────────────────────────────────────────────

export interface GuestbookListResponse {
  entries: GuestbookEntry[];
  /** Counted server-side rather than derived from `entries`, because the list is
   *  everything awaiting moderation *and* recently handled — the badge means
   *  "needs you", which is a different question than "how many rows came back". */
  pending: number;
}

// ── assets ───────────────────────────────────────────────────────────────────

export interface AssetListResponse {
  assets: Asset[];
  folders: AssetFolder[];
  tags: string[];
}

/** One asset, with everything hanging off it. */
export interface AssetDetail extends Asset {
  variants: AssetVariant[];
  usages: AssetUsage[];
}

/** An asset whose bytes are text the CMS edits in place. */
export interface MarkdownAssetResponse extends Asset {
  markdown: string;
}

export interface AssetFolderResponse {
  id: string;
  name: string;
  parentId: string | null;
}

export interface AssetQuery {
  folder?: string;
  tag?: string;
  kind?: AssetKind;
  q?: string;
}

// ── content history ──────────────────────────────────────────────────────────

export interface RevisionSummary {
  id: number;
  savedAt: string;
  /** Which field or list changed — or `restore:<id>`. */
  reason: string;
}

export interface RevisionListResponse {
  revisions: RevisionSummary[];
}

export interface RevisionResponse {
  content: SiteContent;
}

/**
 * `listsDiffer` is the honest half of a restore.
 *
 * Scalars are put back; the list tables aren't, because replaying them means
 * reconciling deletes — a different job with a different failure mode. Rather than
 * doing half of that silently, the restore says when the half it skipped would
 * actually have changed something.
 */
export interface RestoreResponse extends OkResponse {
  listsDiffer: boolean;
}

/** Dimensions exist on the wire too — re-exported so a client can name one. */
export type { AnalyticsDimension };
