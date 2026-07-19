import { splitArtists, type MusicDayResponse } from "@lg/core";

export type ListKind = "songs" | "artists";

export interface DayRow {
  key: string;
  primary: string;
  secondary?: string;
  art?: string;
  minutes: number;
  plays: number;
}

/**
 * The rows for a drilled-in day, following the active list.
 *
 * `songs` → the day's tracks as-is. `artists` → the day's tracks aggregated by
 * artist (collaborations split the same way the top-artists list splits them),
 * minutes and plays summed, ordered by minutes.
 *
 * This is the single source of truth for the "click a day while on 'different
 * artists' shows that day's *artists*, not its tracks" behaviour. It lives in a
 * plain module, away from the component's reactive state, precisely so it can be
 * unit-tested and can't silently regress the way it kept doing.
 */
export function dayRowsFor(tracks: MusicDayResponse["tracks"], mode: ListKind): DayRow[] {
  if (mode === "artists") {
    const byArtist = new Map<string, DayRow>();
    for (const t of tracks) {
      for (const name of splitArtists(t.artist)) {
        const key = name.toLowerCase();
        const cur = byArtist.get(key);
        if (cur) {
          cur.minutes += t.minutes;
          cur.plays += t.plays;
          if (!cur.art && t.artUrl) cur.art = t.artUrl;
        } else {
          byArtist.set(key, {
            key,
            primary: name,
            minutes: t.minutes,
            plays: t.plays,
            ...(t.artUrl ? { art: t.artUrl } : {}),
          });
        }
      }
    }
    return [...byArtist.values()].sort((a, b) => b.minutes - a.minutes);
  }
  return tracks.map((t, i) => ({
    key: `${t.song}-${i}`,
    primary: t.song,
    secondary: t.artist,
    ...(t.artUrl ? { art: t.artUrl } : {}),
    minutes: t.minutes,
    plays: t.plays,
  }));
}
