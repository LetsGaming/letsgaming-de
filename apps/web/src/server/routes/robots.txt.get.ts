/**
 * `robots.txt`, as a route rather than a static file.
 *
 * The old committed `robots.txt` carried `Disallow: /admin` — which is
 * self-defeating: robots.txt is world-readable, so a `Disallow` line is a public
 * index of the paths you'd rather nobody knew about. The admin surface is kept
 * private by being unlinked and absent from the sitemap, and adding it here would
 * undo that by announcing it to anyone who fetches this file. So `/admin` is
 * deliberately not named.
 *
 * `/api/` and `/md/` are disallowed because they're not pages a search result
 * should land on — raw JSON and raw markdown — but there's nothing secret about
 * them, so naming them costs nothing.
 *
 * The `Sitemap:` line is the one thing a static file couldn't get right without
 * hardcoding the domain: it's built from the same canonical origin everything
 * else uses.
 */
export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const origin = (config.public.siteUrl as string).replace(/\/$/, "");

  const body = [
    "User-agent: *",
    "Disallow: /api/",
    "Disallow: /md/",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n");

  setHeader(event, "content-type", "text/plain; charset=utf-8");
  setHeader(event, "cache-control", "public, max-age=86400");
  return body;
});
