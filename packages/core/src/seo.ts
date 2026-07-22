/**
 * SEO metadata, built as data.
 *
 * The head tags a page needs — canonical, `hreflang` alternates, Open Graph,
 * Twitter card, JSON-LD — are almost entirely a function of a few facts: the
 * origin, the path, the locale, and the page's title/description. That's a pure
 * transform, so it lives here in `@lg/core` (no Vue, no Nuxt), where it can be
 * unit-tested against exact expected output. `useSeo()` on the web side is a thin
 * wrapper that hands these to `useHead`/`useSeoMeta`.
 *
 * Two things make this more than string concatenation, and both are the reason to
 * centralize it rather than hand-roll tags per page:
 *
 * - **Canonical is locale- and query-stripped.** `?lang=de` and `?ref=twitter`
 *   are the same page as the bare path; without one declared canonical, a crawler
 *   sees each query permutation as a duplicate. The canonical is always the clean
 *   path on the primary origin.
 * - **`hreflang` is the whole point of a bilingual site.** The site renders in
 *   `en` or `de` from one URL via `?lang`, but nothing tells a search engine the
 *   other version exists unless every page advertises all of them plus
 *   `x-default`. That list is derived from `LOCALES`, so adding a locale to the
 *   catalog adds it here for free.
 */

import { DEFAULT_LOCALE, LOCALES, type Locale } from "./i18n.js";

/** A `<link rel="alternate" hreflang>` entry. */
export interface AlternateLink {
  hreflang: string;
  href: string;
}

/** One `<meta>` as name/content or property/content. */
export interface MetaTag {
  name?: string;
  property?: string;
  content: string;
}

export interface SeoInput {
  /** Canonical origin, no trailing slash, e.g. `https://letsgaming.de`. */
  origin: string;
  /** The route path, leading slash, no query, e.g. `/` or `/life`. */
  path: string;
  /** The locale this page was rendered in. */
  locale: Locale;
  title: string;
  description: string;
  /** `website` for areas, `article` for a blog post. */
  ogType?: "website" | "article" | "profile";
  /**
   * Absolute-or-rooted image URL for OG/Twitter. A rooted path (`/og-image.png`)
   * is made absolute against `origin`, because the crawlers that read these tags
   * don't resolve relative URLs the way a browser does.
   */
  image?: string;
  /** `@handle` for the Twitter card's `site`/`creator`. */
  twitterHandle?: string;
}

export interface SeoTags {
  /** The one canonical URL for this page (clean path, primary origin). */
  canonical: string;
  /** `hreflang` alternates for every locale, plus `x-default`. */
  alternates: AlternateLink[];
  /** OG + Twitter `<meta>` tags. */
  meta: MetaTag[];
}

/** Join an origin and a path into one clean URL — exactly one slash between,
 *  and the root path contributes no trailing slash (`https://x` not `https://x/`). */
function url(origin: string, path: string): string {
  const base = origin.replace(/\/$/, "");
  if (path === "/" || path === "") return base;
  return `${base}/${path.replace(/^\//, "")}`;
}

/**
 * The canonical URL a locale is served at.
 *
 * The default locale is the bare path (it's what Accept-Language and the root
 * both resolve to); a non-default locale carries `?lang=xx`, which is the real,
 * shareable URL that renders that translation. So the `de` alternate genuinely
 * points at the German page rather than at a path that would 404 or fall back.
 */
function localeUrl(origin: string, path: string, locale: Locale): string {
  const base = url(origin, path);
  return locale === DEFAULT_LOCALE ? base : `${base}?lang=${locale}`;
}

/** Make a rooted image path absolute; leave an already-absolute URL alone. */
function absImage(origin: string, image: string): string {
  return /^https?:\/\//.test(image) ? image : url(origin, image);
}

/**
 * Build the canonical/hreflang/OG/Twitter tag set for a page.
 *
 * JSON-LD is separate (`personLd`/`websiteLd` below) because it's a script block,
 * not `<meta>`, and not every page wants the same graph.
 */
export function buildSeoTags(input: SeoInput): SeoTags {
  const canonical = url(input.origin, input.path);
  const ogType = input.ogType ?? "website";

  const alternates: AlternateLink[] = LOCALES.map((locale) => ({
    hreflang: locale,
    href: localeUrl(input.origin, input.path, locale),
  }));
  // x-default points at the locale-negotiated URL (the bare path) — the page that
  // picks a language from the visitor's Accept-Language rather than forcing one.
  alternates.push({ hreflang: "x-default", href: canonical });

  const meta: MetaTag[] = [
    { property: "og:type", content: ogType },
    { property: "og:title", content: input.title },
    { property: "og:description", content: input.description },
    { property: "og:url", content: canonical },
    // og:locale wants the underscored form (`en_US` style); the site only tracks
    // language, so the region is omitted rather than invented.
    { property: "og:locale", content: input.locale },
    { name: "twitter:card", content: input.image ? "summary_large_image" : "summary" },
    { name: "twitter:title", content: input.title },
    { name: "twitter:description", content: input.description },
  ];

  if (input.image) {
    const img = absImage(input.origin, input.image);
    meta.push({ property: "og:image", content: img }, { name: "twitter:image", content: img });
  }
  if (input.twitterHandle) {
    const handle = input.twitterHandle.startsWith("@") ? input.twitterHandle : `@${input.twitterHandle}`;
    meta.push({ name: "twitter:site", content: handle }, { name: "twitter:creator", content: handle });
  }

  return { canonical, alternates, meta };
}

/** Minimal fields the `Person` and `WebSite` graphs need from site content. */
export interface SiteIdentity {
  name: string;
  handle: string;
  role: string;
  origin: string;
  /** Absolute portrait URL, if the site has one. */
  image?: string;
  /** Profile URLs (GitHub, etc.) for `Person.sameAs`. */
  sameAs?: string[];
}

/**
 * `schema.org/Person` as a JSON-LD object — the graph that lets a search engine
 * render a person card. Returned as an object, not a string; the caller
 * `JSON.stringify`s it into a `<script type="application/ld+json">`.
 *
 * `sameAs` is where the profile links go, and it's the field that actually links
 * a name to its accounts in a knowledge panel. Empty-safe: a person with no
 * public profiles still gets a valid `Person`, just without the array.
 */
export function personLd(id: SiteIdentity): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: id.name,
    alternateName: id.handle,
    jobTitle: id.role,
    url: id.origin,
    ...(id.image ? { image: id.image } : {}),
    ...(id.sameAs && id.sameAs.length ? { sameAs: id.sameAs } : {}),
  };
}

/** `schema.org/WebSite` — names the site and its author, and is the standard
 *  home for a future `SearchAction`. */
export function websiteLd(id: SiteIdentity): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: id.name,
    url: id.origin,
    author: { "@type": "Person", name: id.name, alternateName: id.handle },
    inLanguage: LOCALES as readonly string[],
  };
}
