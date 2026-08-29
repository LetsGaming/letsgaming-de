---
name: api-doc
description: Check or update openapi.yml against Fastify routes in apps/server/src/routes so the OpenAPI spec stays in sync with the actual API. Use when adding, removing, or changing a route/endpoint, or when asked to review API docs for drift.
---

# API Doc Sync

`openapi.yml` at the repo root is hand-maintained and must reflect the routes registered in `apps/server/src/routes/*.ts` (wired up in `apps/server/src/app.ts`).

## Workflow

1. List registered routes: grep `app.get|app.post|app.put|app.patch|app.delete` across `apps/server/src/routes/*.ts` and note method + path + auth (`preHandler`) + schema.
2. List documented paths in `openapi.yml` (top-level `paths:` keys, e.g. `/api/site`, `/api/module/{id}`).
3. Diff the two lists:
   - Routes with no matching `openapi.yml` entry → missing docs.
   - `openapi.yml` entries with no matching route → stale docs (route removed or renamed).
   - For routes present in both, compare: HTTP method, path params, and whether the route's schema (`schemas.ts` / inline Zod-like schema) matches the documented request/response body.
4. Report findings before editing — this is a diff-and-decide skill, not an auto-fixer. When the user confirms, update `openapi.yml` to match the code (code is the source of truth; the spec should describe reality).

## Conventions in this repo

- Auth-gated routes use a `preHandler` (see `apps/server/src/auth/`) — reflect this as a `security` requirement in the spec.
- Route schemas live either inline (`{ schema: { body: ... } }`) or referenced from `apps/server/src/schemas.ts`.
- Keep `openapi.yml`'s `info.version` bumped only when the user asks — don't bump it as a side effect of a docs sync.
