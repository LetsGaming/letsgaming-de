/**
 * Music API. One concern: historical Spotify listening. This is the drill-in
 * behind a clicked listening-timeline column — one day's tracks, fetched on
 * demand (parallel to `/api/playtime/day`) rather than shipping a fortnight of
 * per-day track lists with the module.
 *
 * Split out of the presence route on purpose: presence is "right now" (the live
 * Discord/Spotify activity), this is the accumulated `music_plays` history. No
 * hidden-name filter — music has no per-track hide list, and the tracks are
 * Spotify's, not the owner's own games.
 */

import { capList, dayRowsFor, type MusicDayResponse } from "@lg/core";
import { isValidDay, resolveZone } from "./day-request.js";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";


export function registerMusicRoutes(app: FastifyInstance, store: Store): void {
  app.get<{ Querystring: { day?: string; tz?: string }; Reply: MusicDayResponse | { error: string } }>(
    "/api/music/day",
    async (req, reply) => {
      const day = req.query.day ?? "";
      if (!isValidDay(day)) {
        return reply.code(400).send({ error: "day must be YYYY-MM-DD" });
      }
      const zone = resolveZone(req.query.tz);
      // Aggregate the raw plays into both views, then cap each to the module's
      // maxCount — so the client is sent only the top-N songs and top-N artists it
      // can show, never the whole day. The distinct counts and total minutes are
      // reported alongside (uncapped), for the summary and the "and N more" note.
      const max = store.content.getMusic().maxCount;
      const tracks = store.music.dayBreakdown(day, zone);
      const minutes = tracks.reduce((sum, t) => sum + t.minutes, 0);
      const songs = capList(dayRowsFor(tracks, "songs"), max);
      const artists = capList(dayRowsFor(tracks, "artists"), max);
      return {
        day,
        minutes,
        trackCount: songs.total,
        artistCount: artists.total,
        songs: songs.rows,
        artists: artists.rows,
      };
    },
  );
}
