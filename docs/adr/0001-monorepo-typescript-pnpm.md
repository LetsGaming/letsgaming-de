# 0001: Monorepo, TypeScript everywhere, pnpm

**Status:** Accepted · 2026

## Context
One person maintains the whole stack. Types should flow end to end without a
publish step, and shared contracts (nav tree, content model, Source) must be
edited in one place.

## Decision
A pnpm-workspaces monorepo. TypeScript strict across every package. Libraries in
`packages/*`, deployables in `apps/*`. `@lg/core` holds the shared contracts and
is imported by everything.

## Consequences
- Change a contract once; every consumer sees it immediately.
- `@lg/core` must be built before others can typecheck or test. CI and `pnpm build`
  do this first.
- Slightly more ceremony than a single package, repaid by clear seams.
