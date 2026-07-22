# Contributing

Solo project, but future-me counts as a contributor. These are the conventions CI
enforces, so following them keeps the build green.

## Setup

```bash
corepack enable          # provides the pinned pnpm
pnpm install
pnpm --filter @lg/core build
pnpm dev                 # API :8787, web :4321
```

`@lg/core` has to be built before the others can typecheck or test, because it's
the shared package everything imports. `pnpm build` and CI do this first. The
pnpm version comes from `package.json` (`packageManager`); corepack picks it up,
so don't install pnpm separately.

## Layout

- `packages/*` are libraries (`core`, `db`, `sources`), each with a README.
- `apps/*` are deployables (`server`, `web`), each with a README.
- Imports: relative paths use `.js` extensions (ESM); workspace packages are
  imported by name (`@lg/core`).

## Conventions

- TypeScript strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`. Use
  `import type` for type-only imports.
- Only normalized data crosses the store, API, and frontend seam. A raw API shape
  never leaks past a source adapter's `normalize()`.
- Everything human-authored is `Localized`. English is required; German is
  optional and added as content, never as a schema change.
- The nav is a tree with a lint. Don't widen a level past five or nest past three;
  split into sub-nodes instead. `pnpm lint:nav` will fail otherwise. See
  [concepts/information-architecture](./concepts/information-architecture.md).
- The CMS stays small. Every proposed feature is measured against "does this
  project actually need it?" See [concepts/the-cms](./concepts/the-cms.md).

## Before pushing

```bash
pnpm lint:nav      # information-architecture gates
pnpm typecheck     # all packages incl. vue-tsc
pnpm test          # unit + integration
pnpm build         # full build (also runs lint:nav)
```

## CI and releases

CI runs the same checks on every push to `main` and on pull requests, across Node
22 and 24 (the two versions that ship `node:sqlite`). It installs with
`--frozen-lockfile`, builds (which runs the nav lint), typechecks, and tests.

The Release workflow runs only on a version tag (`v*`): it builds and pushes the
`server` and `web` images to GHCR (`:<version>` and `:latest`) and creates a
GitHub Release. Nothing publishes on a normal push. Cut a release with:

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## Adding things

The playbooks for adding a data source, a module, or a nav node are in
[guides/extending](./guides/extending.md). Each is a small, local change by
design.

## Tests

- `@lg/core`: the nav lint rules, resolve, format, guestbook scoring, presence.
- `@lg/db`: store round-trips, snapshot accumulation, resolve integration.
- `@lg/sources`: source normalization.
- `@lg/server`: route behaviour and access-log/UA parsing, including the
  assertion that the IP never reaches parsed output.
- `@lg/web`: the docs link-rewrite and sidebar helpers, site resolution.

Prefer a focused test next to the code it covers (`*.test.ts`). The GitHub live
path needs a token and isn't covered by CI; smoke-test it by hand with a real
`GITHUB_TOKEN`.
