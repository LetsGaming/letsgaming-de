import {
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
    INSERT INTO music_plays (track_id, song, artist, album, album_art_url, started_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (track_id, started_at) DO UPDATE SET
      last_seen_at = MAX(last_seen_at, excluded.last_seen_at),
      -- Backfill art if an earlier poll of this play didn't have it yet.
      album_art_url = COALESCE(music_plays.album_art_url, excluded.album_art_url)
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
        play.albumArtUrl ?? null,
        play.startedAt,
        play.seenAt,
      ) as { id: number } | undefined;
      if (!row) return;
      for (const artist of splitArtists(play.artist)) {
        insertArtist.run(row.id, artist.toLowerCase(), artist);
      }
    },

    /**
     * Songs over a window — grouped by track, most-listened first.
     *
     * Every distinct track that was seen playing is returned (no cap), and there's
     * no sub-minute floor: this list is meant to reconcile exactly with the
     * "tracks played" count and with each day's breakdown, so a track that shows up
     * when you drill into a day also shows up here. A brief play sorts to the
     * bottom (ordered by seconds) rather than being hidden. `song`/`artist` come
     * from the most recent play of the track, so a re-titled release shows its
     * latest name.
     */
    topSongs(sinceIso: string, limit: number): MusicRankEntry[] {
      return mapRows(
        db.prepare(`
          SELECT
            track_id,
            MAX(song) AS song,
            MAX(artist) AS artist,
            MAX(album_art_url) AS art,
            SUM(${DURATION}) AS seconds,
            COUNT(*) AS plays
          FROM music_plays
          WHERE last_seen_at >= ?
          GROUP BY track_id
          ORDER BY seconds DESC, song ASC
          LIMIT ?
        `),
        (r: Row): MusicRankEntry => ({
          name: asText(r.song),
          by: asText(r.artist),
          minutes: Math.round(asNumber(r.seconds) / 60),
          plays: asNumber(r.plays),
          ...(r.art ? { artUrl: asText(r.art) } : {}),
        }),
        sinceIso,
        limit,
      );
    },

    /**
     * Artists over a window.
     *
     * Joins through `music_play_artists`, so a collaboration counts toward every
     * artist on it. Grouped by the lower-cased key but displayed with the casing
     * Discord sent. `limit` is the CMS display cap (maxCount) applied as a query
     * LIMIT — the frontend never receives more than this. No sub-minute floor: the
     * rows that do come back must still reconcile with what a day's tracks add up
     * to. The "different artists" headline is a separate COUNT (`distinctArtists`)
     * and is deliberately *not* capped, so a count larger than the list is expected.
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
            COUNT(*) AS plays,
            -- An artist has no cover of its own in the presence data, so borrow the
            -- art of this artist's single most-listened track. The correlated
            -- subquery picks the track with the most seconds among plays crediting
            -- this artist; a monogram fills in when even that has none.
            (
              SELECT p2.album_art_url
              FROM music_play_artists a2
              JOIN music_plays p2 ON p2.id = a2.play_id
              WHERE a2.artist_key = a.artist_key
                AND p2.last_seen_at >= ?
                AND p2.album_art_url IS NOT NULL
              GROUP BY p2.track_id
              ORDER BY SUM(strftime('%s', p2.last_seen_at) - strftime('%s', p2.started_at)) DESC
              LIMIT 1
            ) AS art
          FROM music_play_artists a
          JOIN music_plays p ON p.id = a.play_id
          WHERE p.last_seen_at >= ?
          GROUP BY a.artist_key
          ORDER BY seconds DESC, artist ASC
          LIMIT ?
        `),
        (r: Row): MusicRankEntry => ({
          name: asText(r.artist),
          minutes: Math.round(asNumber(r.seconds) / 60),
          plays: asNumber(r.plays),
          ...(r.art ? { artUrl: asText(r.art) } : {}),
        }),
        sinceIso,
        sinceIso,
        limit,
      );
    },

    /** Top albums over a window. Plays with no album are excluded rather than
     *  bucketed under an empty name. Capped (this list isn't a headline figure).
     *  No sub-minute floor, to stay consistent with the songs/artists lists. */
    topAlbums(sinceIso: string, limit: number): MusicRankEntry[] {
      return mapRows(
        db.prepare(`
          SELECT
            album,
            MAX(artist) AS artist,
            MAX(album_art_url) AS art,
            SUM(${DURATION}) AS seconds,
            COUNT(*) AS plays
          FROM music_plays
          WHERE last_seen_at >= ? AND album IS NOT NULL AND album <> ''
          GROUP BY album
          ORDER BY seconds DESC, album ASC
          LIMIT ?
        `),
        (r: Row): MusicRankEntry => ({
          name: asText(r.album),
          by: asText(r.artist),
          minutes: Math.round(asNumber(r.seconds) / 60),
          plays: asNumber(r.plays),
          ...(r.art ? { artUrl: asText(r.art) } : {}),
        }),
        sinceIso,
        limit,
      );
    },

    /** Distinct tracks played since a cutoff — the "tracks played" headline. A
     *  count of tracks, not plays: two listens of one song is one track. */
    distinctTracks(sinceIso: string): number {
      const row = db
        .prepare("SELECT COUNT(DISTINCT track_id) AS n FROM music_plays WHERE last_seen_at >= ?")
        .get(sinceIso) as { n: number } | undefined;
      return row ? Number(row.n) : 0;
    },

    /** Distinct artists since a cutoff — the "different artists" headline. Counts
     *  the split artist keys, so a collaboration's members each count once. */
    distinctArtists(sinceIso: string): number {
      const row = db
        .prepare(`
          SELECT COUNT(DISTINCT a.artist_key) AS n
          FROM music_play_artists a
          JOIN music_plays p ON p.id = a.play_id
          WHERE p.last_seen_at >= ?
        `)
        .get(sinceIso) as { n: number } | undefined;
      return row ? Number(row.n) : 0;
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

    /**
     * The tracks played on one date — the drill-in, fetched when a timeline column
     * is clicked (parallel to `sessions.dayBreakdown`). Grouped by track so a song
     * played twice in a day is one row with two plays; ordered most-listened first.
     * No sub-minute floor here: the day view is a faithful account of that date, and
     * a short listen is still part of it.
     */
    dayBreakdown(day: string): { song: string; artist: string; minutes: number; plays: number; artUrl?: string }[] {
      return mapRows(
        db.prepare(`
          SELECT
            track_id,
            MAX(song) AS song,
            MAX(artist) AS artist,
            MAX(album_art_url) AS art,
            SUM(${DURATION}) AS seconds,
            COUNT(*) AS plays
          FROM music_plays
          WHERE date(started_at) = ?
          GROUP BY track_id
          ORDER BY seconds DESC, song ASC
        `),
        (r: Row) => ({
          song: asText(r.song),
          artist: asText(r.artist),
          minutes: Math.round(asNumber(r.seconds) / 60),
          plays: asNumber(r.plays),
          ...(r.art ? { artUrl: asText(r.art) } : {}),
        }),
        day,
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
