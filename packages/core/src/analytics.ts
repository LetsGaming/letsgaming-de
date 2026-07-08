/**
 * Engagement-analytics vocabulary (PROJECT.md §9, privacy addendum).
 *
 * This is the single source of truth shared by the browser tracker (which
 * *produces* these values) and the server (which *validates* them before
 * recording). Everything here is deliberately coarse: dwell and session length
 * are bucketed, scroll depth is quantised, and there are no free-text keys — so
 * nothing precise or identifying can be stored, and a hostile client can only
 * ever nudge an aggregate counter, never smuggle in personal data.
 *
 * Nothing here touches a cookie, an IP, or any per-visitor identifier. The
 * browser correlates a visit in memory and emits self-contained aggregate
 * events; the server increments counters. No raw event rows are kept.
 */

/** Coarse dwell/duration buckets (never store precise milliseconds). */
export const DWELL_BUCKETS = [
  "<5s",
  "5-15s",
  "15-30s",
  "30-60s",
  "1-3m",
  "3-10m",
  "10m+",
] as const;
export type DwellBucket = (typeof DWELL_BUCKETS)[number];

export function dwellBucket(ms: number): DwellBucket {
  if (ms < 5_000) return "<5s";
  if (ms < 15_000) return "5-15s";
  if (ms < 30_000) return "15-30s";
  if (ms < 60_000) return "30-60s";
  if (ms < 180_000) return "1-3m";
  if (ms < 600_000) return "3-10m";
  return "10m+";
}

/** Scroll-depth milestones, in percent of the section reached. */
export const SCROLL_DEPTHS = ["25", "50", "75", "100"] as const;
export type ScrollDepth = (typeof SCROLL_DEPTHS)[number];

/** Which depth milestones a given percentage has crossed. */
export function scrollDepthsReached(pct: number): ScrollDepth[] {
  return SCROLL_DEPTHS.filter((d) => pct >= Number(d));
}

/** How many distinct sections a visit touched, bucketed. */
export const SESSION_TAB_BUCKETS = ["1", "2", "3", "4+"] as const;
export type SessionTabBucket = (typeof SESSION_TAB_BUCKETS)[number];

export function sessionTabsBucket(n: number): SessionTabBucket {
  if (n <= 1) return "1";
  if (n === 2) return "2";
  if (n === 3) return "3";
  return "4+";
}

/** Named, allow-listed interactions. Free-text click keys are never accepted. */
export const CLICK_ACTIONS = [
  "contact-cta",
  "contact-submit",
  "project",
  "featured",
  "github-profile",
  "social",
  "theme-toggle",
  "more",
] as const;
export type ClickAction = (typeof CLICK_ACTIONS)[number];

/** Themes a visit can be viewed in. */
export const THEME_KEYS = ["dark", "light"] as const;

/**
 * The engagement dimensions written to `analytics_daily` (alongside the
 * log-derived path/referrer/browser/os/device). Section ids are validated
 * against the live nav at record time, not hard-coded here.
 */
export const ENGAGEMENT_DIMENSIONS = [
  "tab", // a section became active            → key: <sectionId>
  "exit", // last section before leaving        → key: <sectionId>
  "transition", // section switch               → key: <from>><to>
  "dwell", // time on a section (bucketed)      → key: <sectionId>|<DwellBucket>
  "scroll", // depth reached on a section       → key: <sectionId>|<ScrollDepth>
  "session_tabs", // sections touched per visit → key: <SessionTabBucket>
  "session_dwell", // total visit length        → key: <DwellBucket>
  "click", // a named interaction               → key: <ClickAction>
  "theme", // theme active during the visit     → key: dark|light
] as const;
export type EngagementDimension = (typeof ENGAGEMENT_DIMENSIONS)[number];

/** One event as it travels from browser to server. Intentionally tiny. */
export interface TrackEvent {
  /** dimension */
  d: EngagementDimension;
  /** key (already coarsened/bucketed by the client) */
  k: string;
}

/**
 * Validate one event against the vocabulary and the set of known section ids.
 * Returns the normalized `{ dimension, key }` to record, or null to drop it.
 * This is the server's whole trust boundary for the tracking endpoint.
 */
export function validateTrackEvent(
  event: TrackEvent,
  sectionIds: ReadonlySet<string>,
): { dimension: EngagementDimension; key: string } | null {
  const { d, k } = event;
  if (typeof k !== "string" || k.length === 0 || k.length > 64) return null;

  const ok = (cond: boolean) => (cond ? { dimension: d, key: k } : null);
  const dwellOk = (b: string) => (DWELL_BUCKETS as readonly string[]).includes(b);

  switch (d) {
    case "tab":
    case "exit":
      return ok(sectionIds.has(k));
    case "transition": {
      const [from, to] = k.split(">");
      return ok(!!from && !!to && sectionIds.has(from) && sectionIds.has(to));
    }
    case "dwell": {
      const [tab, bucket] = k.split("|");
      return ok(!!tab && sectionIds.has(tab) && !!bucket && dwellOk(bucket));
    }
    case "scroll": {
      const [tab, depth] = k.split("|");
      return ok(!!tab && sectionIds.has(tab) && (SCROLL_DEPTHS as readonly string[]).includes(depth ?? ""));
    }
    case "session_tabs":
      return ok((SESSION_TAB_BUCKETS as readonly string[]).includes(k));
    case "session_dwell":
      return ok(dwellOk(k));
    case "click":
      return ok((CLICK_ACTIONS as readonly string[]).includes(k));
    case "theme":
      return ok((THEME_KEYS as readonly string[]).includes(k));
    default:
      return null;
  }
}
