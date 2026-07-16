import type { NavView } from "@lg/core";

/**
 * Areas are routes, not hash tabs.
 *
 * The first area is the site root — `/` rather than `/home` — so there's one
 * canonical URL for the landing page instead of two that render the same thing.
 * Everything else is `/{id}`.
 */
export function areaHref(nav: NavView[], id: string): string {
  return id === nav[0]?.id ? "/" : `/${id}`;
}

/** The area a route segment names, or undefined — which the page turns into a
 *  404. Drafts are already absent from `nav` (the resolver strips them), so an
 *  unpublished area 404s here for free rather than needing its own guard. */
export function areaById(nav: NavView[], id: string | undefined): NavView | undefined {
  return id ? nav.find((a) => a.id === id) : nav[0];
}

/** Resolve an in-page target (a module id like `contact`, or an area id) to the
 *  URL that shows it. Powers links that used to be tab-switch handlers. */
export function targetHref(nav: NavView[], target: string): string {
  const holder = nav.find((a) => (a.modules ?? []).includes(target));
  if (holder) return `${areaHref(nav, holder.id)}#${target}`;
  const area = nav.find((a) => a.id === target);
  return area ? areaHref(nav, area.id) : `#${target}`;
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
