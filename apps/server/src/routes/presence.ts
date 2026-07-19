/**
 * Presence relay. One concern: the live Discord presence. The server — not the
 * browser — talks to Lanyard, applies the owner's category allow-list, and
 * returns ONLY the permitted result. The client never receives raw Lanyard data,
 * never learns the Discord id, and never sees a category the owner disabled: the
 * backend is the filtering boundary, exactly like every other source.
 *
 * Playtime and music history used to live here too; they're their own routes now
 * (`registerPlaytimeRoutes`, `registerMusicRoutes`) because they're a different
 * concern — accumulated history, not the live moment.
 *
 * The allow-list is CMS-owned (read from the store per request, so toggles take
 * effect immediately). A short shared cache — keyed on the current allow-list so
 * a CMS change is never masked — means Lanyard is polled at most once per window
 * regardless of how many visitors are watching.
 *
 * When Discord isn't configured (`DISCORD_USER_ID` unset) or the owner has hidden
 * every live category, this returns a plain offline view. That's the whole point
 * of the presence/enablement split: the widget always polls and renders whatever
 * comes back, and the decision of whether Discord is wired up stays here on the
 * server rather than leaking into the client or the SSR resolve.
 */

import {
  normalizePresence,
  type LanyardData,
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
    // No cast: getPresence() runs sanitizePresenceShow, so `show` is already
    // PresenceCategory[]. The old `as` asserted something that was true anyway —
    // which reads like a checkpoint and is nothing of the kind.
    const show = store.content.getPresence().show;
    const enabled = Boolean(env.discordUserId) && show.length > 0;
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
