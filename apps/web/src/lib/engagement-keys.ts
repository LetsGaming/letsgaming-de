import { DWELL_BUCKETS, SCROLL_DEPTHS, type DwellBucket, type ScrollDepth } from "@lg/core";

/**
 * Reading the engagement dimensions' composite keys.
 *
 * `scroll` and `dwell` store `<section>|<value>` (`home|75`, `home|1-3m`) and
 * `transition` stores `<from>><to>`. Shown raw they read as a list of codes; these
 * turn them into one funnel and one histogram per section, and a from/to pair.
 * The separators match `dwellKey`, `scrollKey` and `transitionKey` in `@lg/core`.
 */

interface CountedRow {
  key: string;
  count: number;
}

export interface ScrollStep {
  depth: ScrollDepth;
  count: number;
  /** Fraction of the funnel's entry that reached this depth, 0 to 1. */
  share: number;
}

export interface ScrollFunnel {
  section: string;
  /** What `share` is measured against: section entries when known, else the shallowest depth's count. */
  entered: number;
  steps: ScrollStep[];
}

export interface DwellHistogram {
  section: string;
  total: number;
  /** Every bucket in time order, zeros included, so histograms line up. */
  buckets: { bucket: DwellBucket; count: number; share: number }[];
}

const splitOnce = (key: string, sep: string): [string, string] | null => {
  const i = key.indexOf(sep);
  return i > 0 && i < key.length - 1 ? [key.slice(0, i), key.slice(i + 1)] : null;
};

/** `home>work` as `{ from, to }`, or null for a malformed key. */
export function parseTransition(key: string): { from: string; to: string } | null {
  const parts = splitOnce(key, ">");
  return parts ? { from: parts[0], to: parts[1] } : null;
}

const asDepth = (raw: string): ScrollDepth | null => {
  const depth = raw.replace(/%$/, "");
  return (SCROLL_DEPTHS as readonly string[]).includes(depth) ? (depth as ScrollDepth) : null;
};

const asBucket = (raw: string): DwellBucket | null =>
  (DWELL_BUCKETS as readonly string[]).includes(raw) ? (raw as DwellBucket) : null;

/** Rows grouped by the section half of a `<section>|<value>` key, the value half run through `parse`. */
function bySection<V>(rows: readonly CountedRow[], parse: (raw: string) => V | null) {
  const out = new Map<string, Map<V, number>>();
  for (const row of rows) {
    const parts = splitOnce(row.key, "|");
    const value = parts ? parse(parts[1]) : null;
    if (!parts || value === null) continue;
    const section = out.get(parts[0]) ?? new Map<V, number>();
    section.set(value, (section.get(value) ?? 0) + row.count);
    out.set(parts[0], section);
  }
  return out;
}

/**
 * One scroll-depth funnel per section, deepest-reaching first.
 *
 * `entries` (the `tab` rows: how many times each section was opened) is the honest
 * denominator, since a visit that never reached 25% emits no scroll row at all.
 * Without it the funnel is measured against its own shallowest step, which can
 * only ever read 100% there.
 */
export function scrollFunnels(
  rows: readonly CountedRow[],
  entries: readonly CountedRow[] = [],
): ScrollFunnel[] {
  const entryCount = new Map(entries.map((e) => [e.key, e.count]));
  const funnels: ScrollFunnel[] = [];
  for (const [section, depths] of bySection(rows, asDepth)) {
    const counts = SCROLL_DEPTHS.map((depth) => depths.get(depth) ?? 0);
    const entered = entryCount.get(section) ?? Math.max(...counts);
    funnels.push({
      section,
      entered,
      steps: SCROLL_DEPTHS.map((depth, i) => ({
        depth,
        count: counts[i]!,
        share: entered > 0 ? Math.min(1, counts[i]! / entered) : 0,
      })),
    });
  }
  return funnels.sort((a, b) => b.entered - a.entered || a.section.localeCompare(b.section));
}

/** The second-page success metric as the Analytics panel reads it. */
export function formatSecondPage(f: { visits: number; reached: number; rate: number | null }): {
  value: string;
  detail: string;
} {
  if (f.rate === null) return { value: "n/a", detail: "no confirmed visits in this range" };
  return { value: `${Math.round(f.rate * 100)}%`, detail: `${f.reached} of ${f.visits} confirmed visits` };
}

/** One dwell-time histogram per section, the most-visited first. */
export function dwellHistograms(rows: readonly CountedRow[]): DwellHistogram[] {
  const out: DwellHistogram[] = [];
  for (const [section, buckets] of bySection(rows, asBucket)) {
    const total = [...buckets.values()].reduce((s, n) => s + n, 0);
    out.push({
      section,
      total,
      buckets: DWELL_BUCKETS.map((bucket) => {
        const count = buckets.get(bucket) ?? 0;
        return { bucket, count, share: total > 0 ? count / total : 0 };
      }),
    });
  }
  return out.sort((a, b) => b.total - a.total || a.section.localeCompare(b.section));
}
