/**
 * Cross-filtering vocabulary and path grouping.
 *
 * The aggregates are counters per (bucket, dimension, key) with no link between
 * the dimensions a single request produced, so "which paths did Bing visitors
 * read" can't be answered from them. To make it answerable without storing
 * anything per visitor, the ingest also counts *pairs* of the page-view
 * dimensions: one counter per (path, referrer), (path, device), and so on. A pair
 * is still an aggregate: it says how many page views had both values, never who.
 *
 * Pairs live in the same tables as everything else, as dimension `x:<a>:<b>` with
 * the key `<key a>\u0001<key b>`, so rollup, retention and clearing work on them
 * without knowing they exist.
 */

import type { AnalyticsRow } from "./api.js";

/** The page-view dimensions that describe one person's visit and can be crossed. */
export const PAIRED_DIMENSIONS = ["path", "referrer", "browser", "os", "device"] as const;
export type PairedDimension = (typeof PAIRED_DIMENSIONS)[number];

/** Separates the two halves of a pair key. A control character no URL, host or UA family contains. */
export const PAIR_SEPARATOR = "\u0001";

/**
 * Most distinct keys one pair dimension may hold per hour bucket.
 *
 * Paths and referrers are open-ended (a path is attacker-chosen up to what the
 * site serves, a referrer is any host that links here), so an uncapped product of
 * the two grows with traffic. Past the cap new combinations are dropped for that
 * hour; combinations already seen keep counting. 300 covers the busy hours of a
 * personal site many times over while bounding the table to
 * 10 pairs x 300 keys x 24 hours a day.
 */
export const PAIR_KEY_CAP_PER_HOUR = 300;

/** A stored pair dimension name, e.g. `x:path:referrer`. */
export type PairDimension = `x:${PairedDimension}:${PairedDimension}`;

/** Canonical order: the first of the two in PAIRED_DIMENSIONS is always `a`. */
export function pairDimension(a: PairedDimension, b: PairedDimension): PairDimension {
  const ordered = PAIRED_DIMENSIONS.indexOf(a) <= PAIRED_DIMENSIONS.indexOf(b) ? [a, b] : [b, a];
  return `x:${ordered[0]}:${ordered[1]}` as PairDimension;
}

/** Every pair, once: 5 dimensions give 10 pairs. */
export const PAIR_DIMENSIONS: readonly PairDimension[] = PAIRED_DIMENSIONS.flatMap((a, i) =>
  PAIRED_DIMENSIONS.slice(i + 1).map((b) => pairDimension(a, b)),
);

export const isPairedDimension = (d: string): d is PairedDimension =>
  (PAIRED_DIMENSIONS as readonly string[]).includes(d);

/** Which half of a pair key holds the given dimension. */
export function pairSide(pair: PairDimension, dimension: PairedDimension): "a" | "b" {
  return pair.split(":")[1] === dimension ? "a" : "b";
}

/** The pair counters one page view writes: every two of the dimensions it has. */
export function pairEntries(
  values: Partial<Record<PairedDimension, string>>,
): { dimension: PairDimension; key: string }[] {
  const present = PAIRED_DIMENSIONS.filter((d) => {
    const v = values[d];
    return v !== undefined && v !== "" && !v.includes(PAIR_SEPARATOR);
  });
  const out: { dimension: PairDimension; key: string }[] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const a = present[i]!;
      const b = present[j]!;
      out.push({
        dimension: pairDimension(a, b),
        key: `${values[a]}${PAIR_SEPARATOR}${values[b]}`,
      });
    }
  }
  return out;
}

// ── path grouping ───────────────────────────────────────────────────────────

/**
 * The group a stored path belongs to: its first segment.
 *
 * `/docs/api/auth` and `/docs/intro` are both `/docs`; `/` and `/work` are their
 * own groups. Grouped on read, so full paths stay stored and the rule can change
 * without rewriting history. A single rule on purpose: there is nothing to
 * configure until a second site shape needs a different one.
 */
export function pathGroup(path: string): string {
  const segment = path.split("/")[1];
  return segment ? `/${segment}` : "/";
}

export interface GroupedRow extends AnalyticsRow {
  /** The stored paths summed into this row; present only when there are several or the row is a prefix. */
  children?: AnalyticsRow[];
}

/**
 * Collapse path rows into groups, largest first, each carrying its members.
 *
 * A group whose only member is the group path itself (`/work`) has no children:
 * there is nothing to expand. `/docs` the page and `/docs/intro` do group, and the
 * page shows up among the children like any other member.
 */
export function groupPaths(rows: readonly AnalyticsRow[]): GroupedRow[] {
  const groups = new Map<string, AnalyticsRow[]>();
  for (const row of rows) {
    const g = pathGroup(row.key);
    const list = groups.get(g);
    if (list) list.push(row);
    else groups.set(g, [row]);
  }
  return [...groups.entries()]
    .map(([key, members]): GroupedRow => {
      const count = members.reduce((s, m) => s + m.count, 0);
      const single = members.length === 1 && members[0]!.key === key;
      return single
        ? { key, count }
        : { key, count, children: [...members].sort((a, b) => b.count - a.count) };
    })
    .sort((a, b) => b.count - a.count);
}

/** Merge series rows into path groups, summing counts that land in the same bucket and group. */
export function groupPathSeries<T extends { bucket: string; key: string; count: number }>(
  rows: readonly T[],
): { bucket: string; key: string; count: number }[] {
  const merged = new Map<string, { bucket: string; key: string; count: number }>();
  for (const r of rows) {
    const key = pathGroup(r.key);
    const id = `${r.bucket}\u0000${key}`;
    const hit = merged.get(id);
    if (hit) hit.count += r.count;
    else merged.set(id, { bucket: r.bucket, key, count: r.count });
  }
  return [...merged.values()];
}

/**
 * Whether a stored path is the filtered key. A filter on a group (`/docs`) takes
 * every member; a filter on one concrete path (`/docs/intro`) takes just that.
 */
export const pathMatchesFilter = (storedPath: string, filterKey: string): boolean =>
  storedPath === filterKey || pathGroup(storedPath) === filterKey;
