# 0006: Recursive nav tree + build-time lint

**Status:** Accepted · 2026 · (OVERVIEW)

## Context
The site must scale without the nav bloating into dozens of tabs, and the rule
must survive a solo maintainer's future self.

## Decision
The nav is a recursive tree (leaf holds modules; branch holds ≥2 children). Grow by
depth, not breadth. A build-time lint (`pnpm lint:nav`) fails on: >5 children,
depth >3, thin/empty nodes, leaf+branch, duplicate ids, orphan/dangling modules.

## Consequences
- The IA can't silently rot: CI blocks a broken tree.
- Adding a feature is placing a module in a node, not adding a tab.
- Splitting an area later is adding a node, not rewriting the model + renderer.

## Amendment — the root was never checked, and drafts

**The bug.** `MAX_CHILDREN` was checked inside `if (isBranch(node))`, against
`node.children`. The top-level nav is a *forest* — it isn't any node's children —
so the root row was never breadth-checked at all. A tenth area would have passed
CI. The rule the whole IA rests on went unenforced at the only level that has
ever had children.

**Drafts.** A node can be `hidden`. It counts for breadth and depth (a node that
breaks the tree on publish is rot you want at build time) and is exempt from the
thin-leaf rule (a draft is empty until it isn't).

**The runtime hole.** The lint runs at build; the toggle runs at runtime. Once
visibility is CMS state, publishing an empty node breaks the IA without CI ever
seeing it. `canPublish(nav, id)` re-lints with that node treated as visible and
returns only its violations; the CMS calls it before flipping the flag and
refuses with the reason. One implementation, both surfaces.

**A second lint, same shape.** `lint:tokens` fails the build on any `var(--x)`
that resolves to nothing. It exists because CSS never errors: a renamed token
leaves twelve dead references across six files while typecheck, tests and build
all stay green and the page quietly renders wrong. Pure check, build gate, not
discipline — the same argument as this ADR, applied to the stylesheet.
