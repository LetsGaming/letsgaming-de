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

/**
 * Format an ISO day as a short human label, e.g. `Mon 3 Mar` / `Mo., 3. März`.
 * The heat strips, their axes, and the day-drill headings all render days this way.
 *
 * The locale is a parameter because it was `"en-GB"`, hardcoded — so the German
 * site rendered German everywhere except its dates, which is the one place a
 * mismatch is unmistakable. Callers pass the locale the page was rendered in
 * (`useT().locale`), for the same reason it travels with the SiteView rather than
 * being re-derived: a component guessing from `navigator.language` would disagree
 * with SSR and mismatch on hydrate.
 *
 * Defaulted rather than required so a non-visual caller (a title attribute, a
 * test) isn't forced to thread a locale it has no opinion about.
 */
export function fmtDay(iso: string, locale: string = "en-GB"): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(localeTag(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/**
 * Map a site locale to a BCP-47 tag for `Intl`.
 *
 * `"en"` becomes `en-GB` rather than plain `en`, which `Intl` resolves to US
 * conventions: `Mar 3` where every other date on this site reads `3 Mar`.
 */
function localeTag(locale: string): string {
  return locale === "de" ? "de-DE" : "en-GB";
}

/**
 * The seven weekday abbreviations, in the locale, Monday first.
 *
 * For the playtime heatmap's row labels, which were a hardcoded `["Mon", …]`
 * array. Derived from `Intl` against known Mondays-onward dates rather than
 * written out per locale, so a third locale needs no new list.
 */
export function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(localeTag(locale), { weekday: "short", timeZone: "UTC" });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2024, 0, 1 + i))),
  );
}
