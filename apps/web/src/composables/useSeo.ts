import { useHead, useRuntimeConfig } from "#imports";
import { buildSeoTags, personLd, websiteLd, type Locale, type SiteView } from "@lg/core";

/**
 * Turn a page's identity into the head tags a search engine and a link-unfurler
 * need: canonical, `hreflang` alternates, Open Graph, Twitter card, and Person +
 * WebSite JSON-LD.
 *
 * The tag-building is `@lg/core`'s `buildSeoTags` (pure, unit-tested); this is the
 * thin Nuxt-side wrapper that reads the origin from runtime config, the path from
 * the route, and pushes the result through `useHead`. Kept off the components so a
 * page adds SEO in one call and nothing hand-writes a `<meta>`.
 *
 * The origin comes from `runtimeConfig.public.siteUrl`, the same canonical origin
 * `SmartLink` uses — so canonical URLs, `hreflang` hrefs and `og:url` all agree
 * with how the site decides internal-vs-external, and there's one place to change
 * the domain.
 */
export function useSeo(opts: {
  /**
   * The resolved site, when the page has one.
   *
   * Dashboard areas do; the blog, the docs and the privacy page are standalone
   * documents that never load it. Present, it supplies the Person/WebSite graphs
   * and the Twitter handle — absent, the page still gets canonical, Open Graph
   * and its own JSON-LD, just without the site-identity graphs.
   */
  site?: SiteView;
  locale: Locale;
  path: string;
  title: string;
  description: string;
  ogType?: "website" | "article" | "profile";
  /** See `localized` in core's `SeoInput` — areas only. */
  localized?: boolean;
  /** Page-specific graphs, e.g. a `BlogPosting` for a post. */
  jsonLd?: Record<string, unknown>[];
}) {
  const config = useRuntimeConfig();
  const origin = (config.public.siteUrl as string).replace(/\/$/, "");
    const identity = opts.site?.meta;

  const tags = buildSeoTags({
    origin,
    path: opts.path,
    locale: opts.locale,
    title: opts.title,
    description: opts.description,
    ogType: opts.ogType,
    // A dedicated share card served from the build's own assets — self-hosted and
    // versioned with the site, same rule as the fonts.
    image: "/og-image.png",
    localized: opts.localized,
    twitterHandle: identity?.handle,
  });

  // Person + WebSite describe the site as a whole, so they belong on the pages
  // that *are* the site. A blog post carries its own BlogPosting graph instead —
  // repeating the site graphs on every document would just be noise.
  const graphs: Record<string, unknown>[] = [];
  if (opts.site && identity) {
    const id = {
      name: identity.name,
      handle: identity.handle,
      role: identity.role,
      origin,
      sameAs: profileLinks(opts.site),
    };
    graphs.push(personLd(id), websiteLd(id));
  }
  graphs.push(...(opts.jsonLd ?? []));

  useHead(() => ({
    // The page's own title and description, which is the whole point — Open Graph
    // is what a chat client unfurls, but `<title>` and `<meta name="description">`
    // are what a search result is built from. `nuxt.config` sets a site-wide
    // default for both; without overriding them here, every page inherits the
    // homepage's, and the per-page titles quietly disappear.
    title: opts.title,
    link: [
      { rel: "canonical", href: tags.canonical },
      ...tags.alternates.map((a) => ({ rel: "alternate", hreflang: a.hreflang, href: a.href })),
    ],
    meta: [
      { name: "description", content: opts.description, key: "description" },
      ...tags.meta.map((m) => ({ ...m, key: m.property ?? m.name })),
    ],
    // One graph per script block is the shape Google's parser prefers over an
    // @graph array; both validate, this reads cleaner in view-source.
    script: graphs.map((graph, i) => ({
      type: "application/ld+json",
      innerHTML: JSON.stringify(graph),
      key: `ld-${i}`,
    })),
  }));

  return { canonical: tags.canonical };
}

/**
 * Absolute external profile URLs across the site's modules, for `Person.sameAs`.
 *
 * The links a person's accounts live in are inside a `contact` (or hero) module,
 * not at the top of `SiteView`, so this walks the resolved modules for external
 * `http(s)` links and dedupes them. Pure and defensive: no module, no links, or
 * an all-internal nav each yield `[]`, which `personLd` handles by omitting the
 * field.
 */
function profileLinks(site: SiteView): string[] {
  const out = new Set<string>();
  for (const module of Object.values(site.modules)) {
    const data = module.data as { links?: { href: string }[] };
    for (const link of data.links ?? []) {
      if (/^https?:\/\//.test(link.href)) out.add(link.href);
    }
  }
  return [...out];
}
