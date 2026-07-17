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

import { THEMES } from "./theme.js";

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
  "guestbook-submit",
  "project",
  "featured",
  "github-profile",
  "highlight",
  "social",
  "theme-toggle",
  "more",
] as const;
export type ClickAction = (typeof CLICK_ACTIONS)[number];

/** Coarse viewport class (never a precise size — that would be fingerprinting). */
export const VIEWPORT_BUCKETS = ["mobile", "tablet", "desktop"] as const;
export type ViewportBucket = (typeof VIEWPORT_BUCKETS)[number];

export function viewportBucket(width: number): ViewportBucket {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

/** Themes a visit can be viewed in — the site's list, not a second copy of it. */
const THEME_KEYS: readonly string[] = THEMES;

/** A project (repo) name is public, non-personal data. Bound the shape anyway. */
const PROJECT_KEY = /^[A-Za-z0-9._-]{1,64}$/;

// ── retention ranges ────────────────────────────────────────────────────────
// The owner-facing "clear analytics" ranges. Both halves of each row used to be
// written twice: the CMS listed the ids and labels, the route switched on the
// ids and re-derived the hours (`back(72)` for "3d"). Two lists, one meaning —
// so a fifth range meant editing a component and a switch, and a wrong number on
// either side silently clears the wrong window. There is no undo.

export const CLEAR_RANGES = [
  { id: "hour", label: "last hour", hours: 1 },
  { id: "24h", label: "24h", hours: 24 },
  { id: "3d", label: "3d", hours: 72 },
  { id: "7d", label: "7d", hours: 168 },
  /** Everything, including the log-derived day rows. `hours: null` is "no window". */
  { id: "all", label: "everything", hours: null },
] as const;

export type ClearRangeId = (typeof CLEAR_RANGES)[number]["id"];

export function clearRange(id: string): (typeof CLEAR_RANGES)[number] | undefined {
  return CLEAR_RANGES.find((r) => r.id === id);
}

/** Time windows the analytics graph can show, longest label first in the UI. */
export const VIEW_RANGES = [
  { label: "24h", hours: 24 },
  { label: "3d", hours: 72 },
  { label: "7d", hours: 168 },
  { label: "30d", hours: 720 },
] as const;

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
  "project", // which project card was opened   → key: <repo name>
  "viewport", // coarse device class            → key: mobile|tablet|desktop
  "theme", // theme active during the visit     → key: dark|light
] as const;
export type EngagementDimension = (typeof ENGAGEMENT_DIMENSIONS)[number];

/**
 * The dimensions derived from the access log, by the server, after the fact.
 *
 * Separate from the engagement list because they answer different questions and
 * only one of them can lie. The log records what a *request* claimed; the beacon
 * records that a browser actually ran. Neither knows who.
 */
export const LOG_DIMENSIONS = [
  "path", // a page was served                    → key: <path>
  "referrer", // where it came from               → key: <host>
  "browser", // coarse UA family                  → key: Chrome|Firefox|…
  "os", // coarse platform                        → key: Windows|macOS|…
  "device", // coarse form factor                 → key: mobile|desktop
  "bot", // a request that says it isn't a person → key: <BotFamily>
] as const;
export type LogDimension = (typeof LOG_DIMENSIONS)[number];

/**
 * Everything the store counts.
 *
 * Derived, because `@lg/db` used to declare its own union with all sixteen
 * members typed out — including every one of ENGAGEMENT_DIMENSIONS, in a second
 * order, in another package. Two lists, one vocabulary: a dimension added here and
 * missed there is a counter the store refuses to hold, and the beacon fails
 * validation silently, which reads as nobody visiting.
 */
export const ANALYTICS_DIMENSIONS = [...LOG_DIMENSIONS, ...ENGAGEMENT_DIMENSIONS] as const;
export type AnalyticsDimension = (typeof ANALYTICS_DIMENSIONS)[number];

/** One event as it travels from browser to server. Intentionally tiny. */
export interface TrackEvent {
  /** dimension */
  d: EngagementDimension;
  /** key (already coarsened/bucketed by the client) */
  k: string;
}

// ── composite key format ────────────────────────────────────────────────────
// Three dimensions pack two values into one key. The browser writes them and
// `validateTrackEvent` below takes them apart — two files, two separators, and
// nothing linking them: change the join and every event of that dimension fails
// validation and is dropped, which looks exactly like nobody visiting. So the
// format is written once and both ends call it.

/** `<section>|<bucket>` — dwell and scroll. */
const PAIR = "|";
/** `<from>><to>` — a section switch. Distinct from PAIR so a `>` in neither. */
const ARROW = ">";

export const dwellKey = (section: string, bucket: DwellBucket): string =>
  `${section}${PAIR}${bucket}`;
export const scrollKey = (section: string, depth: ScrollDepth): string =>
  `${section}${PAIR}${depth}`;
export const transitionKey = (from: string, to: string): string => `${from}${ARROW}${to}`;

/** Split a `<a>|<b>` key. Returns undefined halves for a malformed key, which
 *  the validator rejects — the parse can't throw on hostile input. */
const splitPair = (key: string): [string | undefined, string | undefined] => {
  const [a, b] = key.split(PAIR);
  return [a, b];
};
const splitArrow = (key: string): [string | undefined, string | undefined] => {
  const [a, b] = key.split(ARROW);
  return [a, b];
};

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
      const [from, to] = splitArrow(k);
      return ok(!!from && !!to && sectionIds.has(from) && sectionIds.has(to));
    }
    case "dwell": {
      const [tab, bucket] = splitPair(k);
      return ok(!!tab && sectionIds.has(tab) && !!bucket && dwellOk(bucket));
    }
    case "scroll": {
      const [tab, depth] = splitPair(k);
      return ok(!!tab && sectionIds.has(tab) && (SCROLL_DEPTHS as readonly string[]).includes(depth ?? ""));
    }
    case "session_tabs":
      return ok((SESSION_TAB_BUCKETS as readonly string[]).includes(k));
    case "session_dwell":
      return ok(dwellOk(k));
    case "click":
      return ok((CLICK_ACTIONS as readonly string[]).includes(k));
    case "project":
      return ok(PROJECT_KEY.test(k));
    case "viewport":
      return ok((VIEWPORT_BUCKETS as readonly string[]).includes(k));
    case "theme":
      return ok(THEME_KEYS.includes(k));
    default:
      return null;
  }
}
