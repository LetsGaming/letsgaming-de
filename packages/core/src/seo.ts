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
  /**
   * Whether this page genuinely exists in every locale at the same URL.
   *
   * Only the dashboard areas do — they re-render from the store in whatever
   * language `?lang` asks for. The blog, the docs and the privacy page are
   * single-language documents: `?lang=de` on a post serves the same English words
   * it always did. Claiming `hreflang` alternates for those is a Search Console
   * error ("alternate page returns duplicate content"), not a harmless extra — so
   * this defaults to off, and the areas opt in.
   */
  localized?: boolean;
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

  const alternates: AlternateLink[] = [];
  if (input.localized) {
    for (const locale of LOCALES) {
      alternates.push({ hreflang: locale, href: localeUrl(input.origin, input.path, locale) });
    }
    // x-default points at the locale-negotiated URL (the bare path) — the page
    // that picks a language from Accept-Language rather than forcing one.
    alternates.push({ hreflang: "x-default", href: canonical });
  }

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

  // Facebook learns about the other language from og:locale:alternate, not from
  // hreflang — so a localized page has to say it twice, in two vocabularies.
  if (input.localized) {
    for (const locale of LOCALES) {
      if (locale !== input.locale) meta.push({ property: "og:locale:alternate", content: locale });
    }
  }

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

/**
 * `schema.org/BlogPosting` for one post — the graph that makes a result eligible
 * to render with a date and a byline instead of a bare blue link.
 *
 * `BlogPosting` rather than the broader `Article`: it's the more specific type,
 * and specificity is free here since every consumer of this function is a blog
 * post.
 *
 * One caveat worth knowing rather than silently working around: Google ignores a
 * `headline` longer than about 110 characters for rich results. This doesn't
 * truncate — quietly rewriting a title to a different title is worse than an
 * ineligible result — so keep post titles short if rich results matter.
 */
export interface ArticleLdInput {
  headline: string;
  /** Canonical URL of the post. */
  url: string;
  /** ISO 8601 publication timestamp. Omitted when the post has none — a made-up
   *  date is worse structured data than a missing field. */
  datePublished?: string;
  description?: string;
  /** Post tags, as `keywords`. */
  keywords?: string[];
  /** Absolute image URL. */
  image?: string;
  author: { name: string; url?: string };
}

export function articleLd(input: ArticleLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.headline,
    url: input.url,
    // `mainEntityOfPage` is what tells a crawler this graph describes the page
    // it's embedded in, rather than something the page merely mentions.
    mainEntityOfPage: input.url,
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.description ? { description: input.description } : {}),
    ...(input.keywords && input.keywords.length ? { keywords: input.keywords } : {}),
    ...(input.image ? { image: input.image } : {}),
    author: {
      "@type": "Person",
      name: input.author.name,
      ...(input.author.url ? { url: input.author.url } : {}),
    },
  };
}

/** Roughly where a meta description stops being shown. Not a hard limit — search
 *  engines rewrite snippets freely — but past this it's certainly truncated. */
const EXCERPT_MAX = 155;

/**
 * A plain-text lead for a meta description, from rendered HTML or raw Markdown.
 *
 * Both the blog and the docs hold their body as prose, not as a description
 * field, so the description has to be derived. This strips tags and the common
 * Markdown syntax, decodes the handful of entities that survive rendering,
 * collapses whitespace, and cuts at a word boundary.
 *
 * Deliberately conservative: it's better to return a short, clean sentence than
 * a long one with half a code fence in it. A page whose body is entirely code or
 * images yields `""`, and the caller falls back to something static rather than
 * publishing a description made of punctuation.
 */
export function plainExcerpt(source: string, maxLength = EXCERPT_MAX): string {
  const text = source
    // Fenced code blocks are never a good description.
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    // Keep link text, drop the target.
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, " ")
    .replace(/[*_`>]/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    // Removing an inline tag leaves a gap where none was written: "<b>world</b>."
    // collapses to "world ." Close it up, or every description with bold or a
    // link in its first sentence ships with a floating full stop.
    .replace(/\s+([.,;:!?…)\]])/g, "$1")
    .trim();

  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
