/**
 * Whether an href leaves this site — the one thing a link needs to decide its
 * `target`. Internal by default: relative paths (`/docs`, `md/x`), in-page anchors
 * (`#top`), and absolute URLs on our own host all keep you in the tab. Only an
 * absolute http(s) URL on a *different* host is external. Schemes that open an app
 * rather than navigate a page (`mailto:`, `tel:`) count as internal.
 *
 * The site origin is passed in (from `runtimeConfig.public.siteUrl`) rather than
 * read from a global, so this stays a pure, unit-testable function and resolves to
 * the same verdict on the server and after hydration — no mismatch.
 */
export function isExternalHref(
  href: string | undefined | null,
  siteOrigin: string,
): boolean {
  const value = href?.trim();
  // Empty or an in-page anchor: never leaves the page.
  if (!value || value.startsWith("#")) return false;

  let site: URL;
  let url: URL;
  try {
    site = new URL(siteOrigin);
    url = new URL(value, site); // resolves relative hrefs against our own origin
  } catch {
    return false; // unparseable — treat as internal, never wrongly pop a new tab
  }

  // Only web navigations can be "external"; mailto:/tel:/etc. stay in-tab.
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.host !== site.host;
}
