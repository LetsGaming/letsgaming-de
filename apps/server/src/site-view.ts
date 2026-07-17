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

import { resolveSiteView, SOURCE_TTL, type Locale, type NavNode, type SiteView } from "@lg/core";
import type { Store } from "@lg/db";
import type { ServerEnv } from "./env.js";
import { buildAssetLookup } from "./assets-lookup.js";

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
    presence: {
      ...(env.discordUserId ? { discordId: env.discordUserId } : {}),
    },
    assets: await buildAssetLookup(store, env.mediaDir),
  });
}
