# Configuration

All configuration is environment variables. The server reads and validates them
once at boot in `apps/server/src/env.ts`; the web app reads a couple at build and
runtime. `.env.example` is the copy-paste starting point and lists the same set
with inline notes. Nothing secret is ever logged.

An empty value counts as unset. Docker Compose passes an unset variable as `""`
rather than leaving it out, and `env.ts` treats a whitespace-only string as
absent so the defaults and fallbacks still apply.

## Server

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `LOG_LEVEL` | `info` | Fastify log level. |
| `DB_PATH` | `./data/letsgaming.sqlite` | SQLite file. This is the archive; back it up. |
| `MEDIA_DIR` | `./data/media` | Uploaded assets and cached variants. Back it up. |
| `WEB_ORIGIN` | `http://localhost:4321` | Allowed CORS origin(s), comma-separated. `*` means public read-only and disables credentialed CORS, so the CMS cookie won't be sent. |
| `TRUST_PROXY` | `false` | Trust `X-Forwarded-*` so `req.ip` is the real client. Set `true` only behind a trusted reverse proxy. |
| `RETAIN_HOURLY_DAYS` | `90` | Days of hourly analytics kept before rollup into daily rows. |
| `GITHUB_USERNAME` | `LetsGaming` | The account the GitHub source reads. |
| `GITHUB_TOKEN` | unset | Classic PAT with `read:user`. Absent means the GitHub mock source is used. |
| `SESSION_SECRET` | see below | Signs the CMS session cookie. |
| `CMS_TOKEN` | unset | Bearer token accepted by the CMS API alongside OAuth. |
| `CMS_ALLOWED_LOGIN` | `GITHUB_USERNAME` | The single GitHub login allowed into the CMS. |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | unset | GitHub OAuth app for CMS login. |
| `SMTP_HOST` | unset | Contact relay host. Absent means the contact endpoint reports "not configured". |
| `SMTP_PORT` | `587` | SMTP port. `465` switches to implicit TLS. |
| `SMTP_USER` / `SMTP_PASS` | unset | SMTP auth, optional. |
| `CONTACT_FROM` | `SMTP_USER`, else `no-reply@letsgaming.de` | Envelope From. |
| `CONTACT_TO` | unset | Where messages are relayed. Required to enable contact. |
| `DISCORD_USER_ID` | unset | Discord user id for the Lanyard presence widget. Public, not a secret. Absent means presence is offline. |
| `ACCESS_LOG` | unset | Path (inside the container) to a reverse-proxy access log to ingest for traffic analytics. Absent means no ingest. See below. |
| `ANALYTICS_OWN_HOST` | derived from `WEB_ORIGIN` | Your own host, so self-referrals are dropped from the referrer list. |
| `WAKAPI_URL` / `WAKAPI_KEY` | unset | Self-hosted Wakapi (coding time). Both required to activate. |
| `STEAM_API_KEY` / `STEAM_ID` | unset | Steam Web API. Both required to activate. |

`SESSION_SECRET` falls back to `CMS_TOKEN` and then to a dev default, but when the
CMS is enabled the server refuses to start on an empty or default secret. Set a
long random value in production (`openssl rand -hex 32`). See
[SECURITY](../SECURITY.md).

## Web

| Variable | Scope | Purpose |
|---|---|---|
| `API_URL` | runtime, server-side | Where SSR reads the `SiteView`. In Docker this is the internal URL. |
| `PUBLIC_API_URL` | build-time, client | Where the browser reaches the API; baked into the CMS and client bundle. |
| `HOST` / `PORT` | runtime | Bind for the SSR Node server (`0.0.0.0` and `4321` in the image). |

There are two API URLs because the SSR process and the browser reach the API by
different routes. In Docker: `API_URL=http://server:8787` (internal),
`PUBLIC_API_URL` is the public API URL.

## What enables each optional feature

- CMS writes: enabled when `CMS_TOKEN` or `GITHUB_OAUTH_CLIENT_ID` is set,
  otherwise every write fails closed with `503`. A request is authenticated with
  a valid signed session cookie or a matching `CMS_TOKEN`.
- GitHub data: real with `GITHUB_TOKEN` (needed for the contribution calendar),
  the deterministic mock without it, so the site renders in dev with zero config.
- Steam and Wakapi: real when both of their variables are set. In development an
  unconfigured source falls back to a mock; in production it's simply absent.
- Contact: enabled when `SMTP_HOST` and `CONTACT_TO` are both set.
- Presence: enabled when `DISCORD_USER_ID` is set and at least one presence
  category is turned on in the CMS.
- Traffic analytics: enabled when `ACCESS_LOG` points at a readable log.

## ACCESS_LOG versus ACCESS_LOG_HOST

The server reads `ACCESS_LOG`, an in-container path. In Docker you don't set that
directly. You set `ACCESS_LOG_HOST` in `.env` to the log's path on the Docker
host, and `docker-compose.yml` does the rest: it mounts that host path read-only
at `/logs/access.log` and sets the container's `ACCESS_LOG` to that mount. So
`.env` only ever mentions `ACCESS_LOG_HOST`, and you never edit the compose file.
Leaving it unset mounts `/dev/null` and ingests nothing. The full setup, including
pulling the log from another host, is in
[operations/analytics-ingestion](../operations/analytics-ingestion.md).

## Where values come from

- Local dev: a root `.env` (git-ignored) is the usual source.
- Docker: Compose `environment:` and build `args:` read your shell or `.env` (see
  `docker-compose.yml`).
- The web app also honours Astro's `import.meta.env` for `PUBLIC_*` at build.
