# Contributing

Solo project, but future-me counts as a contributor. These are the conventions
CI enforces, so following them keeps the build green.

## Setup

```bash
corepack enable          # provides pnpm 9
pnpm install
pnpm --filter @lg/core build
pnpm dev                 # API :8787, web :4321
```

`packages/core` must be built before the others can typecheck or test — it's the
shared package everything imports. `pnpm build` and CI do this first.

## Layout

- `packages/*` — libraries (`core`, `db`, `sources`), each with a README.
- `apps/*` — deployables (`server`, `web`), each with a README.
- Path style: relative imports use `.js` extensions (ESM); workspace packages are
  imported by name (`@lg/core`).

## Conventions

- **TypeScript strict**, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`. Use
  `import type` for type-only imports.
- **Normalized data only** crosses the store/API/frontend seam. Never leak a raw
  API shape past a source adapter's `normalize()`.
- **Everything human-authored is `Localized`.** English is required; German is
  optional and added as content, never as a schema change.
- **The nav is a tree with a lint.** Don't widen a level past 5 or nest past 3;
  split into sub-nodes instead. `pnpm lint:nav` will fail otherwise.
- **The CMS stays small.** Every proposed CMS feature is measured against "does
  this project actually need it?" No asset library, no plugins, no page builder.

## Before pushing

```bash
pnpm lint:nav      # information-architecture gates
pnpm typecheck     # all packages incl. astro check
pnpm test          # unit + integration
pnpm build         # full build (also runs lint:nav)
```

CI runs the same on every push and on pull requests (Node 22 + 24).

## Adding things

See the playbooks in [`ARCHITECTURE.md`](./ARCHITECTURE.md): adding a data
source, a module, or a nav node. Each is a small, local change by design.

## Tests

- `@lg/core` — nav lint rules (`nav-lint.test.ts`).
- `@lg/db` — store round-trips, snapshot accumulation, resolve integration.
- `@lg/sources` — GitHub normalization.
- `@lg/server` — access-log/UA parsing (incl. the no-IP guarantee).

Prefer a focused test next to the code it covers (`*.test.ts`). The GitHub live
path needs a token and isn't covered by CI — smoke-test it manually with a real
`GITHUB_TOKEN`.
