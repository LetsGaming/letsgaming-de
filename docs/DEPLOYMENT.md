# Deployment

Homelab, Docker (§10). Two containers behind a reverse proxy: the Fastify server
(API + CMS + sync worker) and the Astro SSR site.

## 1. Configure

```bash
cp .env.example .env
```

Set at least:

| Var | Why |
|---|---|
| `GITHUB_TOKEN` | Real GitHub data (classic PAT, `read:user`). Without it, the mock source is used. |
| `SESSION_SECRET` | Long random string — signs the CMS session cookie. |
| `WEB_ORIGIN` | Public site origin(s), comma-separated, for CORS. |
| `PUBLIC_API_URL` | Browser → API URL (baked into the client bundle at build). |
| `CMS_ALLOWED_LOGIN` | The single GitHub login allowed into the CMS. |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | GitHub OAuth app for CMS login. |
| `SMTP_*`, `CONTACT_TO` | Contact relay (optional; unset = disabled). |

Two API URLs on purpose: `API_URL` (server→API, internal, set in compose) and
`PUBLIC_API_URL` (browser→API, public, a build arg).

## 2. Build & run

```bash
docker compose up -d --build
```

- **server** → port 8787, SQLite + media on the `store` volume.
- **web** → port 8080 (SSR), reads the API over the internal network.

On first boot the store seeds and the sync worker runs once (mock data if no
token). Run a real sync anytime:

```bash
docker compose exec server pnpm sync
```

## 3. Reverse proxy + TLS

Put Caddy/Traefik/nginx in front for `letsgaming.de` (→ web:8080) and the API
path/subdomain (→ server:8787), with Let's Encrypt. Keep the API reachable from
the browser at `PUBLIC_API_URL` (same domain under `/api`, or an `api.` subdomain
with the site origin in `WEB_ORIGIN`).

## 4. Analytics

Analytics is log-based. Point the ingester at your reverse-proxy access log on a
schedule (host cron / systemd timer):

```bash
docker compose exec server pnpm analytics /path/to/access.log letsgaming.de
```

It reads only new lines each run, drops the IP at parse time, and stores anonymous
aggregates. View them in the CMS analytics tab.

## 5. Backups

Back up the `store` volume — it holds the SQLite file (**the archive**, whose
accumulated history can't be re-fetched) and uploaded media. Everything else is
rebuildable from the repo.

```bash
docker run --rm -v letsgamingde_store:/data -v "$PWD":/backup alpine \
  tar czf /backup/store-$(date +%F).tar.gz -C /data .
```

## Notes

- The web tier is SSR (`@astrojs/node`), so content is always live — no rebuild on
  sync or CMS edit. A short in-process cache absorbs bursts.
- If a registry can't fetch a `better-sqlite3` prebuilt, add build tools to the
  server image's build stage (see the comment in `apps/server/Dockerfile`).
