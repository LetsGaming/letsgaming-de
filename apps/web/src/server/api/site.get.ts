import { pickLocale } from "~/lib/text";
import { loadSite } from "../utils/site";

/**
 * The SSR data source for every dashboard route.
 *
 * A Nitro route rather than a direct call from the page, because `loadSite` opens
 * a read-only SQLite handle and must never be bundled for the browser. During SSR
 * Nuxt calls this handler in-process (no HTTP round-trip), so the "an SSR render is
 * a local read" property the Astro app had is preserved; on a client-side
 * navigation it becomes a real request, which is what we want.
 *
 * Locale resolution stays server-side, exactly as it was: an explicit `?lang` wins,
 * otherwise the visitor's Accept-Language is used. The chosen locale is returned
 * alongside the view so the page can set <html lang> to what was actually rendered.
 */
export default defineEventHandler(async (event) => {
  const { lang } = getQuery(event);
  const locale = pickLocale(
    typeof lang === "string" ? lang : null,
    getHeader(event, "accept-language") ?? null,
  );
  return { locale, site: await loadSite(locale) };
});
