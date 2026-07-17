import type { NavView } from "@lg/core";

// `areaHref` and `targetHref` moved to @lg/core: they're resolution rules, and the
// resolver is what has the nav. While they lived here, the resolver couldn't turn
// `#contact` into a URL — so it did the only thing it could with an href it didn't
// recognise, and flattened it to `"#"`. Re-exported rather than re-imported at
// nine call sites; this module is still the site's own vocabulary for routes.
export { areaHref, targetHref } from "@lg/core";

/** The area a route segment names, or undefined — which the page turns into a
 *  404. Drafts are already absent from `nav` (the resolver strips them), so an
 *  unpublished area 404s here for free rather than needing its own guard. */
export function areaById(nav: NavView[], id: string | undefined): NavView | undefined {
  return id ? nav.find((a) => a.id === id) : nav[0];
}

/** Per-area <title> and description, so a link pasted into a chat unfurls as the
 *  thing it points at rather than as the homepage. A hash could never do this:
 *  `#life` never reaches the server. */
export function areaMeta(
  area: NavView | undefined,
  name: string,
  fallback: string,
): { title: string; description: string } {
  if (!area) return { title: `${name} — web dev & tinkerer`, description: fallback };
  return { title: `${area.label} — ${name}`, description: fallback };
}
