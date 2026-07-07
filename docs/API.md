# HTTP API

All JSON. Base URL is the server (`:8787` in dev). Auth, where required, is a
signed session cookie (from GitHub OAuth) **or** an `Authorization: Bearer
<CMS_TOKEN>` header. Unauthenticated writes get `401`; if the CMS isn't configured
at all, `503`.

## Public

### `GET /api/site?locale=en`

The resolved, render-ready `SiteView` — what the site renders. `locale` is `en`
(default) or `de`. See [DATA-MODEL](./DATA-MODEL.md#siteview) for the shape.

```jsonc
{
  "locale": "en",
  "meta": { "name": "Domenic", "handle": "LetsGaming", "location": "Germany", "role": "web developer" },
  "nav": [ { "id": "home", "label": "Home", "modules": ["hero", "featured", "glance"] }, … ],
  "modules": { "hero": { "id": "hero", "kind": "hero", "data": { … } }, … },
  "syncedAt": "2026-07-07T18:48:14.264Z"
}
```

### `GET /health`

```json
{ "status": "ok", "lastSync": "2026-07-07T18:48:14.264Z", "time": "…" }
```

### `POST /api/contact`

Relays a message to email; **stores nothing**. Requires SMTP configured
(otherwise `503`). Body:

```json
{ "name": "Ada", "email": "ada@example.com", "message": "hi", "website": "" }
```

`website` is a honeypot — leave empty. Validated server-side. Rate-limited per IP
(5 / 10 min → `429`). Success: `{ "ok": true }`.

## CMS (authed)

- `GET /api/cms/me` → `{ "login": "LetsGaming" }`
- `GET /api/cms/content` → `{ content, nav, modules }` (raw, localized, for the editor)

### Scalars — `PUT`

| Endpoint | Body |
|---|---|
| `/api/cms/meta` | `SiteMeta` |
| `/api/cms/headline` | `Headline` |
| `/api/cms/lede` | `Localized` |
| `/api/cms/status` | `Status` |
| `/api/cms/bio` | `Localized[]` |

### List entities — `PUT` (upsert) / `DELETE`

`/api/cms/projects/:id`, `/hobbies/:id`, `/links/:id`, `/now/:id`. The `PUT` body
is the entity plus an optional `sort` integer. All bodies are JSON-schema
validated (`apps/server/src/schemas.ts`); a bad body returns `400` with the
validation error. Success: `{ "ok": true }`.

### Media

- `POST /api/cms/media` — multipart, field `file`. Accepts JPEG/PNG/WebP/GIF up to
  8 MB; resized to ≤1400px WebP. → `{ "url": "/media/<uuid>.webp", "filename": … }`.
- `GET /api/cms/media` — `{ "files": ["/media/….webp", …] }`.
- `GET /media/:file` — public, read-only, long-cached. Filenames are validated to
  block path traversal.

### Analytics

`GET /api/cms/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` (defaults: last 30 days).

```jsonc
{
  "range": { "from": "…", "to": "…" },
  "paths":     [ { "key": "/", "count": 12 }, … ],
  "referrers": [ … ], "browsers": [ … ], "os": [ … ], "devices": [ … ],
  "trend":     [ { "key": "2026-10-10", "count": 4 }, … ]   // views per day
}
```

Anonymous aggregates only — no IPs, no identifiers.

## Auth

- `GET /auth/github/login` → redirects to GitHub's consent screen.
- `GET /auth/github/callback?code=…` → verifies the login is `CMS_ALLOWED_LOGIN`,
  sets a signed http-only session cookie, redirects to `WEB_ORIGIN`.
- `POST /auth/logout` → clears the cookie.

## Errors

Standard status codes: `400` validation, `401` unauthenticated, `403` wrong login,
`404` not found, `413`/`415` upload too large / unsupported type, `429` rate
limited, `503` feature not configured. Error bodies are `{ "error": "message" }`.
