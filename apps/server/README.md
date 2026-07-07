# @lg/server

Fastify server (§10: one process for API + CMS + sync worker).

- **`routes/read.ts`** — `GET /api/site`: the resolved `SiteView`.
- **`routes/cms.ts`** — authed, schema-validated CRUD over owner content.
- **`routes/media.ts`** — image upload (→ WebP via sharp) + read-only serve.
- **`routes/contact.ts`** — email relay; stores nothing.
- **`routes/analytics.ts`** — aggregate dashboard data (authed).
- **`auth/`** — GitHub OAuth session + bearer-token guard (fails closed).
- **`sync/`** — the scheduled sync worker (`runner.ts`) + `pnpm sync` (`cli.ts`).
- **`analytics/`** — log/UA parsing (`parse.ts`) + incremental ingest + `pnpm analytics`.

Scripts: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm sync`,
`pnpm analytics <access.log>`.
