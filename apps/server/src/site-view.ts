/**
 * Resolving the site, in one place.
 *
 * `/api/site` resolves what's saved. The CMS's editor canvas resolves what you've
 * *dragged but not saved*, which is the same thing with one input swapped. Written
 * twice, the copies drift in the direction that makes the feature pointless: a
 * preview resolved a little differently from the site is a preview of a site that
 * doesn't exist, and you'd only find out after saving.
 *
 * `nav` is the seam because it's the only pending state: every other CMS edit
 * saves on blur, so the store already has it. Layout is the one screen with an
 * explicit Save, and therefore the one thing the preview has to be told.
 */

import {
  differenceLedger,
  PLAYTIME_WINDOW_DAYS,
  resolveSiteView,
  SOURCE_TTL,
  type LedgerDay,
  type Locale,
  type NavNode,
  type PlaytimeHeatCell,
  type SiteView,
  type SteamData,
} from "@lg/core";
import type { Store } from "@lg/db";
import type { ServerEnv } from "./env.js";
import { buildAssetLookup } from "./assets-lookup.js";

/**
 * The historical playtime module's data (features 02 + 03).
 *
 * Two independent reads, joined only in the view:
 *
 * - **The ledger** differences the lifetime counters archived in every Steam
 *   snapshot. `source.history` is the reader that was written for exactly this
 *   ("the raw material for long-range trends") and had only a test for a caller;
 *   `differenceLedger` turns the raw run into exact per-day minutes. History comes
 *   back newest-first, so it's reversed — the differ needs chronological order to
 *   read the counters as rising.
 * - **The heatmap** buckets observed sessions by weekday and hour. All-time, not a
 *   window: "when do I play" wants every session, and the table keeps them all.
 */
function buildPlayHistory(store: Store): {
  ledger: LedgerDay[];
  heat: PlaytimeHeatCell[];
  since?: string;
} {
  const snaps = store.source
    .history<SteamData>("steam", PLAY_HISTORY_SNAPSHOTS)
    .reverse()
    .map((row) => ({
      syncedAt: row.syncedAt,
      games: row.data.recent.map((g) => ({
        name: g.name,
        appId: g.appId,
        minutesForever: g.minutesForever,
      })),
    }));

  const ledger = differenceLedger(snaps);
  const heat = store.sessions.heatmap("game", EPOCH_ISO);
  return { ledger, heat, ...(ledger[0] ? { since: ledger[0].day } : {}) };
}

/** How many Steam snapshots to difference. At a 15-min sync that's ~1 year; the
 *  ledger is a long-range view and older snapshots may be pruned anyway. */
const PLAY_HISTORY_SNAPSHOTS = 35_000;

/** "All time" for the heatmap. Before any possible session. */
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

export async function buildSiteView(
  store: Store,
  env: ServerEnv,
  locale: Locale,
  /** Pending nav, for the editor canvas. Omit for the site's own saved nav. */
  nav?: NavNode[],
): Promise<SiteView> {
  return resolveSiteView({
    content: store.content.getContent(),
    source: store.source.getAllCurrent(),
    nav: nav ?? store.ia.getNav(),
    modules: store.ia.getModules(),
    locale,
    syncedAt: store.source.latestSyncedAt(),
    freshness: {
      syncedAt: store.source.syncedAtBySource(),
      ttl: SOURCE_TTL,
    },
    guestbook: store.guestbook.listApproved(),
    // Observed playtime over the same window Steam reports, so the two halves of
    // the chart are the same question. Steam's `minutes2Weeks` is a fortnight;
    // asking the store for a different span would put two spans on one axis.
    playtime: store.sessions.playtime("game", isoDaysAgo(PLAYTIME_WINDOW_DAYS)),
    playHistory: buildPlayHistory(store),
    presence: {
      ...(env.discordUserId ? { discordId: env.discordUserId } : {}),
    },
    assets: await buildAssetLookup(store, env.mediaDir),
  });
}
