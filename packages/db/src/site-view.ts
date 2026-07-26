import {
  ASSET_WIDTHS,
  DEFAULT_ACTIVITY_RANGE,
  MUSIC_TOP_LIMIT,
  defaultMusicSettings,
  defaultPlaytimeSettings,
  defaultWrappedSettings,
  gameMetaKey,
  isHidden,
  wrappedWindow,
  resolveSiteView,
  SOURCE_TTL,
  sanitizeTimeZone,
  type ActivityRange,
  type Locale,
  type NavNode,
  type PlaytimeHeatCell,
  type ResolvableAsset,
  type SiteView,
  type WrappedSettings,
} from "@lg/core";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Store } from "./index.js";
import type { WrappedRankRow } from "./wrapped-repo.js";

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
  /** Zone to bucket the observed-activity charts in. Omit for the owner's
   *  configured zone (a visitor asking for their own local time passes theirs). */
  timeZone?: string;
  /**
   * The window the accumulated-activity modules (Listening, Played) cover.
   *
   * One window for both, on purpose: they sit on facing cards, and two different
   * spans there invite reading them as one. Omit it and each module opens on its
   * own CMS-configured default — which is what SSR does, since nobody has asked
   * for a range yet on a first paint.
   */
  windowDays?: ActivityRange;
  /**
   * What the contact module can offer. Omit to read it from the environment.
   *
   * `relay` is whether the SMTP relay behind `/api/contact` is configured, and
   * `email` the address to publish when it isn't. Both are deployment facts, not
   * content, so they arrive the same way the timezone does: an explicit override
   * for a caller that knows better, otherwise the process environment.
   */
  contact?: { relay: boolean; email?: string };
}

export async function buildSiteView(store: Store, opts: BuildSiteViewOptions): Promise<SiteView> {
  const content = store.content.getContent();
  // The zone the observed-activity charts bucket in: the caller's requested zone (a
  // visitor asking for their own local time), else the owner's — the `TZ` env var,
  // defaulting to Europe/Berlin. A single-user site's owner zone rarely changes, so
  // an env var (edit + redeploy) is the right weight; the aggregation itself takes
  // the zone as a parameter, so per-request overrides still work.
  const timeZone = opts.timeZone ?? sanitizeTimeZone(process.env.TZ);
  // The window each module is built over: what the caller asked for, else the
  // module's own CMS default. Resolved separately per module because their
  // defaults are stored separately — a requested range overrides both at once.
  const playtimeWindow =
    opts.windowDays ?? content.playtime?.defaultRange ?? defaultPlaytimeSettings().defaultRange;
  const musicWindow =
    opts.windowDays ?? content.music?.defaultRange ?? defaultMusicSettings().defaultRange;
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
    playtime: store.sessions.playtime("game", isoDaysAgo(playtimeWindow)),
    gameMeta: store.gameMeta.getAll(),
    playHistory: buildPlayHistory(store, timeZone),
    // Shipped so the resolver can window the all-time ledger it gets, and so each
    // module can tell the frontend which span it is showing.
    playtimeWindowDays: playtimeWindow,
    musicWindowDays: musicWindow,
    contact: opts.contact ?? contactFromEnv(),
    // The list cap is the CMS-owned maxCount, applied here as the query LIMIT so
    // the resolved view (and the frontend) never sees more than the top N.
    musicHistory: buildMusicHistory(
      store,
      content.music?.maxCount ?? defaultMusicSettings().maxCount,
      timeZone,
      musicWindow,
    ),
    wrappedHistory: buildWrappedHistory(store, content),
    assets: await buildAssetLookup(store, opts.mediaDir),
  });
}

/**
 * The historical playtime module's data (features 02 + 03), bucketed in `timeZone`.
 *
 * - **The ledger** is per-day observed minutes, oldest first — `dailyTotals` over
 *   all time (the strip windows it to a fortnight).
 * - **The heatmap** buckets those same sessions by weekday and hour, all-time —
 *   the "when do I play" grid the day strip can't show.
 *
 * Both bucket from the raw UTC rows in `timeZone` (not the process zone), so the
 * same builder serves the owner's zone and a visitor's. The zone is shipped so the
 * frontend knows which one it's showing.
 */
function buildPlayHistory(
  store: Store,
  timeZone: string,
): {
  ledger: { day: string; minutes: number }[];
  heat: PlaytimeHeatCell[];
  timeZone: string;
  since?: string;
} {
  const ledger = store.sessions
    .dailyTotals("game", EPOCH_ISO, timeZone)
    .map((d) => ({ day: d.day, minutes: d.minutes }));
  const heat = store.sessions.heatmap("game", EPOCH_ISO, timeZone);
  return { ledger, heat, timeZone, ...(ledger[0] ? { since: ledger[0].day } : {}) };
}

/**
 * The music module's data (top songs/artists/albums + a per-day listening strip),
 * the strip bucketed in `timeZone`.
 *
 * The same window the playtime chart uses, so "listening" and "playing" cover the
 * same span whichever range is selected. The per-day drill-in isn't here — it's fetched on click
 * from `/api/music/day`. The zone is shipped so the strip's window and "today"
 * agree with the bucketed days.
 *
 * `trackCount`/`artistCount` are the *distinct* counts over the window (uncapped on
 * purpose: `listLimit` trims only the top-N lists, never the counts).
 */
function buildMusicHistory(
  store: Store,
  listLimit: number,
  timeZone: string,
  windowDays: number,
): {
  topSongs: ReturnType<Store["music"]["topSongs"]>;
  topArtists: ReturnType<Store["music"]["topArtists"]>;
  topAlbums: ReturnType<Store["music"]["topAlbums"]>;
  ledger: { day: string; minutes: number }[];
  trackCount: number;
  artistCount: number;
  timeZone: string;
  since?: string;
} {
  const since = isoDaysAgo(windowDays);
  const ledger = store.music.dailyTotals(since, timeZone);
  return {
    topSongs: store.music.topSongs(since, listLimit),
    topArtists: store.music.topArtists(since, listLimit),
    topAlbums: store.music.topAlbums(since, MUSIC_TOP_LIMIT),
    ledger,
    trackCount: store.music.distinctTracks(since),
    artistCount: store.music.distinctArtists(since),
    timeZone,
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

/**
 * The contact capability, from the environment. Exported because the web app's
 * fallback path needs it without a store: the fixture is built at commit time, on
 * a machine whose contact config says nothing about the deployment's.
 *
 * Read here rather than passed by every caller because there are five of them —
 * the read route, the module route, the CMS preview, the web app's SSR, and the
 * fixture generator — and the one that forgot would silently render the wrong
 * affordance. The same reasoning (and the same `??` shape) as the timezone above.
 *
 * The relay condition mirrors `ServerEnv` exactly: SMTP is configured when it has
 * both a host and a destination. Duplicated deliberately — `@lg/db` can't import
 * the server's env module without depending on the server — and it is the sort of
 * duplication that drifts, so `contact-env.test.ts` asserts the two agree.
 *
 * `CONTACT_PUBLIC_EMAIL` falls back to `CONTACT_TO`, which is already the address
 * the contact form delivers to. Note that this *publishes* it in the page HTML,
 * where the form kept it private — set `CONTACT_PUBLIC_EMAIL` to an alias if the
 * relay inbox shouldn't be scrapeable.
 */
export function contactFromEnv(): { relay: boolean; email?: string } {
  // Compose passes an unset `${VAR:-}` through as "", so emptiness is unset.
  const read = (name: string): string | undefined => {
    const value = process.env[name]?.trim();
    return value ? value : undefined;
  };
  const to = read("CONTACT_TO");
  const relay = Boolean(read("SMTP_HOST") && to);
  const email = read("CONTACT_PUBLIC_EMAIL") ?? to;
  return { relay, ...(email ? { email } : {}) };
}

/** "All time" for the heatmap. Before any possible session. */
const EPOCH_ISO = "1970-01-01T00:00:00.000Z";

const isoDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

/**
 * Wrapped's aggregate for the window that's open right now, or `undefined`.
 *
 * The schedule is consulted here as well as in the resolver, and deliberately so:
 * outside a window there is nothing to aggregate, and running four range queries to
 * build a view the resolver will then discard is wasted work on every request.
 * `wrappedWindow` is pure and cheap, so asking twice costs nothing and keeps each
 * side able to answer on its own.
 *
 * Hidden activities are dropped from the games list — the same rule the playtime
 * module follows: totals stay honest (they're shape, not identity), but anything
 * that names a game filters. The list is trimmed to `topCount` only after that, so
 * a hidden game can't eat a slot.
 */
function buildWrappedHistory(
  store: Store,
  content: { wrapped?: WrappedSettings; presence?: { hidden?: string[] } },
):
  | {
      totalMinutesListened: number;
      totalMinutesPlayed: number;
      topSongs: WrappedRankRow[];
      topArtists: WrappedRankRow[];
      topGames: WrappedRankRow[];
        topGenres: WrappedRankRow[];
    }
  | undefined {
  const settings = content.wrapped ?? defaultWrappedSettings();
  const win = wrappedWindow(settings, new Date());
  if (!win) return undefined;

  const { periodStart: from, periodEnd: to } = win;
  const hidden = content.presence?.hidden ?? [];
  const covers = store.gameMeta.getAll();

  // Every qualifying game in the period, hidden ones already dropped. Kept whole
  // rather than trimmed here, because the genre roll-up below has to see the long
  // tail: a genre's total is the sum of everything in it, not just its top few.
  const allGames = store.wrapped.topGames(from, to).filter((g) => !isHidden(g.name, hidden));

  /** A game's cached RAWG metadata, matched the way the playtime chart matches it. */
  const metaFor = (name: string) => covers.get(gameMetaKey(name));

  const games = allGames.slice(0, settings.topCount).map((g) => {
    const meta = metaFor(g.name);
    return {
      ...g,
      ...(meta?.coverUrl ? { artUrl: meta.coverUrl } : {}),
      // The genre doubles as the row's subtitle, so a game row reads like a song
      // row (title over artist) instead of sitting title-only beside it.
      ...(meta?.genre ? { detail: meta.genre } : {}),
    };
  });

  // Time by genre, folded from the same rows. RAWG gives one genre per game, so a
  // game's whole total lands in exactly one bucket and the sums stay honest.
  // Games we never resolved metadata for are simply absent — better a short,
  // truthful list than an "Unknown" bucket that competes with real genres.
  const genreMinutes = new Map<string, { minutes: number; plays: number }>();
  for (const game of allGames) {
    const genre = metaFor(game.name)?.genre;
    if (!genre) continue;
    const acc = genreMinutes.get(genre) ?? { minutes: 0, plays: 0 };
    acc.minutes += game.minutes;
    acc.plays += game.plays;
    genreMinutes.set(genre, acc);
  }
  const topGenres: WrappedRankRow[] = [...genreMinutes.entries()]
    .map(([name, v]) => ({ name, minutes: v.minutes, plays: v.plays }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
    .slice(0, settings.topCount);

  return {
    totalMinutesListened: store.wrapped.minutesListened(from, to),
    totalMinutesPlayed: store.wrapped.minutesPlayed(from, to),
    topSongs: store.wrapped.topSongs(from, to, settings.topCount),
    topArtists: store.wrapped.topArtists(from, to, settings.topCount),
    topGames: games,
    topGenres,
  };
}
