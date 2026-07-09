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
