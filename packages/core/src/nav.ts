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
  /** Optional icon key resolved by the frontend's icon set. */
  icon?: string;
  /** Branch: child nodes with their own secondary nav. Mutually exclusive with `modules`. */
  children?: NavNode[];
  /** Leaf: module ids rendered in order. Mutually exclusive with `children`. */
  modules?: string[];
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
