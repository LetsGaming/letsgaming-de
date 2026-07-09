# @lg/server

Fastify server: one process for the read API, the CMS API, OAuth, the sync
worker, and the access-log ingest.

| Path | Role |
|---|---|
| `routes/read.ts` | `GET /api/site`: the resolved `SiteView`. |
| `routes/cms.ts` | Authed, schema-validated CRUD over owner content, plus galleries, layout, and guestbook moderation. |
| `routes/assets.ts` | The asset library: upload, list, metadata, folders, and public serving of files and lazy variants. |
| `routes/contact.ts` | Email relay; stores nothing. |
| `routes/guestbook.ts` | Public, pre-moderated guestbook submit. |
| `routes/presence.ts` | Server-side Lanyard fetch, filtered to the owner's allow-list. |
| `routes/track.ts` | `POST /api/pulse`: the cookieless engagement beacon. |
| `routes/analytics.ts` | The dashboard aggregates and range clearing (authed). |
| `auth/` | GitHub OAuth session + bearer-token guard (fails closed). |
| `sync/` | The scheduled sync worker (`runner.ts`) + `pnpm sync` (`cli.ts`). |
| `analytics/` | Log and UA parsing (`parse.ts`) + incremental ingest + `pnpm analytics`. |

The full API is in [`docs/reference/http-api.md`](../../docs/reference/http-api.md);
configuration in
[`docs/reference/configuration.md`](../../docs/reference/configuration.md).

Scripts: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm sync`,
`pnpm analytics <access.log>`.
