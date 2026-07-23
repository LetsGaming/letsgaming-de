/**
 * Navigation as a recursive tree (PROJECT.md §5, §6).
 *
 * The launch tree is deliberately flat — one level, four areas — but the schema
 * is a tree from day one so adding a sub-area later is *adding a node*, not
 * rewriting the model, the renderer, and the CMS. This is the one decision the
 * spec flags as expensive to retrofit, so it lives here as the ground truth.
 *
 * A node is either:
 *   - a LEAF   — holds `modules` (module ids rendered in order), or
 *   - a BRANCH — holds `children` (>= 2 child nodes, its own secondary nav).
 * The two are mutually exclusive. `nav-lint.ts` enforces that (and depth, and
 * breadth) at build time — see §5 "Enforcement".
 */

import type { Localized } from "./i18n.js";

export interface NavNode {
  /** Stable, URL-safe identifier. Also the anchor/route segment. */
  id: string;
  /** Human label, localized. Editable via the CMS (nav labels are CMS-owned). */
  label: Localized;
  /**
   * The area's own meta description, localized. CMS-owned, like the label.
   *
   * Optional because it's the one piece of page metadata nothing can derive: a
   * label is a nav affordance ("Life"), not a sentence a search result can use.
   * Without it every area published the same site-wide description, which search
   * engines treat as four duplicate pages and usually discard in favour of a
   * snippet they synthesize themselves.
   *
   * Left unset, `areaMeta` falls back to the site description — a shared but
   * accurate sentence — so an area is never worse off for not having one.
   */
  description?: Localized;
  /** Optional icon key resolved by the frontend's icon set. */
  icon?: string;
  /** Branch: child nodes with their own secondary nav. Mutually exclusive with `modules`. */
  children?: NavNode[];
  /** Leaf: module ids rendered in order. Mutually exclusive with `children`. */
  modules?: string[];
  /**
   * Draft: the node exists in the tree but isn't published. CMS-owned.
   * A hidden node still counts for depth and breadth — a node that would break
   * the tree the moment you publish it is rot you want at build time, not at
   * toggle time — but it's exempt from the thin-leaf rule, because a draft is
   * empty until it isn't. `canPublish()` in nav-lint re-checks that exemption
   * before the CMS is allowed to flip it. Hidden means *not rendered and not
   * routable*, not "rendered but unlinked".
   */
  hidden?: boolean;
}

export function isBranch(node: NavNode): node is NavNode & { children: NavNode[] } {
  return Array.isArray(node.children) && node.children.length > 0;
}

export function isLeaf(node: NavNode): node is NavNode & { modules: string[] } {
  return !isBranch(node);
}

/** Depth-first walk over the whole forest. `depth` is 1-based for the top row. */
export function walkNav(
  nodes: NavNode[],
  visit: (node: NavNode, depth: number, ancestors: NavNode[]) => void,
): void {
  const recur = (list: NavNode[], depth: number, ancestors: NavNode[]) => {
    for (const node of list) {
      visit(node, depth, ancestors);
      if (isBranch(node)) recur(node.children, depth + 1, [...ancestors, node]);
    }
  };
  recur(nodes, 1, []);
}

/** Find a node by id anywhere in the tree. */
export function findNode(nodes: NavNode[], id: string): NavNode | undefined {
  let found: NavNode | undefined;
  walkNav(nodes, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

/** Collect every module id referenced by any leaf, in document order. */
export function collectModuleIds(nodes: NavNode[]): string[] {
  const ids: string[] = [];
  walkNav(nodes, (node) => {
    if (isLeaf(node) && node.modules) ids.push(...node.modules);
  });
  return ids;
}

/** Max depth of the tree (1 for a flat launch nav). */
export function navDepth(nodes: NavNode[]): number {
  let max = 0;
  walkNav(nodes, (_node, depth) => {
    if (depth > max) max = depth;
  });
  return max;
}

/** The tree as the public site may see it: drafts removed, at every depth.
 *  `hidden` is only a guarantee if something enforces it — a flag nothing reads
 *  is a comment. Resolving against this means a hidden node is neither rendered
 *  nor routable, rather than rendered-but-unlinked. */
export function visibleNav(nodes: NavNode[]): NavNode[] {
  return nodes
    .filter((node) => !node.hidden)
    .map((node) => (node.children ? { ...node, children: visibleNav(node.children) } : node));
}


/**
 * Areas are routes, not hash tabs.
 *
 * The first area is the site root — `/` rather than `/home` — so there's one
 * canonical URL for the landing page instead of two rendering the same thing.
 *
 * Here rather than in the web app because it's a *resolution rule*, and the
 * resolver is what has the nav. While it lived in `apps/web/src/lib/area.ts`, the
 * resolver couldn't turn `#contact` into a URL, so it did the only thing it could
 * with an href it didn't recognise: threw it away.
 */
export function areaHref(nav: { id: string }[], id: string): string {
  return id === nav[0]?.id ? "/" : `/${id}`;
}

/**
 * Resolve an in-page target — a module id like `contact`, or an area id — to the
 * URL that shows it.
 *
 * A module lives in exactly one area, so `#contact` is `/about#contact`: a real
 * URL, which a browser can follow, a person can middle-click, and a crawler can
 * index. The site used to answer this with a click handler that called
 * `window.location.assign`, which is an `<a href>` with the useful parts removed.
 */
export function targetHref(nav: { id: string; modules?: string[] }[], target: string): string {
  const holder = nav.find((a) => (a.modules ?? []).includes(target));
  if (holder) return `${areaHref(nav, holder.id)}#${target}`;
  const area = nav.find((a) => a.id === target);
  return area ? areaHref(nav, area.id) : `#${target}`;
}
