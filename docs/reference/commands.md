# Commands

Requires Node 22.13 or newer and pnpm (via `corepack enable`; the version is
pinned in `package.json` under `packageManager`). Run these from the repo root.

## pnpm scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Build the workspace packages, then run the server and the web app (SSR) in parallel. API on `:8787`, site on `:4321`. The build step is what makes a fresh clone work: `@lg/core` and `@lg/db` resolve through `dist/`, which isn't committed. |
| `pnpm dev:server` / `pnpm dev:web` | Run just one of them. |
| `pnpm sync` | Run every source once (fetch, normalize, persist) and exit. Uses the mock GitHub source without a token. |
| `pnpm analytics:reclassify` | Re-file stored rows through the current classifiers (e.g. scanner requests still counted as page views). Safe to repeat. |
| `pnpm analytics <access.log> [host]` | Ingest new lines from an access log into the anonymous aggregates. Optional `host` keeps your own domain out of the referrer list. |
| `pnpm lint:nav` | Fail if the nav breaks an information-architecture gate. |
| `pnpm typecheck` | Typecheck every package, including `vue-tsc` for the web app. |
| `pnpm test` | Unit and integration tests. |
| `pnpm build` | Nav lint, then build the packages, then the server, then the web app. |

`@lg/core` is imported by everything else, so `pnpm build` and CI build it first.
For a fresh clone, build core once before typechecking or testing the rest:
`pnpm --filter @lg/core build`.

## The CLIs

`pnpm sync` and `pnpm analytics` wrap these. In a production Docker image the
dev dependencies are pruned, so `pnpm` isn't available and you invoke the built
CLIs directly:

```bash
# Run one sync inside the running server container
docker compose exec server node dist/sync/cli.js

# Ingest an access log (host optional, to drop self-referrals)
docker compose exec server node dist/analytics/cli.js /logs/access.log letsgaming.de
```

In normal operation you don't need the analytics CLI: the server ingests a
configured `ACCESS_LOG` in-process every 5 minutes. The CLI is there for a
host-side cron if you'd rather run it that way. See
[operations/analytics-ingestion](../operations/analytics-ingestion.md).
