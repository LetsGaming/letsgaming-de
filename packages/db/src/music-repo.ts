import {
  PLAYTIME_MIN_SECONDS,
  splitArtists,
  type MusicPlay,
  type MusicRankEntry,
} from "@lg/core";
import type { DatabaseSync } from "node:sqlite";
import { asNumber, asText, mapRows, type Row } from "./row-mapper.js";

/**
 * Spotify track plays, accumulated from presence polls.
 *
 * Separate from `sessionsRepo` because a track is three subjects (song, artist,
 * album), not one — see `0005_music_plays.sql`. Idempotent by `(track_id,
 * started_at)`: Discord dates each track, so the same song scrobbles once no
 * matter how often the sampler catches it.
 */
export function musicRepo(db: DatabaseSync) {
  const upsertPlay = db.prepare(`
    INSERT INTO music_plays (track_id, song, artist, album, started_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (track_id, started_at) DO UPDATE SET
      last_seen_at = MAX(last_seen_at, excluded.last_seen_at)
    RETURNING id
  `);
  const insertArtist = db.prepare(`
    INSERT INTO music_play_artists (play_id, artist_key, artist)
    VALUES (?, ?, ?)
    ON CONFLICT (play_id, artist_key) DO NOTHING
  `);

  /** The "duration" expression shared by every rollup: seconds between the
   *  track's start and the last time it was seen. */
  const DURATION = "strftime('%s', last_seen_at) - strftime('%s', started_at)";

  return {
    /**
     * Record that a track was seen playing.
     *
     * Upserts the play (idempotent by track + start), then writes one artist row
     * per collaborator so "top artists" can count each. Re-observing an existing
     * play only bumps `last_seen_at`; the artist rows already exist and the
     * `DO NOTHING` makes re-inserting them a no-op.
     */
    observe(play: MusicPlay): void {
      const row = upsertPlay.get(
        play.trackId,
        play.song,
        play.artist,
        play.album ?? null,
        play.startedAt,
        play.seenAt,
      ) as { id: number } | undefined;
      if (!row) return;
      for (const artist of splitArtists(play.artist)) {
        insertArtist.run(row.id, artist.toLowerCase(), artist);
      }
    },

    /**
     * Top songs over a window — grouped by track, most-listened first.
     *
     * Sub-minute plays are dropped (a track skipped after seconds isn't a listen),
     * the same floor `presence_sessions` uses. `song`/`artist` come from the most
     * recent play of the track, so a re-titled release shows its latest name.
     */
    topSongs(sinceIso: string, limit: number): MusicRankEntry[] {
      return mapRows(
        db.prepare(`
          SELECT
            track_id,
            MAX(song) AS song,
            MAX(artist) AS artist,
            SUM(${DURATION}) AS seconds,
            COUNT(*) AS plays
          FROM music_plays
          WHERE last_seen_at >= ?
          GROUP BY track_id
          HAVING seconds >= ?
          ORDER BY seconds DESC, song ASC
          LIMIT ?
        `),
        (r: Row): MusicRankEntry => ({
          name: asText(r.song),
          by: asText(r.artist),
          minutes: Math.round(asNumber(r.seconds) / 60),
          plays: asNumber(r.plays),
        }),
        sinceIso,
        PLAYTIME_MIN_SECONDS,
        limit,
      );
    },

    /**
     * Top artists over a window.
     *
     * Joins through `music_play_artists`, so a collaboration counts toward every
     * artist on it. Grouped by the lower-cased key but displayed with the casing
     * Discord sent. `COUNT(DISTINCT play_id)` because one play with three artists
     * mustn't count as three plays for one of them.
     */
    topArtists(sinceIso: string, limit: number): MusicRankEntry[] {
      return mapRows(
        db.prepare(`
          SELECT
            a.artist_key,
            MAX(a.artist) AS artist,
            SUM(${DURATION}) AS seconds,
            -- COUNT, not COUNT(DISTINCT p.id): the (play_id, artist_key) primary
            -- key means an artist appears at most once per play, so the join can't
            -- multiply a play into several rows for one artist. Distinct would be
            -- defending against a duplicate the schema already forbids.
            COUNT(*) AS plays
          FROM music_play_artists a
          JOIN music_plays p ON p.id = a.play_id
          WHERE p.last_seen_at >= ?
          GROUP BY a.artist_key
          HAVING seconds >= ?
          ORDER BY seconds DESC, artist ASC
          LIMIT ?
        `),
        (r: Row): MusicRankEntry => ({
          name: asText(r.artist),
          minutes: Math.round(asNumber(r.seconds) / 60),
          plays: asNumber(r.plays),
        }),
        sinceIso,
        PLAYTIME_MIN_SECONDS,
        limit,
      );
    },

    /** Top albums over a window. Plays with no album are excluded rather than
     *  bucketed under an empty name. */
    topAlbums(sinceIso: string, limit: number): MusicRankEntry[] {
      return mapRows(
        db.prepare(`
          SELECT
            album,
            MAX(artist) AS artist,
            SUM(${DURATION}) AS seconds,
            COUNT(*) AS plays
          FROM music_plays
          WHERE last_seen_at >= ? AND album IS NOT NULL AND album <> ''
          GROUP BY album
          HAVING seconds >= ?
          ORDER BY seconds DESC, album ASC
          LIMIT ?
        `),
        (r: Row): MusicRankEntry => ({
          name: asText(r.album),
          by: asText(r.artist),
          minutes: Math.round(asNumber(r.seconds) / 60),
          plays: asNumber(r.plays),
        }),
        sinceIso,
        PLAYTIME_MIN_SECONDS,
        limit,
      );
    },

    /** Minutes listened per day, oldest first — the timeline, same shape as the
     *  playtime ledger so the module can reuse the strip. */
    dailyTotals(sinceIso: string): { day: string; minutes: number }[] {
      return mapRows(
        db.prepare(`
          SELECT date(started_at) AS day, SUM(${DURATION}) AS seconds
          FROM music_plays
          WHERE started_at >= ?
          GROUP BY day
          ORDER BY day ASC
        `),
        (r: Row) => ({ day: asText(r.day), minutes: Math.round(asNumber(r.seconds) / 60) }),
        sinceIso,
      );
    },

    /** Total minutes listened over a window, for the headline figure. */
    totalMinutes(sinceIso: string): number {
      const row = db
        .prepare(`SELECT SUM(${DURATION}) AS seconds FROM music_plays WHERE last_seen_at >= ?`)
        .get(sinceIso) as { seconds: number | null } | undefined;
      return Math.round((row?.seconds ?? 0) / 60);
    },

    /** Drop plays older than a cutoff. Artist rows cascade. Shares the retention
     *  setting with the session pruner. */
    prune(beforeIso: string): number {
      const info = db.prepare("DELETE FROM music_plays WHERE last_seen_at < ?").run(beforeIso);
      return Number(info.changes ?? 0);
    },
  };
}
