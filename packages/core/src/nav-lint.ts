/**
 * Build-time nav lint (PROJECT.md §5 "Enforcement — build-time lint, not
 * discipline"). These are the rules that *fail the build* so the information
 * architecture can't silently rot as the site grows:
 *
 *   - <= 5 children on any node          (one level stays human-scannable)
 *   - max depth 3                        (depth is the release valve, not sprawl)
 *   - every node is a real leaf or a real branch:
 *       leaf   => >= 1 module   (no thin tabs)
 *       branch => >= 2 children (no single-child branches)
 *   - leaf/branch are mutually exclusive (a node can't hold modules AND children)
 *   - ids are unique across the whole tree
 *   - no orphan / dangling modules       (every module resolves to a node, and
 *                                          every leaf reference resolves to a module)
 *
 * `lintNav` is a pure function — it just reports. The CLI wrapper
 * (`scripts/lint-nav.ts`) is what turns a non-empty report into a non-zero exit.
 */

import { isBranch, isLeaf, walkNav, type NavNode } from "./nav.js";

export interface NavLintOptions {
  maxChildren?: number;
  maxDepth?: number;
  /**
   * Ids of every module known to the registry. When provided the linter also
   * flags dangling references (a leaf points at an unknown module) and orphans
   * (a known module no leaf places). Omit to skip cross-checking.
   */
  knownModuleIds?: readonly string[];
}

export type NavLintCode =
  | "MAX_CHILDREN"
  | "MAX_DEPTH"
  | "THIN_BRANCH"
  | "EMPTY_LEAF"
  | "LEAF_AND_BRANCH"
  | "DUPLICATE_ID"
  | "DANGLING_MODULE"
  | "ORPHAN_MODULE";

export interface NavLintViolation {
  code: NavLintCode;
  /** Node id the problem attaches to (or the module id for ORPHAN_MODULE). */
  at: string;
  message: string;
}

export interface NavLintResult {
  ok: boolean;
  violations: NavLintViolation[];
}

const DEFAULTS = { maxChildren: 5, maxDepth: 3 } as const;

export function lintNav(nodes: NavNode[], options: NavLintOptions = {}): NavLintResult {
  const maxChildren = options.maxChildren ?? DEFAULTS.maxChildren;
  const maxDepth = options.maxDepth ?? DEFAULTS.maxDepth;
  const violations: NavLintViolation[] = [];

  const seenIds = new Set<string>();
  const referencedModules = new Set<string>();

  walkNav(nodes, (node, depth) => {
    // Unique ids across the whole tree.
    if (seenIds.has(node.id)) {
      violations.push({
        code: "DUPLICATE_ID",
        at: node.id,
        message: `Duplicate node id "${node.id}" — ids must be unique across the tree.`,
      });
    }
    seenIds.add(node.id);

    // Depth ceiling.
    if (depth > maxDepth) {
      violations.push({
        code: "MAX_DEPTH",
        at: node.id,
        message: `Node "${node.id}" sits at depth ${depth}; max allowed is ${maxDepth}.`,
      });
    }

    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const hasModules = Array.isArray(node.modules) && node.modules.length > 0;

    // Mutual exclusivity.
    if (hasChildren && hasModules) {
      violations.push({
        code: "LEAF_AND_BRANCH",
        at: node.id,
        message: `Node "${node.id}" declares both children and modules; a node is a leaf OR a branch, never both.`,
      });
    }

    if (isBranch(node)) {
      // Breadth ceiling.
      if (node.children.length > maxChildren) {
        violations.push({
          code: "MAX_CHILDREN",
          at: node.id,
          message: `Branch "${node.id}" has ${node.children.length} children; max ${maxChildren} per level. Split into sub-nodes instead of widening.`,
        });
      }
      // No single-child branches.
      if (node.children.length < 2) {
        violations.push({
          code: "THIN_BRANCH",
          at: node.id,
          message: `Branch "${node.id}" has ${node.children.length} child; a branch needs >= 2. Collapse it back into a module.`,
        });
      }
    } else if (isLeaf(node)) {
      // No thin/empty tabs.
      if (!hasModules) {
        violations.push({
          code: "EMPTY_LEAF",
          at: node.id,
          message: `Leaf "${node.id}" holds no modules; a leaf needs >= 1 real module.`,
        });
      }
      for (const moduleId of node.modules ?? []) referencedModules.add(moduleId);
    }
  });

  // Cross-check against the module registry, when supplied.
  if (options.knownModuleIds) {
    const known = new Set(options.knownModuleIds);
    for (const moduleId of referencedModules) {
      if (!known.has(moduleId)) {
        violations.push({
          code: "DANGLING_MODULE",
          at: moduleId,
          message: `A leaf references module "${moduleId}", which is not registered.`,
        });
      }
    }
    for (const moduleId of known) {
      if (!referencedModules.has(moduleId)) {
        violations.push({
          code: "ORPHAN_MODULE",
          at: moduleId,
          message: `Module "${moduleId}" is registered but no leaf places it — every module must resolve to a node.`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

/** Pretty one-liner per violation, for CLI output. */
export function formatViolation(v: NavLintViolation): string {
  return `  ✗ [${v.code}] ${v.message}`;
}
