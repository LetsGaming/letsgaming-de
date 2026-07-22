import { useHead, useRoute, useRuntimeConfig } from "#imports";
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
  site: SiteView;
  locale: Locale;
  path: string;
  title: string;
  description: string;
  ogType?: "website" | "article" | "profile";
}) {
  const config = useRuntimeConfig();
  const origin = (config.public.siteUrl as string).replace(/\/$/, "");
  const route = useRoute();

  const { name, handle, role } = opts.site.meta;

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
    twitterHandle: handle,
  });

  const person = personLd({
    name,
    handle,
    role,
    origin,
    sameAs: profileLinks(opts.site),
  });
  const website = websiteLd({ name, handle, role, origin });

  useHead(() => ({
    link: [
      { rel: "canonical", href: tags.canonical },
      ...tags.alternates.map((a) => ({ rel: "alternate", hreflang: a.hreflang, href: a.href })),
    ],
    meta: tags.meta.map((m) => ({ ...m, key: m.property ?? m.name })),
    script: [
      // One graph node per script block is the shape Google's parser prefers over
      // an @graph array; both validate, this reads cleaner in view-source.
      { type: "application/ld+json", innerHTML: JSON.stringify(person) },
      { type: "application/ld+json", innerHTML: JSON.stringify(website) },
    ],
    // Never let a JSON-LD block get HTML-escaped — an escaped `"` breaks the
    // parser silently. Nuxt escapes innerHTML by default; opt these two out.
    __dangerouslyDisableSanitizersByTagID: {
      "ld-person": ["innerHTML"],
      "ld-website": ["innerHTML"],
    },
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
