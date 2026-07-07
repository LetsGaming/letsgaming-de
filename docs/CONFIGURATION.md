# Configuration

All configuration is via environment variables, read once at boot
(`apps/server/src/env.ts`) or at build/runtime for the web app. `.env.example` is
the copy-paste starting point. Nothing secret is ever logged.

## Server (`apps/server`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP port. |
| `HOST` | `0.0.0.0` | Bind address. |
| `LOG_LEVEL` | `info` | Fastify log level. |
| `DB_PATH` | `./data/letsgaming.sqlite` | SQLite file. **The archive — back it up.** |
| `MEDIA_DIR` | `./data/media` | Uploaded images (served read-only). Back it up. |
| `WEB_ORIGIN` | `http://localhost:4321` | Allowed CORS origin(s), comma-separated. `*` allows all. |
| `GITHUB_USERNAME` | `LetsGaming` | The account the GitHub source reads. |
| `GITHUB_TOKEN` | — | PAT with `read:user`. **Absent → the mock source is used.** |
| `SESSION_SECRET` | falls back to `CMS_TOKEN`, then an insecure dev default | Signs the CMS session cookie. **Set a long random value in prod.** |
| `CMS_TOKEN` | — | Bearer token accepted by the CMS API (alongside OAuth). |
| `CMS_ALLOWED_LOGIN` | `GITHUB_USERNAME` | The single GitHub login allowed into the CMS. |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | — | GitHub OAuth app for CMS login. |
| `SMTP_HOST` | — | Contact relay host. **Absent → contact endpoint reports "not configured".** |
| `SMTP_PORT` | `587` | SMTP port (`465` switches to implicit TLS). |
| `SMTP_USER` / `SMTP_PASS` | — | SMTP auth (optional). |
| `CONTACT_FROM` | `SMTP_USER` or `no-reply@letsgaming.de` | Envelope From. |
| `CONTACT_TO` | — | Where contact messages are relayed. Required to enable contact. |

### Auth resolution

The CMS is enabled if **either** `CMS_TOKEN` **or** `GITHUB_OAUTH_CLIENT_ID` is
set; otherwise CMS writes fail closed with `503`. A request is authenticated if it
carries a valid signed session cookie **or** a matching `CMS_TOKEN` bearer.

### Source selection

`GITHUB_TOKEN` present → the real GraphQL adapter (needs the token for the
contribution calendar). Absent → the deterministic mock, so the site renders in
dev with zero config.

## Web (`apps/web`)

| Variable | Scope | Purpose |
|---|---|---|
| `API_URL` | runtime, server-side | Where **SSR** reads the `SiteView` (internal URL in Docker). |
| `PUBLIC_API_URL` | build-time, client | Where the **browser** reaches the API; baked into the CMS/client bundle. |
| `HOST` / `PORT` | runtime | Bind for the SSR node server (`0.0.0.0` / `4321` in the image). |

Two URLs because the SSR process and the browser reach the API by different
routes. In Docker: `API_URL=http://server:8787` (internal), `PUBLIC_API_URL` = the
public API URL.

## Precedence & files

- Local dev: a root `.env` (git-ignored) is the usual source.
- Docker: values come from Compose `environment:` / build `args:` (see
  `docker-compose.yml`), which read your shell/`.env`.
- The web app also honors Astro's `import.meta.env` for `PUBLIC_*` at build.
