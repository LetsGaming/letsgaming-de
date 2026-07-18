/**
 * Presence relay. The server — not the browser — talks to Lanyard, applies the
 * owner's category allow-list, and returns ONLY the permitted result. The client
 * never receives raw Lanyard data, never learns the Discord id, and never sees a
 * category the owner disabled: the backend is the filtering boundary, exactly
 * like every other source.
 *
 * The allow-list is CMS-owned (read from the store per request, so toggles take
 * effect immediately). A short shared cache — keyed on the current allow-list so
 * a CMS change is never masked — means Lanyard is polled at most once per window
 * regardless of how many visitors are watching.
 */

import {
  isHiddenGame,
  isLivePresenceCategory,
  normalizePresence,
  type LanyardData,
  type PlaytimeDayResponse,
  type PresenceView,
} from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";

const LANYARD_REST = "https://api.lanyard.rest/v1/users";
const CACHE_MS = 15_000;

const OFFLINE: PresenceView = { status: "offline", cards: [] };

export function registerPresenceRoutes(app: FastifyInstance, env: ServerEnv, store: Store): void {
  let cache: { at: number; key: string; view: PresenceView } | null = null;

  app.get("/api/presence", async () => {
    // No cast: readPresence() runs sanitizePresenceShow, so `show` is already
    // PresenceCategory[]. The old `as` asserted something that was true anyway —
    // which reads like a checkpoint and is nothing of the kind.
    const show = store.content.getPresence().show;
    const enabled = Boolean(env.discordUserId) && show.some(isLivePresenceCategory);
    if (!enabled || !env.discordUserId) return OFFLINE;

    const key = show.join(",");
    if (cache && cache.key === key && Date.now() - cache.at < CACHE_MS) return cache.view;

    try {
      const res = await fetch(`${LANYARD_REST}/${encodeURIComponent(env.discordUserId)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return cache?.view ?? OFFLINE;
      const json = (await res.json()) as { success?: boolean; data?: LanyardData };
      if (!json.success || !json.data) return cache?.view ?? OFFLINE;

      // Filter server-side: only the allow-listed categories ever leave here.
      const view = normalizePresence(json.data, show);
      cache = { at: Date.now(), key, view };
      return view;
    } catch {
      // Network hiccup — serve the last good filtered snapshot, or offline.
      return cache?.view ?? OFFLINE;
    }
  });

  /**
   * What was played on one day — the drill-in behind a clicked ledger column.
   *
   * Fetched on demand rather than shipped with the module, because the strip is
   * ~365 days and nobody wants 365 breakdowns they didn't ask for. Games only:
   * the played chart is games, and exposing music/watching here would leak
   * categories the module doesn't show. `day` is validated to `YYYY-MM-DD` so it
   * can't be anything but a date going into the query.
   */
  app.get<{ Querystring: { day?: string }; Reply: PlaytimeDayResponse | { error: string } }>(
    "/api/playtime/day",
    async (req, reply) => {
    const day = req.query.day ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
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
