# Documentation

Everything about letsgaming.de that doesn't fit in the top-level
[README](../README.md). These same files are published on the site at
[`/docs`](https://letsgaming.de/docs), so the sidebar there mirrors the folders
below.

If you're new to the project, read [OVERVIEW](./OVERVIEW.md) then
[ARCHITECTURE](./ARCHITECTURE.md). That's enough to find your way around.

## Start here

- [OVERVIEW](./OVERVIEW.md) is what the site is, the principles behind it, what
  ships today, and what's deferred.
- [ARCHITECTURE](./ARCHITECTURE.md) is how the code is put together: the one
  data seam, the package roles, and what happens from boot to a rendered page.
- [CONTRIBUTING](./CONTRIBUTING.md) is dev setup, the conventions CI enforces,
  and how to cut a release.
- [SECURITY](./SECURITY.md) is the auth model, upload handling, and how to
  report something.

## Folders

Each folder has its own README with a one-line index.

- [concepts/](./concepts/README.md) is the durable stuff: information
  architecture, the data model, sources and sync, analytics and privacy, the CMS
  philosophy, and a glossary. These change least when the code changes.
- [reference/](./reference/README.md) is lookup material: the HTTP API, every
  environment variable, and the commands.
- [guides/](./guides/README.md) is task-oriented: using the CMS, and extending
  the site (adding a source, a module, or a nav node).
- [operations/](./operations/README.md) is running it in production: deployment,
  analytics ingestion, backups, and troubleshooting.
- [adr/](./adr/README.md) is the decision log: short, dated notes on the choices
  that were expensive to reverse.

## How these docs are meant to age

Each fact has one home. Other docs link to it instead of repeating it, so there
aren't two copies to drift apart. Where a value lives in code (an env default,
the DB schema, the validation rules), the docs describe the shape and point at
the file that owns it rather than pasting a snapshot that goes stale on the next
commit. The files worth knowing as sources of truth:

- `apps/server/src/env.ts` and `.env.example` for configuration.
- `packages/db/src/migrations/` for the store schema (baseline `0001_init.sql`).
- `apps/server/src/schemas.ts` for CMS request validation.
- `packages/core/src/` for the contracts (nav, source, content, view).

## Per-package docs

Every workspace has its own README next to the code:
[core](../packages/core/README.md),
[db](../packages/db/README.md),
[sources](../packages/sources/README.md),
[server](../apps/server/README.md),
[web](../apps/web/README.md).
