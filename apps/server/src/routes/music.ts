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

import type { MusicDayResponse } from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerMusicRoutes(app: FastifyInstance, store: Store): void {
  app.get<{ Querystring: { day?: string }; Reply: MusicDayResponse | { error: string } }>(
    "/api/music/day",
    async (req, reply) => {
      const day = req.query.day ?? "";
      if (!DAY_RE.test(day)) {
        return reply.code(400).send({ error: "day must be YYYY-MM-DD" });
      }
      return { day, tracks: store.music.dayBreakdown(day) };
    },
  );
}
