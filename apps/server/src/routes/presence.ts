/**
 * Presence relay. The server — not the browser — talks to Lanyard, applies the
 * owner's category allow-list, and returns ONLY the permitted result. The client
 * never receives raw Lanyard data, never learns the Discord id, and never sees a
 * category the owner disabled: the backend is the filtering boundary, exactly
 * like every other source.
 *
 * A short shared cache means Lanyard is polled at most once per window regardless
 * of how many visitors are watching.
 */

import { normalizePresence, type LanyardData, type PresenceCategory, type PresenceView } from "@lg/core";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";

const LANYARD_REST = "https://api.lanyard.rest/v1/users";
const CACHE_MS = 15_000;
const OFFLINE: PresenceView = { status: "offline", cards: [] };

export function registerPresenceRoutes(app: FastifyInstance, env: ServerEnv): void {
  const show = env.presenceShow as PresenceCategory[];
  const liveCategories: PresenceCategory[] = ["game", "streaming", "music", "watching", "custom"];
  const enabled = Boolean(env.discordUserId) && show.some((c) => liveCategories.includes(c));

  let cache: { at: number; view: PresenceView } | null = null;

  app.get("/api/presence", async () => {
    // Not configured, or no live category enabled → nothing to expose.
    if (!enabled || !env.discordUserId) return OFFLINE;

    if (cache && Date.now() - cache.at < CACHE_MS) return cache.view;

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
      cache = { at: Date.now(), view };
      return view;
    } catch {
      // Network hiccup — serve the last good filtered snapshot, or offline.
      return cache?.view ?? OFFLINE;
    }
  });
}
