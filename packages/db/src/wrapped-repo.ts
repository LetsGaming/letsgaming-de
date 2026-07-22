import type { DatabaseSync } from "node:sqlite";
import { asNumber, asText, mapRows, type Row } from "./row-mapper.js";

/**
 * The Wrapped retrospective's queries.
 *
 * Its own repo rather than extra methods on `music`/`sessions`, because it needs a
 * different *shape* of window than either: those aggregate open-endedly from a
 * `since` to now, which is right for a rolling 14-day strip, while Wrapped
 * summarizes a closed period `[start, end)` that stops moving once the window
 * opens. Threading an optional upper bound through the existing queries would have
 * made every caller's window ambiguous at a glance; a separate, obviously-bounded
 * set of queries doesn't.
 *
 * The upper bound is exclusive everywhere, so consecutive periods can't both claim
 * the same play or session.
 */

/** A session shorter than this is a single poll with no duration, not a fact. */
const MIN_SESSION_SECONDS = 60;

/** The `presence_sessions.category` games are stored under. Named rather than
 *  inlined because it must match what the sampler writes and what the playtime
 *  module queries — a mismatch reads as "you played nothing", not as an error. */
const GAME_CATEGORY = "game";

export interface WrappedRankRow {
  name: string;
  detail?: string;
  minutes: number;
  plays: number;
  artUrl?: string;
}

export function wrappedRepo(db: DatabaseSync) {
  /** Seconds → whole minutes, the unit every view uses. */
  const minutes = (seconds: unknown): number => Math.round(asNumber(seconds) / 60);

  return {
    /** Top tracks in `[startIso, endIso)`, by time listened. */
    topSongs(startIso: string, endIso: string, limit: number): WrappedRankRow[] {
      return mapRows(
        db.prepare(`
          SELECT
            MAX(song) AS song,
            MAX(artist) AS artist,
            MAX(album_art_url) AS art,
            SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds,
            COUNT(*) AS plays
          FROM music_plays
          WHERE last_seen_at >= ? AND last_seen_at < ?
          GROUP BY track_id
          ORDER BY seconds DESC, song ASC
          LIMIT ?
        `),
        (r: Row): WrappedRankRow => ({
          name: asText(r.song),
          minutes: minutes(r.seconds),
          plays: asNumber(r.plays),
          ...(r.artist ? { detail: asText(r.artist) } : {}),
          ...(r.art ? { artUrl: asText(r.art) } : {}),
        }),
        startIso,
        endIso,
        limit,
      );
    },

    /**
     * Top artists in `[startIso, endIso)`. Joins through `music_play_artists` so a
     * collaboration counts toward everyone on it — the same rule the Listening
     * module uses, so the two can't disagree about who you listened to.
     */
    topArtists(startIso: string, endIso: string, limit: number): WrappedRankRow[] {
      return mapRows(
        db.prepare(`
          SELECT
            MAX(a.artist) AS artist,
            SUM(strftime('%s', p.last_seen_at) - strftime('%s', p.started_at)) AS seconds,
            COUNT(*) AS plays,
            -- An artist has no cover of its own in the presence data, so borrow the
            -- art of this artist's most-listened track *within the same window* —
            -- the same rule the Listening module uses, so the two agree on who looks
            -- like what. A monogram fills in when even that has none.
            (
              SELECT p2.album_art_url
              FROM music_play_artists a2
              JOIN music_plays p2 ON p2.id = a2.play_id
              WHERE a2.artist_key = a.artist_key
                AND p2.last_seen_at >= ? AND p2.last_seen_at < ?
                AND p2.album_art_url IS NOT NULL
              GROUP BY p2.track_id
              ORDER BY SUM(strftime('%s', p2.last_seen_at) - strftime('%s', p2.started_at)) DESC
              LIMIT 1
            ) AS art
          FROM music_play_artists a
          JOIN music_plays p ON p.id = a.play_id
          WHERE p.last_seen_at >= ? AND p.last_seen_at < ?
          GROUP BY a.artist_key
          ORDER BY seconds DESC, artist ASC
          LIMIT ?
        `),
        (r: Row): WrappedRankRow => ({
          name: asText(r.artist),
          minutes: minutes(r.seconds),
          plays: asNumber(r.plays),
          ...(r.art ? { artUrl: asText(r.art) } : {}),
        }),
        // The correlated subquery's bounds bind first — SQLite numbers parameters
        // by position in the statement text, and the subquery appears before the
        // outer WHERE.
        startIso,
        endIso,
        startIso,
        endIso,
        limit,
      );
    },

    /**
     * Top games in `[startIso, endIso)`. Returns every game over the floor rather
     * than a LIMIT, because hidden names are filtered *after* the query (the hidden
     * list is CMS content, not a column) — trimming here would let a hidden game
     * eat a slot and silently shorten the list.
     */
    topGames(startIso: string, endIso: string): WrappedRankRow[] {
      return mapRows(
        db.prepare(`
          SELECT
            name,
            SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds,
            COUNT(*) AS sessions
          FROM presence_sessions
          WHERE category = ? AND started_at >= ? AND started_at < ?
          GROUP BY name
          HAVING seconds >= ?
          ORDER BY seconds DESC, name ASC
        `),
        (r: Row): WrappedRankRow => ({
          name: asText(r.name),
          minutes: minutes(r.seconds),
          plays: asNumber(r.sessions),
        }),
        GAME_CATEGORY,
        startIso,
        endIso,
        MIN_SESSION_SECONDS,
      );
    },

    /** Total minutes listened in the period (uncapped by any list limit). */
    minutesListened(startIso: string, endIso: string): number {
      const row = db
        .prepare(`
          SELECT SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds
          FROM music_plays
          WHERE last_seen_at >= ? AND last_seen_at < ?
        `)
        .get(startIso, endIso) as { seconds: number | null } | undefined;
      return minutes(row?.seconds ?? 0);
    },

    /** Total minutes played in the period, all games — including hidden ones, since
     *  this is a total (shape), not a list (identity), matching the playtime rule. */
    minutesPlayed(startIso: string, endIso: string): number {
      const row = db
        .prepare(`
          SELECT SUM(strftime('%s', last_seen_at) - strftime('%s', started_at)) AS seconds
          FROM presence_sessions
          WHERE category = ? AND started_at >= ? AND started_at < ?
        `)
        .get(GAME_CATEGORY, startIso, endIso) as { seconds: number | null } | undefined;
      return minutes(row?.seconds ?? 0);
    },
  };
}

export type WrappedRepo = ReturnType<typeof wrappedRepo>;
