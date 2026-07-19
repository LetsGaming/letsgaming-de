/**
 * Turn a sparse, data-only day list into a contiguous calendar run.
 *
 * The store returns one row per day that *has* activity, so a strip built straight
 * from it collapses empty days and looks lopsided (three cells with big gaps in
 * meaning). GitHub doesn't do that — it shows every day in the window, empty ones
 * included. This fills the gap: given the days that have data, it returns every day
 * from `fromIso` to `toIso` inclusive, oldest first, zero-filling the rest.
 *
 * Days are `YYYY-MM-DD` in UTC (the same slice the store and the API use). The
 * 1000-day guard is a floor under a pathological range (a very old first day, a
 * bad input) — the strips never want more than a few months anyway.
 */
export interface DayMinutes {
  day: string;
  minutes: number;
}

const MAX_DAYS = 1000;

export function contiguousDays(sparse: DayMinutes[], fromIso: string, toIso: string): DayMinutes[] {
  const have = new Map(sparse.map((d) => [d.day, d.minutes]));
  const out: DayMinutes[] = [];
  const cur = new Date(`${fromIso}T00:00:00Z`);
  const end = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return sparse;

  let guard = 0;
  while (cur.getTime() <= end.getTime() && guard < MAX_DAYS) {
    const iso = cur.toISOString().slice(0, 10);
    out.push({ day: iso, minutes: have.get(iso) ?? 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
    guard += 1;
  }
  return out;
}

/** The ISO day (UTC) `n` days before `toIso`. Used to open a fixed window, e.g.
 *  the last 14 days regardless of how far back the data goes. */
export function daysBefore(toIso: string, n: number): string {
  const d = new Date(`${toIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Format an ISO day as a short human label, e.g. `Mon 3 Mar`. The heat strips,
 *  their axes, and the day-drill headings all render days this way. */
export function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}
