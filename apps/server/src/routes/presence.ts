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

import { normalizePresence, type LanyardData, type PresenceCategory, type PresenceView } from "@lg/core";
import type { Store } from "@lg/db";
import type { FastifyInstance } from "fastify";
import type { ServerEnv } from "../env.js";

const LANYARD_REST = "https://api.lanyard.rest/v1/users";
const CACHE_MS = 15_000;
const LIVE_CATEGORIES: PresenceCategory[] = ["game", "streaming", "music", "watching", "custom"];
const OFFLINE: PresenceView = { status: "offline", cards: [] };

export function registerPresenceRoutes(app: FastifyInstance, env: ServerEnv, store: Store): void {
  let cache: { at: number; key: string; view: PresenceView } | null = null;

  app.get("/api/presence", async () => {
    const show = store.content.getPresence().show as PresenceCategory[];
    const enabled = Boolean(env.discordUserId) && show.some((c) => LIVE_CATEGORIES.includes(c));
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
}
