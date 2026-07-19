import {
  ASSET_WIDTHS,
  MUSIC_TOP_LIMIT,
  defaultMusicSettings,
  PLAYTIME_WINDOW_DAYS,
  resolveSiteView,
  SOURCE_TTL,
  type Locale,
  type NavNode,
  type ResolvableAsset,
  type SiteView,
} from "@lg/core";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Store } from "./index.js";

/**
 * Building the SiteView, in one place both processes share.
 *
 * This used to live in `apps/server`, and the web app reached it over HTTP —
 * `fetch(${API_URL}/api/site)` on every SSR render, a network round-trip between
 * two processes on the same box reading the same SQLite file. It's here now so the
 * web app can build the view by reading the store directly (see
 * `openStoreReadonly`), with the HTTP fetch kept only as a fallback for when web
 * can't open the file.
 *
 * It takes plain params rather than a server env object, because it's no longer a
 * server thing — it's "read this store, resolve this view", which is exactly what
 * the data layer is for.
 */

/** Options the view builder needs beyond the store itself. */
export interface BuildSiteViewOptions {
  locale: Locale;
  /** Root media directory; assets live under `<mediaDir>/assets`. */
  mediaDir: string;
  /** Pending nav, for the CMS editor canvas. Omit for the site's saved nav. */
  nav?: NavNode[];
}

export async function buildSiteView(store: Store, opts: BuildSiteViewOptions): Promise<SiteView> {
  const content = store.content.getContent();
  return resolveSiteView({
    content,
    source: store.source.getAllCurrent(),
    nav: opts.nav ?? store.ia.getNav(),
    modules: store.ia.getModules(),
    locale: opts.locale,
    syncedAt: store.source.latestSyncedAt(),
    freshness: {
      syncedAt: store.source.syncedAtBySource(),
      ttl: SOURCE_TTL,
    },
    guestbook: store.guestbook.listApproved(),
    // The recently-played list over the fortnight — the same window the strip
    // shows, so the list and the timeline answer the same span.
    playtime: store.sessions.playtime("game", isoDaysAgo(PLAYTIME_WINDOW_DAYS)),
    gameMeta: store.gameMeta.getAll(),
    playHistory: buildPlayHistory(store),
    // The list cap is the CMS-owned maxCount, applied here as the query LIMIT so
    // the resolved view (and the frontend) never sees more than the top N.
    musicHistory: buildMusicHistory(store, content.music?.maxCount ?? defaultMusicSettings().maxCount),
    assets: await buildAssetLookup(store, opts.mediaDir),
  });
}

/**
 * The historical playtime module's data (feature 02).
 *
 * The ledger is per-day observed minutes, oldest first — `dailyTotals` over all
 * time (the strip windows it to a fortnight). It used to difference Steam's
 * lifetime counters, which were exact but Steam-only; observed minutes are a floor
 * but cover every game Discord saw.
 */
function buildPlayHistory(store: Store): {
  ledger: { day: string; minutes: number }[];
  since?: string;
} {
  const ledger = store.sessions
    .dailyTotals("game", EPOCH_ISO)
    .map((d) => ({ day: d.day, minutes: d.minutes }));
  return { ledger, ...(ledger[0] ? { since: ledger[0].day } : {}) };
}

/**
 * The music module's data (top songs/artists/albums + a per-day listening strip).
 *
 * The same 14-day window the playtime chart uses, so "listening" and "playing"
 * cover the same fortnight. Five reads over `music_plays`, joined
 * only in the view; the per-day drill-in isn't here — it's fetched on click from
 * `/api/music/day`, so the module ships three short lists and one strip, not two
 * weeks of track breakdowns.
 *
 * `trackCount`/`artistCount` are the headline stats the module makes clickable, so
 * they're the *distinct* counts over the window, not the sum of plays — and they're
 * uncapped on purpose: `listLimit` (the CMS maxCount) trims only the top-N lists,
 * never the counts, so the headline stays true even when the list is a top N.
 */
function buildMusicHistory(store: Store, listLimit: number): {
  topSongs: ReturnType<Store["music"]["topSongs"]>;
  topArtists: ReturnType<Store["music"]["topArtists"]>;
  topAlbums: ReturnType<Store["music"]["topAlbums"]>;
  ledger: { day: string; minutes: number }[];
  trackCount: number;
  artistCount: number;
  since?: string;
} {
  const since = isoDaysAgo(PLAYTIME_WINDOW_DAYS);
  const ledger = store.music.dailyTotals(since);
  return {
    topSongs: store.music.topSongs(since, listLimit),
    topArtists: store.music.topArtists(since, listLimit),
    topAlbums: store.music.topAlbums(since, MUSIC_TOP_LIMIT),
    ledger,
    trackCount: store.music.distinctTracks(since),
    artistCount: store.music.distinctArtists(since),
    ...(ledger[0] ? { since: ledger[0].day } : {}),
  };
}

/**
 * Build the `Map<id, ResolvableAsset>` the resolver needs to expand `asset:<id>`
 * references. Metadata comes from the store; SVG/markdown markup is read from disk
 * so the resolver can inline it, and raster images carry a width menu capped to
 * the intrinsic size.
 */
export async function buildAssetLookup(
  store: Store,
  mediaDir: string,
): Promise<Map<string, ResolvableAsset>> {
  const assetsDir = join(resolve(mediaDir), "assets");
  const map = new Map<string, ResolvableAsset>();
  for (const a of store.assets.list()) {
    const r: ResolvableAsset = {
      id: a.id,
      kind: a.kind,
      ...(a.slug ? { slug: a.slug } : {}),
      ...(a.alt ? { alt: a.alt } : {}),
      ...(a.title ? { title: a.title } : {}),
      ...(a.caption ? { caption: a.caption } : {}),
      filename: a.filename,
      ...(a.width ? { width: a.width } : {}),
      ...(a.height ? { height: a.height } : {}),
    };
    if (a.kind === "image" || a.kind === "gif") {
      r.variantWidths = ASSET_WIDTHS.filter((w) => !a.width || w <= a.width);
    } else if (a.kind === "markdown") {
      // Same shape as the SVG branch: the resolver needs the contents, not the
      // path, because frontmatter is what makes a post a post.
      r.markdown = await readFile(join(assetsDir, `${a.hash}.${a.ext}`), "utf8").catch(() => "");
    } else if (a.kind === "svg") {
      r.svg = await readFile(join(assetsDir, `${a.hash}.${a.ext}`), "utf8").catch(() => "");
    }
    map.set(a.id, r);
  }
  return map;
}

/** "All time" for the heatmap. Before any possible session. */
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
