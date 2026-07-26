import { buildSiteView, contactFromEnv, openStoreReadonly, type Store } from "@lg/db";
import { contactChannel, DEFAULT_LOCALE, DEFAULT_TIMEZONE, type Locale, type SiteView } from "@lg/core";
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
 * then the committed fixture if even that's unreachable. A page always renders,
 * in the language it was asked for, at every level.
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

/**
 * Overlay the live contact channel onto a fixture.
 *
 * Everything else in the fixture is necessarily frozen — it's committed seed data,
 * and that's the honest thing to serve when nothing is reachable. The contact
 * affordance isn't: whether the relay is configured is a property of *this*
 * process's environment, readable right now, and the fixture's copy records
 * whatever the machine that generated it happened to have. Serving that would show
 * a mailto to a deployment with a working form, or worse, no contact route at all
 * to one that has an address configured.
 *
 * Copied rather than mutated: the fixture is a module-level import, so writing
 * through it would persist across requests and across locales.
 */
function withLiveContact(view: SiteView): SiteView {
  const contact = view.modules.contact;
  if (contact?.kind !== "contact") return view;
  const channel = contactChannel(contactFromEnv());
  return {
    ...view,
    modules: { ...view.modules, contact: { ...contact, data: { ...contact.data, channel } } },
  };
}

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
  //
  // Loud, because reaching here in a served request means the site is showing
  // committed sample data: no synced repos, no observed activity, and content
  // frozen at whatever the seed says. It looks like a working site, which is
  // exactly what makes it dangerous — nothing 500s, the numbers are just quietly
  // absent. Neither DB_PATH nor API_URL is reaching this process.
  //
  // Keyed by locale, because the fixture is a *resolved* view: its strings are
  // already localized, so one fixture can only ever be one language. Serving the
  // English one to a German visitor was the last place the locale silently didn't
  // apply. Generated from the seed by `pnpm --filter=@lg/web gen:fallback` rather
  // than hand-maintained — the hand-written one had drifted to naming an area
  // that was renamed several releases earlier, and nothing catches that, because
  // the only way to see this file is to break the database.
  console.error(
    "[web] SERVING THE FALLBACK FIXTURE — no store (DB_PATH) and no API (API_URL). " +
      "The page will show committed seed data, not live content.",
  );
  const fixtures = fallback as unknown as Record<Locale, SiteView>;
  return withLiveContact(fixtures[locale] ?? fixtures[DEFAULT_LOCALE]);
}
