/**
 * Playtime API. One concern: historical game playtime. This is the drill-in
 * behind a clicked ledger column — one day's per-game breakdown, fetched on
 * demand rather than shipped with the module (the strip is ~365 days and nobody
 * wants 365 breakdowns they didn't ask for).
 *
 * Split out of the presence route on purpose: presence is "right now" (Discord),
 * playtime is accumulated history (observed sessions). Different subjects,
 * different lifetimes, different endpoints.
 */

import { gameMetaKey, isHiddenGame, isValidTimeZone, sanitizeTimeZone, type PlaytimeDayResponse } from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerPlaytimeRoutes(app: FastifyInstance, store: Store): void {
  app.get<{ Querystring: { day?: string; tz?: string }; Reply: PlaytimeDayResponse | { error: string } }>(
    "/api/playtime/day",
    async (req, reply) => {
      const day = req.query.day ?? "";
      if (!DAY_RE.test(day)) {
        return reply.code(400).send({ error: "day must be YYYY-MM-DD" });
      }
      // The zone the day is interpreted in: the caller's if valid, else the owner's
      // (the `TZ` env var) — matching however the strip that was clicked bucketed.
      const tz = req.query.tz;
      const zone = tz && isValidTimeZone(tz) ? tz : sanitizeTimeZone(process.env.TZ);
      // Hidden games are dropped wherever a name would surface publicly. The
      // aggregate ledger and heatmap are shape (when / how much), not identity, so
      // they stay honest totals; this breakdown names games, so it filters.
      const hidden = store.content.getPresence().hiddenGames;
      // Cover art + genre, matched by name — same cache the top-games list uses, so
      // a game looks the same drilled-in as it does in the list.
      const meta = store.gameMeta.getAll();
      const games = store.sessions
        .dayBreakdown("game", day, zone)
        .filter((g) => !isHiddenGame(g.name, hidden))
        .map((g) => {
          const m = meta.get(gameMetaKey(g.name));
          return {
            name: g.name,
            minutes: g.minutes,
            sessions: g.sessions,
            exact: g.exact,
            ...(m?.coverUrl ? { coverUrl: m.coverUrl } : {}),
            ...(m?.genre ? { genre: m.genre } : {}),
          };
        });
      return { day, games };
    },
  );
}
