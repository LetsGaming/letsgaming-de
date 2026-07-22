import { buildSiteView, openStoreReadonly, type Store } from "@lg/db";
import { DEFAULT_TIMEZONE, type Locale, type SiteView } from "@lg/core";
import fallback from "~/data/fallback-site.json";

// `TZ` is the owner's timezone — the default zone SSR resolves the activity charts
// in (the aggregation takes an explicit zone; visitors override with `?tz`). Docker
// sets it; this is the dev fallback.
process.env.TZ ??= DEFAULT_TIMEZONE;

/**
 * Load the resolved SiteView for SSR — server-side only, never the browser.
 *
 * Lives under `server/` so Nitro is the only thing that can import it: the
 * read-only SQLite handle and the DB path must never reach a client bundle. This
 * is the same logic the Astro app ran in `lib/site.ts`; it was already
 * framework-agnostic, so it ports as-is.
 *
 * It opens the store **read-only** and builds the view directly (the same
 * `buildSiteView` the API's `/api/site` uses), so an SSR render is a local read,
 * not an HTTP call to a second process reading the same SQLite file.
 *
 * Read-only is the safety boundary: the API is the writer (migrations, seed, sync,
 * CMS edits), and a read-only handle can't race it — there's nothing for two
 * processes to fight over when one physically cannot write. WAL means this
 * connection still sees the writer's committed changes without blocking it.
 *
 * Three fallbacks, in order: the store handle (opened once, reused), then the HTTP
 * API if the file can't be opened (a container where web can't see the volume),
 * then the committed fixture if even that's unreachable. A page always renders.
 */

// The read-only store handle, opened lazily and reused across requests. One handle
// per Nitro process; SQLite read connections are cheap and WAL lets many readers
// coexist with the single writer.
let store: Store | null = null;
let storeTried = false;

function getStore(): Store | null {
  if (storeTried) return store;
  storeTried = true;
  const path = process.env.DB_PATH;
  if (!path) return null;
  try {
    store = openStoreReadonly(path);
  } catch (err) {
    console.warn(`[web] store unavailable (${String(err)}); will try the HTTP API.`);
    store = null;
  }
  return store;
}

// Short server-side cache so per-request SSR doesn't re-resolve on every hit. The
// store only changes on a sync or a CMS edit, so a few seconds of staleness is
// fine — and the resolve itself is cheap now that it's a local read.
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; view: SiteView }>();

export async function loadSite(locale: Locale = "en"): Promise<SiteView> {
  const cached = cache.get(locale);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.view;

  // 1. Direct store read — the common path, no network.
  const s = getStore();
  if (s) {
    try {
      const view = await buildSiteView(s, {
        locale,
        mediaDir: process.env.MEDIA_DIR ?? "",
      });
      cache.set(locale, { at: Date.now(), view });
      return view;
    } catch (err) {
      console.warn(`[web] direct resolve failed (${String(err)}); trying the HTTP API.`);
    }
  }

  // 2. HTTP API — for a deployment where web can't open the store file, and for
  //    `nuxt dev`, which runs with no DB_PATH: without a default here the dev site
  //    would fall straight to the fixture and show none of the store-backed modules
  //    (presence, playtime, music). The default matches the server's dev port;
  //    production sets API_URL explicitly (e.g. the compose internal
  //    `http://server:8787`), so this only bites when nothing else is set.
  const base = process.env.API_URL ?? (import.meta.dev ? "http://localhost:8787" : undefined);
  if (base) {
    try {
      const res = await fetch(`${base}/api/site?locale=${encodeURIComponent(locale)}`);
      if (res.ok) {
        const view = (await res.json()) as SiteView;
        cache.set(locale, { at: Date.now(), view });
        return view;
      }
      console.warn(`[web] read API returned ${res.status}; using fallback fixture.`);
    } catch (err) {
      console.warn(`[web] read API unreachable (${String(err)}); using fallback fixture.`);
    }
  }

  // 3. Committed fixture — a page still renders even with no store and no API.
  return fallback as unknown as SiteView;
}
