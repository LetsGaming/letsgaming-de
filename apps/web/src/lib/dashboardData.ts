import type { AnalyticsResponse } from "@lg/core";

export interface VisitsSummary {
  total: number;
  previous: number | null;
  /** One value per time bucket, oldest first. */
  series: number[];
  /** Percent change vs the previous window; null with no baseline or a zero baseline. */
  pct: number | null;
}

/**
 * Confirmed visits (one `session_dwell` beacon per visit) from an analytics
 * response: the same total the Analytics panel shows as "Confirmed visits".
 */
export function visitsSummary(a: AnalyticsResponse): VisitsSummary {
  const points = a.chart.visitLength;
  const byBucket = new Map<string, number>();
  for (const p of points) byBucket.set(p.bucket, (byBucket.get(p.bucket) ?? 0) + p.count);
  const series = [...byBucket.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([, n]) => n);
  const total = a.visits?.total ?? series.reduce((s, n) => s + n, 0);
  const previous = a.visits?.previous ?? null;
  const pct = previous !== null && previous > 0 ? ((total - previous) / previous) * 100 : null;
  return { total, previous, series, pct };
}
