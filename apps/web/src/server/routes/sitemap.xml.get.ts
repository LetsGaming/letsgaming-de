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
 * Areas carry `xhtml:link` alternates for both locales — the sitemap half of the
 * `hreflang` story, matching what those pages emit in `<head>`. Blog posts don't:
 * a post is written in one language and `?lang` doesn't translate it, so the two
 * signals stay consistent about which pages are really bilingual.
 *
 * Posts are listed too, and they're the only entries with a meaningful `lastmod`
 * — a real publication date, rather than the sync timestamp the areas share.
 */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig();
  const origin = (config.public.siteUrl as string).replace(/\/$/, "");

  // The public nav is locale-independent in shape (labels differ, ids don't), so
  // one load names every area; the alternates are built per-locale below.
  const site = await loadSite(DEFAULT_LOCALE);
  const paths = site.nav.map((area) => areaHref(site.nav, area.id));

  // Posts come from whichever module resolved them — the same list the blog index
  // renders, so drafts are already absent (the resolver drops them) and a post
  // can't reach the sitemap before it's published.
  const posts = Object.values(site.modules).flatMap((module) =>
    module.kind === "posts" ? module.data.posts : [],
  );

  const url = (path: string, locale: Locale): string => {
    const base = path === "/" ? origin : `${origin}${path}`;
    return locale === DEFAULT_LOCALE ? base : `${base}?lang=${locale}`;
  };

  const lastmod = site.syncedAt ? new Date(site.syncedAt).toISOString() : undefined;

  const entry = (loc: string, mod: string | undefined, alternates: string): string =>
    ["  <url>", `    <loc>${loc}</loc>`, mod ? `    <lastmod>${mod}</lastmod>` : "", alternates, "  </url>"]
      .filter(Boolean)
      .join("\n");

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
      return entry(url(path, DEFAULT_LOCALE), lastmod, alternates);
    }),
    ...posts.map((post) => entry(`${origin}/md/${post.slug}`, post.at, "")),
    "</urlset>",
  ].join("\n");

  setHeader(event, "content-type", "application/xml; charset=utf-8");
  // The store changes only on a sync or a CMS edit; an hour of edge-cache is fine.
  setHeader(event, "cache-control", "public, max-age=3600");
  return body;
});
