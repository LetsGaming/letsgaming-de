# HTTP API

Everything is JSON unless noted. The base URL is the server (`:8787` in dev). The
routes are registered in `apps/server/src/routes/`; the CMS write bodies are
validated against `apps/server/src/schemas.ts`.

## Conventions

Auth, where required, is a signed session cookie from GitHub OAuth, or an
`Authorization: Bearer <CMS_TOKEN>` header. An unauthenticated write gets `401`;
if the CMS isn't configured at all, `503`. Error bodies are `{ "error":
"message" }`. Successful writes return `{ "ok": true }` unless a different shape
is listed.

Status codes used across the API: `400` validation, `401` unauthenticated, `403`
wrong login, `404` not found, `413`/`415` upload too large or wrong type, `429`
rate limited, `503` feature not configured, `204` accepted with no body.

## Public read

| Endpoint | Returns |
|---|---|
| `GET /api/site?locale=en` | The resolved `SiteView`. `locale` is `en` (default) or `de`. See [concepts/data-model](../concepts/data-model.md). |
| `GET /health` | `{ "status": "ok", "lastSync": "<iso>", "time": "<iso>" }` |

## Public write

These accept input from anyone and store nothing that identifies a person. Each
has a honeypot field and a per-IP rate limit; the IP is used only for the limiter
and is never stored.

`POST /api/contact` relays a message to email and stores nothing. Requires SMTP
configured, otherwise `503`.

```json
{ "name": "Ada", "email": "ada@example.com", "message": "hi", "website": "" }
```

`website` is a honeypot, so real clients leave it empty; a filled honeypot is
silently accepted so bots don't learn. Rate limit is 5 per 10 minutes per IP
(`429` past that). Success is `{ "ok": true }`.

`POST /api/guestbook` submits a guestbook entry. It's stored as pending and is
never public until approved in the CMS, so no id comes back.

```json
{ "name": "Ada", "message": "nice site", "website": "" }
```

Same honeypot behaviour. Rate limit is 3 per 10 minutes per IP. Success is
`{ "ok": true, "pending": true }`.

`POST /api/pulse` is the cookieless engagement beacon. The site sends it via
`navigator.sendBeacon`, so the body arrives as `text/plain` (to avoid a CORS
preflight) or JSON:

```json
{ "events": [ { "d": "tab", "k": "work" }, { "d": "dwell", "k": "home:30s" } ] }
```

Each event is validated against the shared vocabulary and the live nav; invalid
events are dropped. Rate limit is 300 per 10 minutes per IP. Returns `204` with no
body (`sendBeacon` ignores the response), `400` on an unparseable body. See
[concepts/analytics-and-privacy](../concepts/analytics-and-privacy.md).

## Presence

`GET /api/presence` returns the presence view the server is willing to expose:
`{ "status": "...", "cards": [ ... ] }`. The server calls Lanyard, applies the
owner's category allow-list, and returns only the permitted result, cached about
15 seconds. If presence isn't configured or every category is disabled, it returns
`{ "status": "offline", "cards": [] }`. The browser never talks to Lanyard and
never learns the Discord id.

## Playtime and listening

Day drill-ins behind the playtime and listening charts — one day's breakdown,
fetched when a column is clicked rather than shipped with the module (the strips
run to hundreds of days and nobody wants every breakdown up front). Both are capped
to the module's `maxCount` **server-side** — the response carries only the rows the
page may show, plus the true totals for the "and N more" note, never the whole day.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/playtime/day?day=YYYY-MM-DD` | none | That day's per-game minutes, from observed sessions. Returns `{ day, games, total, minutes }` — `games` capped to `maxCount`, `total` the true distinct-game count, `minutes` the day's real total. Hidden games are filtered out. `400` if `day` isn't `YYYY-MM-DD`. |
| `GET /api/music/day?day=YYYY-MM-DD` | none | That day's listening. Returns `{ day, minutes, trackCount, artistCount, songs, artists }` — `songs` and `artists` each aggregated and capped to `maxCount`; the counts are the true distinct totals. `400` on a malformed date. |

## Media proxy

`GET /api/presence/media?u=<encoded-url>` re-serves an image from a small
allow-list of CDNs (Discord, RAWG, Spotify), so the browser never talks to those
hosts directly and the endpoint can't be turned into an open proxy — a URL off the
allow-list is refused. Presence avatars/art and playtime cover art both load
through it. An optional `&game=<name>` supplies a lettered-tile fallback rendered
server-side when the image is missing.

## Assets

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /assets/:id` | none | Serve the canonical file, long-cached. |
| `GET /assets/:id/:variant` | none | Serve a specific rendition; generated on first request, then cached to disk. |
| `GET /api/assets/md/:slug` | none | The content of a Markdown asset (used by its `/md/<slug>` page). |

## CMS

All authed. See [concepts/the-cms](../concepts/the-cms.md) for what these back.

Whoami and read-back:

| Endpoint | Returns |
|---|---|
| `GET /api/cms/me` | `{ "login": "LetsGaming" }` |
| `GET /api/cms/content` | `{ content, nav, modules }`, raw and localized, for the editor |

Scalars, each a `PUT` with a validated body:

| Endpoint | Body |
|---|---|
| `/api/cms/meta` | `SiteMeta` |
| `/api/cms/headline` | `Headline` |
| `/api/cms/lede` | `Localized` |
| `/api/cms/status` | `Status` |
| `/api/cms/bio` | `Localized[]` |
| `/api/cms/presence` | `{ show: PresenceCategory[] }` |

List entities, `PUT` to upsert (body is the entity plus an optional `sort`
integer) and `DELETE` to remove:
`/api/cms/projects/:id`, `/api/cms/hobbies/:id`, `/api/cms/links/:id`,
`/api/cms/now/:id`.

Galleries:

| Endpoint | Purpose |
|---|---|
| `PUT /api/cms/gallery/:id` | Upsert an image entry (references an asset, localized caption, `sort`). |
| `DELETE /api/cms/gallery/:id` | Remove an image entry. |
| `POST /api/cms/gallery-module` | Create a new gallery (starts hidden); returns `{ ok, id }`. |
| `DELETE /api/cms/gallery-module/:id` | Delete a gallery; the built-in `gallery` can't be deleted. |

Layout:

`PUT /api/cms/layout` takes the full desired placement and applies it if it passes
the nav lint. A module may sit in at most one area; any registered module left out
of every area is hidden.

```json
{ "order": [ { "area": "home", "modules": ["hero", "featured"] }, { "area": "work", "modules": ["activity", "projects"] } ] }
```

A bad area, an unknown module, a module placed twice, or a result that fails the
lint returns `400` with the reason.

Asset library:

| Endpoint | Purpose |
|---|---|
| `POST /api/cms/assets` | Multipart upload, field `file`. Accepts images, SVG, GIF, PDF, Markdown. Deduped by content hash. |
| `GET /api/cms/assets?folder=&tag=&kind=&q=` | List assets with filters; returns `{ assets, folders, tags }`. |
| `GET /api/cms/assets/:id` | One asset's detail. |
| `PATCH /api/cms/assets/:id` | Update metadata (`filename`, `alt`, `title`, `caption`, `description`, `folderId`). |
| `DELETE /api/cms/assets/:id` | Delete an asset. |
| `POST /api/cms/assets/folders` | Create a folder (`{ name, parentId }`). |
| `PATCH /api/cms/assets/folders/:id` | Rename or move a folder. |
| `DELETE /api/cms/assets/folders/:id` | Delete a folder. |

Guestbook moderation:

| Endpoint | Purpose |
|---|---|
| `GET /api/cms/guestbook` | `{ entries, pending }`; pending first, most suspicious first. |
| `POST /api/cms/guestbook/:id/:action` | `action` is `approve` or `reject`. |
| `DELETE /api/cms/guestbook/:id` | Delete an entry. |

Analytics:

`GET /api/cms/analytics?hours=720` returns anonymous aggregates over the window
(default 720 hours; the response uses hourly buckets at or under 72 hours, daily
above). The shape:

```jsonc
{
  "range": { "from": "...", "to": "...", "hours": 720, "unit": "day" },
  "paths": [ { "key": "/", "count": 12 }, ... ],
  "referrers": [ ... ], "browsers": [ ... ], "os": [ ... ], "devices": [ ... ],
  "chart": { "unit": "day", "pageviews": [...], "sections": [...], "clicks": [...], "visitLength": [...] },
  "engagement": { "tabs": [...], "exits": [...], "transitions": [...], "dwell": [...], "scroll": [...], "clicks": [...], "projects": [...], "viewport": [...], "theme": [...] }
}
```

`POST /api/cms/analytics/clear` with `{ "range": "hour" | "24h" | "3d" | "7d" |
"all" }` clears that range and returns `{ ok, removed }`. `all` also wipes the
rolled-up daily stats.

## Auth

| Endpoint | Purpose |
|---|---|
| `GET /auth/github/login` | Redirect to GitHub's consent screen. |
| `GET /auth/github/callback?code=&state=` | Verify the login is `CMS_ALLOWED_LOGIN`, set a signed http-only session cookie, redirect to `WEB_ORIGIN`. A different GitHub user gets `403`. |
| `POST /auth/logout` | Clear the cookie. |

The auth model, cookie flags, and the fail-closed behaviour are in
[SECURITY](../SECURITY.md).
