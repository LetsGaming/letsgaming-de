import { loadSite } from "../utils/site";
import { areaHref, LOCALES, DEFAULT_LOCALE, type Locale } from "@lg/core";

/**
 * `sitemap.xml`, built from the same resolved store the pages render from.
 *
 * The area routes are named by the CMS and unknowable to a static generator, so
 * the sitemap can't be a committed file — it's derived from `site.nav`, exactly
 * the list the dashboard renders. That gives two guarantees for free:
 *
 * - **Drafts never appear.** The resolver strips unpublished areas from `nav`
 *   before this sees it (the same reason a draft area 404s), so an unfinished
 *   page can't leak into the sitemap.
 * - **`/admin` never appears.** It isn't a content area and isn't in `nav`; the
 *   admin surface is deliberately undiscoverable, so it's absent here by
 *   construction rather than by an exclusion rule someone has to remember. The
 *   `md`/`docs`/`datenschutz` routes are likewise omitted — only content areas
 *   are listed.
 *
 * Each URL carries `xhtml:link` alternates for both locales, which is the sitemap
 * half of the `hreflang` story: the same signal the pages emit in `<head>`, so a
 * crawler that reads either one learns the site is bilingual.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const origin = (config.public.siteUrl as string).replace(/\/$/, "");

  // The public nav is locale-independent in shape (labels differ, ids don't), so
  // one load names every area; the alternates are built per-locale below.
  const site = await loadSite(DEFAULT_LOCALE);
  const paths = site.nav.map((area) => areaHref(site.nav, area.id));

  const url = (path: string, locale: Locale): string => {
    const base = path === "/" ? origin : `${origin}${path}`;
    return locale === DEFAULT_LOCALE ? base : `${base}?lang=${locale}`;
  };

  const lastmod = site.syncedAt ? new Date(site.syncedAt).toISOString() : undefined;

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...paths.map((path) => {
      const alternates = [...LOCALES, "x-default" as const]
        .map((l) => {
          const href = l === "x-default" ? url(path, DEFAULT_LOCALE) : url(path, l);
          return `    <xhtml:link rel="alternate" hreflang="${l}" href="${href}"/>`;
        })
        .join("\n");
      return [
        "  <url>",
        `    <loc>${url(path, DEFAULT_LOCALE)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
        alternates,
        "  </url>",
      ]
        .filter(Boolean)
        .join("\n");
    }),
    "</urlset>",
  ].join("\n");

  setHeader(event, "content-type", "application/xml; charset=utf-8");
  // The store changes only on a sync or a CMS edit; an hour of edge-cache is fine.
  setHeader(event, "cache-control", "public, max-age=3600");
  return body;
});
