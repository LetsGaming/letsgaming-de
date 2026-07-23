/**
 * Stacked-area chart geometry.
 *
 * All of this used to live inside `useAnalytics` — about 120 lines of axis
 * arithmetic, bucket enumeration, stacking and tick subsetting, mixed in with
 * Vue refs and a polling interval, and therefore untestable. It's pure: rows in,
 * coordinates out. Moved here so it can be asserted against exact expected
 * output, which is how the first-day truncation bug should have been caught.
 *
 * It also produces the per-bucket data a tooltip needs (`columns`), not just the
 * layer outlines. The panel previously had one native `<title>` per layer showing
 * that layer's *whole-range* total, which reads like a per-point readout and
 * isn't — hovering July 3rd reported the July total. A chart that renders values
 * over time has to be able to answer "what was it here", so answering it is part
 * of building the chart, not something the view improvises.
 */

/** Round up to a "nice" number (1/2/5 × 10ⁿ) for an axis top. */
export function niceCeil(v: number): number {
  if (v <= 1) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * base;
}

/** A "nice" step dividing `range` into roughly `count` intervals. */
export function niceStep(range: number, count: number): number {
  const raw = range / Math.max(1, count);
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * base;
}

/** Integer y-axis ticks 0..top for count data (min step 1, ~4 divisions). */
export function yAxisTicks(max: number): { top: number; ticks: number[] } {
  const step = Math.max(1, Math.round(niceStep(niceCeil(max), 4)));
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  return { top, ticks };
}

/**
 * Enumerate the continuous bucket axis for a range.
 *
 * Continuous, not "whatever the data had": a gap in traffic is information, and
 * a chart that omits empty buckets silently rescales time.
 */
export function axisBuckets(from: string, to: string, unit: "hour" | "day"): string[] {
  const out: string[] = [];
  if (unit === "hour") {
    const d = new Date(`${from.slice(0, 13)}:00:00Z`);
    const end = new Date(`${to.slice(0, 13)}:00:00Z`);
    if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return out;
    while (d <= end) {
      out.push(d.toISOString().slice(0, 13));
      d.setUTCHours(d.getUTCHours() + 1);
    }
  } else {
    const d = new Date(`${from.slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || Number.isNaN(end.getTime())) return out;
    while (d <= end) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return out;
}

/**
 * The key overflow series are grouped under.
 *
 * A `\u0000` prefix because the old code grouped them under the literal string
 * `"other"` — which silently merged with a real series actually named `other`.
 * No key from the tracker can contain a NUL, so this one can't collide.
 */
export const OTHER_KEY = "\u0000other";

export interface SeriesRow {
  bucket: string;
  key: string;
  count: number;
}

export interface ChartLayer {
  /** Series key, or `OTHER_KEY` for the grouped remainder. */
  key: string;
  /** What to show a human — the key, or "other (N)". */
  label: string;
  isOther: boolean;
  /** Index into the caller's palette. */
  colorIndex: number;
  /** Total across the whole range. */
  total: number;
  /** Value per bucket, parallel to `buckets`. */
  values: number[];
  /** SVG path for the filled band. */
  path: string;
}

/** One bucket, with everything a tooltip needs to describe it. */
export interface ChartColumn {
  bucket: string;
  label: string;
  x: number;
  total: number;
  /** Non-zero series at this bucket, largest first. */
  values: { key: string; label: string; colorIndex: number; count: number }[];
}

export interface StackedChart {
  W: number;
  H: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  buckets: string[];
  layers: ChartLayer[];
  columns: ChartColumn[];
  max: number;
  total: number;
  unit: "hour" | "day";
  yTicks: { v: number; y: number; label: string }[];
  xTicks: { x: number; label: string; anchor: "start" | "middle" | "end" }[];
  fromLabel: string;
  toLabel: string;
}

export interface StackedChartOptions {
  rows: SeriesRow[];
  from: string;
  to: string;
  unit: "hour" | "day";
  /** Series kept separate before the rest are grouped. */
  maxSeries?: number;
  /** Zone for hour-bucket labels. Day buckets are already local. */
  timeZone?: string;
  width?: number;
  height?: number;
}

const labelFmtCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Bucket → short axis label, optionally rendered in a zone.
 *
 * Day buckets arrive already expressed in the reader's zone (the server groups
 * them there, because a day boundary is a wall-clock fact), so they only need
 * trimming. Hour buckets stay UTC — an hour is an hour regardless of zone — and
 * are shifted here, which is the whole of the local-time toggle for them.
 */
export function bucketLabel(b: string, unit: "hour" | "day", timeZone?: string): string {
  if (unit === "day") return b.slice(5);
  if (!timeZone || timeZone === "UTC") return `${b.slice(5, 10)} ${b.slice(11)}h`;
  let fmt = labelFmtCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
    });
    labelFmtCache.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(new Date(`${b}:00:00Z`));
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}h`;
}

export function buildStackedChart(opts: StackedChartOptions): StackedChart {
  const { rows, from, to, unit } = opts;
  const maxSeries = opts.maxSeries ?? 6;
  const W = opts.width ?? 720;
  const H = opts.height ?? 210;

  const tz = opts.timeZone;
  const buckets = axisBuckets(from, to, unit);
  const idx = new Map(buckets.map((b, i) => [b, i]));

  // Series ordered by total desc; everything past `maxSeries` becomes one band.
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.key, (totals.get(r.key) ?? 0) + r.count);
  const ordered = [...totals.entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]);
  const kept = ordered.slice(0, maxSeries);
  const overflowCount = ordered.length - kept.length;
  const keys = overflowCount > 0 ? [...kept, OTHER_KEY] : kept;

  // A Map, not `keys.indexOf(...)` per row: that was a linear scan inside the row
  // loop, with an `includes` on the overflow list on top of it.
  const keyIndex = new Map(keys.map((k, i) => [k, i]));
  const otherIndex = keyIndex.get(OTHER_KEY);
  const rowIndex = (key: string): number | undefined => keyIndex.get(key) ?? otherIndex;

  const matrix: number[][] = keys.map(() => new Array<number>(buckets.length).fill(0));
  for (const r of rows) {
    const bi = idx.get(r.bucket);
    if (bi === undefined) continue;
    const ki = rowIndex(r.key);
    if (ki === undefined) continue;
    const series = matrix[ki];
    if (series) series[bi] = (series[bi] ?? 0) + r.count;
  }

  const colTotals = buckets.map((_, bi) => keys.reduce((s, _k, ki) => s + matrix[ki]![bi]!, 0));
  const max = Math.max(1, ...colTotals);

  // Plot box, with margins so the axes have room for their labels.
  const M = { l: 38, r: 12, t: 12, b: 34 };
  const x0 = M.l;
  const x1 = W - M.r;
  const y0 = M.t;
  const y1 = H - M.b;
  const n = buckets.length;
  const { top: yTop, ticks: yTickVals } = yAxisTicks(max);
  const xAt = (i: number): number => (n <= 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0));
  const yAt = (v: number): number => y1 - (v / yTop) * (y1 - y0);

  const label = (key: string): string =>
    key === OTHER_KEY ? `other (${overflowCount})` : key;

  // Stacked bands, bottom-up.
  const cum = new Array<number>(buckets.length).fill(0);
  const layers: ChartLayer[] = keys.map((key, ki) => {
    const lower = cum.slice();
    for (let bi = 0; bi < buckets.length; bi++) cum[bi]! += matrix[ki]![bi]!;
    const top = cum.map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join(" ");
    const bottom = lower
      .map((_, i) => {
        const j = buckets.length - 1 - i;
        return `L${xAt(j).toFixed(1)} ${yAt(lower[j]!).toFixed(1)}`;
      })
      .join(" ");
    return {
      key,
      label: label(key),
      isOther: key === OTHER_KEY,
      colorIndex: ki,
      total: matrix[ki]!.reduce((s, v) => s + v, 0),
      values: matrix[ki]!.slice(),
      path: `${top} ${bottom} Z`,
    };
  });

  // Per-bucket detail for the tooltip: only the series actually present, biggest
  // first, so a hover reads as "what happened here" rather than a list of zeroes.
  const columns: ChartColumn[] = buckets.map((bucket, bi) => ({
    bucket,
    label: bucketLabel(bucket, unit, tz),
    x: +xAt(bi).toFixed(1),
    total: colTotals[bi]!,
    values: keys
      .map((key, ki) => ({
        key,
        label: label(key),
        colorIndex: ki,
        count: matrix[ki]![bi]!,
      }))
      .filter((v) => v.count > 0)
      .sort((a, b) => b.count - a.count),
  }));

  const yTicks = yTickVals.map((v) => ({ v, y: +yAt(v).toFixed(1), label: String(v) }));

  // X ticks: a readable subset (~6), first and last always shown.
  const targetX = Math.min(n, 6);
  const stepX = Math.max(1, Math.round((n - 1) / Math.max(1, targetX - 1)));
  const xTicks: StackedChart["xTicks"] = [];
  for (let i = 0; i < n; i += stepX) {
    xTicks.push({ x: +xAt(i).toFixed(1), label: bucketLabel(buckets[i]!, unit, tz), anchor: "middle" });
  }
  if (n > 1 && (n - 1) % stepX !== 0) {
    xTicks.push({ x: +xAt(n - 1).toFixed(1), label: bucketLabel(buckets[n - 1]!, unit, tz), anchor: "end" });
  }
  if (xTicks.length) {
    xTicks[0]!.anchor = "start";
    xTicks[xTicks.length - 1]!.anchor = "end";
  }

  return {
    W,
    H,
    x0,
    x1,
    y0,
    y1,
    buckets,
    layers,
    columns,
    max,
    total: colTotals.reduce((s, v) => s + v, 0),
    unit,
    yTicks,
    xTicks,
    fromLabel: buckets.length ? bucketLabel(buckets[0]!, unit, tz) : "",
    toLabel: buckets.length ? bucketLabel(buckets[n - 1]!, unit, tz) : "",
  };
}

/**
 * The bucket nearest an x coordinate, for pointer tracking.
 *
 * The chart is sampled at `n` points across the plot, so hit-testing is nearest
 * neighbour on that lattice rather than anything geometric. Doing it here means
 * the pointer maths and the plotting maths can't drift apart — the reason the
 * old per-layer `<title>` reported a range total was precisely that the view had
 * no way to get back from a position to a bucket.
 */
export function columnAtX(chart: StackedChart, x: number): ChartColumn | undefined {
  const n = chart.columns.length;
  if (!n) return undefined;
  if (n === 1) return chart.columns[0];
  const t = (x - chart.x0) / (chart.x1 - chart.x0);
  const i = Math.round(t * (n - 1));
  return chart.columns[Math.min(n - 1, Math.max(0, i))];
}
