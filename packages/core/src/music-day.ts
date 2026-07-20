import { splitArtists } from "./presence.js";

export type ListKind = "songs" | "artists";

/** A raw per-track row for a drilled-in day — what the store's `dayBreakdown`
 *  yields, and what `dayRowsFor` aggregates into the rendered rows. */
export interface MusicDayTrack {
  song: string;
  artist: string;
  minutes: number;
  plays: number;
  artUrl?: string;
}

/** One rendered row of a day's listening — a song or an aggregated artist. */
export interface DayRow {
  key: string;
  primary: string;
  secondary?: string;
  art?: string;
  minutes: number;
  plays: number;
}

/**
 * `/api/music/day` reply: one date's listening, pre-aggregated and pre-capped.
 *
 * `songs` and `artists` are both already trimmed to the module's `maxCount`
 * server-side (aggregated with `dayRowsFor` before the cap, so the artist list is
 * the true top-N artists, not artists of the top-N tracks). `trackCount` /
 * `artistCount` are the real distinct totals — for the summary line and the "and N
 * more" the cap hides — and `minutes` is the day's real total. The client receives
 * no rows past the cap.
 */
export interface MusicDayResponse {
  day: string;
  /** Total minutes for the day, across all tracks (summary line). */
  minutes: number;
  /** Distinct tracks played this day — the true total behind the capped songs. */
  trackCount: number;
  /** Distinct artists this day — the true total behind the capped artists. */
  artistCount: number;
  /** Top songs for the day, capped to `maxCount`. */
  songs: DayRow[];
  /** Top artists for the day, capped to `maxCount`. */
  artists: DayRow[];
}

/**
 * The rows for a drilled-in day, following the active list.
 *
 * `songs` → the day's tracks as-is. `artists` → the day's tracks aggregated by
 * artist (collaborations split the same way the top-artists list splits them),
 * minutes and plays summed, ordered by minutes.
 *
 * This is the single source of truth for the "click a day while on 'different
 * artists' shows that day's *artists*, not its tracks" behaviour. It lives in core
 * so the **server** runs it and caps the result before sending — the client only
 * ever receives the capped rows — while staying a plain, unit-tested pure function.
 */
export function dayRowsFor(tracks: readonly MusicDayTrack[], mode: ListKind): DayRow[] {
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
