# 0017: SEO metadata is derived, not hand-written per page

Status: **Accepted**

## Context

The site had per-area `<title>` and `og:title`/`og:description` and nothing else:
no canonical, no `hreflang`, no structured data, no `sitemap.xml`, and a committed
`robots.txt` whose only rule was `Disallow: /admin`.

Three gaps mattered.

**The site is bilingual and never said so.** Areas render in English or German
from the same URL via `?lang`. Without `hreflang` alternates a search engine has
no way to learn the second version exists, and without a canonical every query
permutation (`?lang=de`, `?ref=…`) looks like a duplicate page.

**The area routes are CMS-named**, so a static `sitemap.xml` couldn't know them,
and a hand-maintained one would drift the first time an area was renamed.

**The `robots.txt` rule was self-defeating.** That file is world-readable, so
`Disallow: /admin` published the location of the admin surface to anyone who
fetched it — the opposite of the intent.

## Decision

**One derivation, three layers.**

- **`@lg/core/seo.ts`** builds the tags as data: canonical, alternates, Open
  Graph, Twitter card, and the `Person` / `WebSite` / `BlogPosting` JSON-LD
  graphs. Pure, dependency-free, unit-tested against exact output.
- **`useSeo()`** is a thin Nuxt wrapper that reads the origin from
  `runtimeConfig.public.siteUrl` — the same canonical origin `SmartLink` uses to
  tell internal from external — and pushes the result through `useHead`. It owns
  `<title>` and `<meta name="description">` as well as the social tags, because a
  head composable that emits only some head tags leaves the rest inheriting the
  site-wide defaults in `nuxt.config`, silently.
- **`sitemap.xml` and `robots.txt` are Nitro routes**, reading the same
  `loadSite` the pages render from.

Two rules carry most of the weight.

**Canonical is locale- and query-stripped.** Always the clean path on the primary
origin, whichever locale rendered.

**`hreflang` is opt-in, and only areas opt in.** `SeoInput.localized` defaults to
*off*. Areas re-render from the store in whatever language `?lang` asks for, so
they genuinely exist in both. The blog, the docs and the privacy page are
single-language documents — `?lang=de` on a post serves the same English words —
and advertising an alternate that returns identical content is a Search Console
error, not a harmless extra. Defaulting to off means the unsafe case is the one
you have to ask for.

The sitemap is **derived from `site.nav`**, which gives two properties for free:
drafts can't appear (the resolver strips them before this sees them), and
`/admin` can't appear (it isn't a content area). Absence by construction, rather
than by an exclusion rule someone has to remember. Blog posts are listed too, and
are the only entries with a meaningful `lastmod` — a real publication date rather
than the sync timestamp the areas share.

`robots.txt` names `/api/` only. The admin surface stays private by being
unlinked and absent from the sitemap; naming it in a public file would undo that.

## Consequences

- Adding a locale to `LOCALES` adds it to every page's alternates and to the
  sitemap with no further edits.
- A new page type gets SEO by calling `useSeo`; it must decide `localized`
  explicitly, which is the point.
- `/og-image.png` is a committed asset, self-hosted and versioned with the site —
  same rule as the fonts, no third-party CDN. Its spec lives beside it in
  `apps/web/src/public/README-og-image.md`.
- Structured data publishes the owner's name, handle, role and public profile
  links. That is deliberately published information about the site owner; no
  visitor data is involved, so it changes nothing in the privacy posture
  ([0007](./0007-privacy-by-omission.md)).
