import type { AnalyticsResponse } from "@lg/core";

export interface VisitsSummary {
  /** Null when the figure is undefined for the window. */
  total: number | null;
  previous: number | null;
  /** One value per time bucket, oldest first. */
  series: number[];
  /** Server-computed percent change; null with no baseline or an unmeasured side. */
  deltaPct: number | null;
  /** False when the window ends before confirmed visits were first recorded. */
  measured: boolean;
}

/** Confirmed visits as the Dashboard shows them: the server's headline figure, untouched. */
export function visitsSummary(a: AnalyticsResponse): VisitsSummary {
  const m = a.headline.confirmedVisits;
  return { total: m.total, previous: m.previous, series: m.series, deltaPct: m.deltaPct, measured: m.measured };
}
