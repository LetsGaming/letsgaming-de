/**
 * The site-wide description.
 *
 * One string, two consumers: `nuxt.config`'s default `<meta name="description">`
 * (which covers pages that set no SEO of their own — errors, the CMS) and
 * `areaMeta`, which hands it to every dashboard area.
 *
 * It lives here rather than inline in the config because the two used to
 * disagree: the config had this hand-written sentence while the areas published
 * `site.meta.role` — the two words "web developer" — as the description of all
 * four pages. Overriding a good default with a worse one is the kind of thing
 * only a diff shows.
 *
 * Areas still share one description, which is the remaining gap: it should come
 * per-area from the CMS, and that needs a `description` field on the area
 * content model. Until then, one accurate sentence beats four useless ones.
 */
export const SITE_DESCRIPTION =
  "Personal homepage of Domenic (@LetsGaming) — full-time web developer in Germany. " +
  "Clean interfaces by day; plant sensors and LED strips by night.";
