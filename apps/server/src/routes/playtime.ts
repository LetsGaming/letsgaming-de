/**
 * Playtime API. One concern: historical game playtime. This is the drill-in
 * behind a clicked ledger column — one day's per-game breakdown, fetched on
 * demand rather than shipped with the module (the strip is ~365 days and nobody
 * wants 365 breakdowns they didn't ask for).
 *
 * Split out of the presence route on purpose: presence is "right now" (Discord),
 * playtime is accumulated history (Steam + observed sessions). Different sources,
 * different lifetimes, different endpoints.
 */

import { isHiddenGame, type PlaytimeDayResponse } from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function registerPlaytimeRoutes(app: FastifyInstance, store: Store): void {
  app.get<{ Querystring: { day?: string }; Reply: PlaytimeDayResponse | { error: string } }>(
    "/api/playtime/day",
    async (req, reply) => {
      const day = req.query.day ?? "";
      if (!DAY_RE.test(day)) {
        return reply.code(400).send({ error: "day must be YYYY-MM-DD" });
      }
      // Hidden games are dropped wherever a name would surface publicly. The
      // aggregate ledger and heatmap are shape (when / how much), not identity, so
      // they stay honest totals; this breakdown names games, so it filters.
      const hidden = store.content.getPresence().hiddenGames;
      const games = store.sessions
        .dayBreakdown("game", day)
        .filter((g) => !isHiddenGame(g.name, hidden));
      return { day, games };
    },
  );
}
