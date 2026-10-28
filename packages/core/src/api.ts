import type { GroupedRow } from "./analytics-pairs.js";
import type { ReferrerRule } from "./traffic-source.js";
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
import type { AnalyticsDimension, DwellBucket, ScrollDepth, SessionTabBucket } from "./engagement.js";
import type { AnalyticsHeadline, QualityFunnel } from "./visit-model.js";

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
  probes: AnalyticsPoint[];
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
    /** Set when the window was narrowed to one bucket (a click on the chart). */
    at?: string;
    /**
     * The window the deltas compare against: the same number of buckets, ending
     * where this range starts, so the two never overlap. Bounds are in the same
     * format as `from`/`to`. Null when there is no comparison (a selected bucket).
     */
    previous: { from: string; to: string } | null;
    /**
     * True when day buckets for a zone other than Europe/Berlin were rebuilt from
     * the hourly rows. Day rollups are Berlin days, so this view is retention
     * bound (about 90 days) and its columns are approximate.
     */
    approximateZone?: boolean;
  };
  /**
   * Grouped by first path segment (`/docs/*` is one `/docs` row). A row with
   * `children` expands to the stored paths it sums; a row without is a single path.
   */
  paths: GroupedRow[];
  referrers: AnalyticsRow[];
  browsers: AnalyticsRow[];
  os: AnalyticsRow[];
  devices: AnalyticsRow[];
  /** Self-identifying non-humans, by coarse family. Counted, never conflated. */
  bots: AnalyticsRow[];
  /**
   * Requests that didn't admit to being automated but asked for something only a
   * scanner asks for. Separate from `bots`: a crawler is honest, a probe wears a
   * Chrome user-agent and sweeps for `/wp-login.php`.
   */
  probes: AnalyticsRow[];
  chart: AnalyticsChart;
  /**
   * The same metric totals over the window immediately before this one, for a
   * "vs previous period" reading. Absent when that window predates any data, so
   * the UI can distinguish "no change" from "nothing to compare against" —
   * showing −100% for the week before the site existed would be worse than
   * showing nothing.
   */
  previous?: AnalyticsTotals;
  /**
   * The two traffic numbers, side by side, each naming where it comes from.
   *
   * `visits` is script-confirmed: one completed visit per `session_dwell` beacon,
   * so it only counts browsers that ran the page's JavaScript. `pageviews` is the
   * access log, which also counts every client that never runs a script (bots the
   * user agent doesn't give away, link previews, uptime checks). Visits is the
   * primary number; the gap between the two is the part nothing can confirm.
   * Totals cover the whole range (not `range.at`); `previous` is `null` when
   * there is no comparison window.
   *
   * `visits.total` is the confirmed-visit count (`visit` events, one per load that
   * showed real engagement); `completedVisits` is the older `session_dwell` count
   * (tab closed while the page could still report). `visits.measured` is false
   * when the window ends before the first `visit` event ever recorded: the 0 is
   * then "not measured", not "no visits".
   */
  visits: TrafficFigure<"script"> & { measured: boolean };
  completedVisits: TrafficFigure<"script">;
  pageviews: TrafficFigure<"log">;
  /**
   * The landing-page success metric: completed visits (one `session_tabs` beacon
   * each) that touched a second section. `rate` is `reached / visits`, 0..1, or
   * `null` when the window has no completed visits.
   *
   * @deprecated Use `sections.sessionModules` and `headline.sectionsPerVisit`.
   * Kept for one release for older dashboards, then removed.
   */
  secondPage: { visits: number; reached: number; rate: number | null; source: "script" };
  /** Where every metric tile's number comes from, keyed like `chart` and `previous`. */
  metricSources: Record<keyof AnalyticsTotals, MetricSource>;
  /**
   * The custom referrer rules currently in effect, echoed so the dashboard can
   * edit them where they're used. They're applied to `referrers` above before it
   * leaves the server, so the list and the rules can't disagree.
   */
  referrerRules: ReferrerRule[];
  engagement: AnalyticsEngagement;
  /** The headline metrics, each with its server-computed delta and trend. */
  headline: AnalyticsHeadline;
  /** Traffic quality: the funnel from requests to confirmed visits. */
  quality: AnalyticsQuality;
  /** Module-level engagement, in page order. */
  sections: AnalyticsSections;
  /** Page views by referrer category. */
  sources: AnalyticsSources;
  /**
   * Health of the access-log ingest pipeline. Present only when `ACCESS_LOG`
   * is configured server-side — absent (not an empty object) is the existing
   * "not configured at all" case the traffic banner already explains, which
   * is a different situation from "configured but currently failing."
   */
  ingest?: {
    /** ISO timestamp of the last successful ingest run, or absent if it has
     *  never succeeded. */
    lastSuccessAt?: string;
    /** The most recent attempt's error, present only if that attempt (which
     *  may postdate `lastSuccessAt`) failed. A later success clears it. */
    lastError?: string;
  };
  /**
   * Present when a dimension filter (`dim`/`key`) is active, e.g. "Referrer: Bing".
   *
   * The filter narrows every access-log list except its own (which stays whole so
   * another row can be picked): `paths`, `referrers`, `browsers`, `os`, `devices`
   * come back as "page views that also match the filter", from the pair counters
   * the ingest writes. `chart` and `previous` stay as they would be unfiltered;
   * `series` below is the filtered dimension's own counts over time.
   *
   * The in-page script's lists (`engagement`) cannot be narrowed: a beacon carries
   * no path, referrer or device, so there is nothing to cross. They stay whole and
   * are named in `notFilterable` so the UI can say so. `bots` and `probes` are
   * requests that never count as page views, so under a filter on any other
   * dimension they are empty rather than unfiltered.
   *
   * Pair counters start when the pairing shipped; history before that is filled
   * by `pnpm analytics:rebuild`.
   */
  filtered?: {
    dimension: AnalyticsDimension;
    /** The display key that was filtered to: a referrer's grouped label, a path
     *  group or concrete path, or the raw stored key for every other dimension. */
    key: string;
    series: AnalyticsPoint[];
    /** Over the list window (bucket-narrowed when `range.at` is set). */
    total: number;
    /** `null` when there's no comparison window (same rule as `previous`). */
    previous: number | null;
    /** The top-level lists that were narrowed by this filter. */
    narrowed: AnalyticsCardId[];
    /** The lists left whole because their source can't be crossed with the filter. */
    notFilterable: { card: AnalyticsCardId | "engagement"; source: MetricSource }[];
  };
}

/**
 * The reconciliation funnel and its caveats for the whole range.
 *
 * `measured` is false when the range ends before the first `visit` event was ever
 * recorded (`confirmationSince`): `funnel.confirmed` and `confirmationRate` are
 * then not real zeros and must be shown as "not measured". `partiallyMeasured`
 * means the range starts before that moment, so its early part counts no
 * confirmations. Confirmed visits are never inferred from `session_dwell`.
 */
export interface AnalyticsQuality {
  funnel: QualityFunnel;
  /** `loads / pageviews`, or null with no page views. */
  coverage: number | null;
  /** `confirmed / loads`, or null with no loads. */
  confirmationRate: number | null;
  /** UTC hour bucket (`YYYY-MM-DDTHH`) of the first `visit` event, or null if none. */
  confirmationSince: string | null;
  measured: boolean;
  partiallyMeasured: boolean;
  /** Why requests were excluded as non-human, by classifier rule id. */
  exclusions: AnalyticsRow[];
  /** True when part of the range comes from legacy UTC-day rows (`analytics_daily`)
   *  that were folded into the Berlin-day rollups without being re-bucketed. */
  approximateHistory: boolean;
}

/** One `<section class="module-section">` of the site, with what visitors did there. */
export interface AnalyticsSectionModule {
  id: string;
  /** The nav leaf (area) whose page renders it; null for a module placed nowhere. */
  area: string | null;
  /** Visits that had this module >=50% in view. */
  seen: number;
  /** `seen / loads`, or null with no loads. */
  seenRate: number | null;
  /** Visits whose first module was this one. */
  entries: number;
  /** Visits whose last focused module was this one. */
  exits: number;
  /** Time focused here, one count per visit, every bucket present (zeros included). */
  dwell: Record<DwellBucket, number>;
  medianDwellSeconds: number | null;
}

/** Focus moving from one module to the next, summed over the range. */
export interface AnalyticsSectionFlow {
  from: string;
  to: string;
  count: number;
}

/** Furthest scroll reached on one area (page). */
export interface AnalyticsAreaScroll {
  area: string;
  /** Times the area was shown (`tab`), the denominator for the depths. */
  views: number;
  depths: Record<ScrollDepth, number>;
}

export interface AnalyticsSections {
  /** Script loads in the range: the denominator for `seenRate`. */
  loads: number;
  /** In page order: nav order, then each leaf's module order; unplaced modules last. */
  modules: AnalyticsSectionModule[];
  /** Top module-to-module moves, most frequent first (capped at 20). */
  flow: AnalyticsSectionFlow[];
  /** Visits by how many modules they saw, all four buckets in order. */
  sessionModules: { bucket: SessionTabBucket; count: number }[];
  scrollDepth: AnalyticsAreaScroll[];
}

export interface AnalyticsSources {
  /** Page views counted by the classifier (`sum(source)`). */
  total: number;
  /** `search`, `social`, `campaign`, `referral`, `direct`; most frequent first. */
  rows: { key: string; count: number; share: number | null }[];
}

/** Same as `AnalyticsResponse`; kept so existing imports keep compiling. */
export type AnalyticsResponseFull = AnalyticsResponse;

export type MetricSource = "script" | "log";

/** The top-level access-log lists a dimension filter can narrow. */
export type AnalyticsCardId = "paths" | "referrers" | "browsers" | "os" | "devices" | "bots" | "probes";

export interface TrafficFigure<S extends MetricSource> {
  total: number;
  previous: number | null;
  source: S;
}

/** Per-metric totals, matching the chart's metric keys. */
export interface AnalyticsTotals {
  pageviews: number;
  sections: number;
  clicks: number;
  visitLength: number;
  bots: number;
  probes: number;
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

/** The editor's view of a post: the source, plus the link that shows a draft. */
export interface MarkdownSourceResponse extends MarkdownAssetResponse {
  /** Preview token for `/md/<slug>?preview=…`. Absent when PREVIEW_SECRET is unset. */
  previewToken?: string;
}

/**
 * The metadata a PATCH may change, and the string fields it may change by name.
 *
 * One definition because there used to be two: the route whitelisted five field
 * names inline, the client declared the body a `Record<string, unknown>`. Two
 * lists that can't disagree out loud — anything the client sent and the route
 * hadn't listed was dropped, and the drop was a 200 with the unchanged asset in
 * the body. That's how `slug` came to be unpatchable while the CMS spent months
 * believing it was naming posts.
 */
export const ASSET_TEXT_FIELDS = ["filename", "alt", "title", "caption", "description"] as const;
export type AssetTextField = (typeof ASSET_TEXT_FIELDS)[number];

export interface AssetPatch extends Partial<Record<AssetTextField, string>> {
  /** Markdown only — the public path under `/md`. Other kinds have no slug. */
  slug?: string;
  folderId?: string | null;
  tags?: string[];
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
