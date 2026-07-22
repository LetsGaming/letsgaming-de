# Deployment

Homelab, Docker, two containers behind a reverse proxy: the Fastify server (API,
CMS, sync worker) and the Nuxt SSR site. The compose file is `docker-compose.yml`
at the repo root.

## 1. Configure

```bash
cp .env.example .env
```

Set at least these. Everything else has a working default or is opt-in; the full
list is in [reference/configuration](../reference/configuration.md).

| Variable | Why |
|---|---|
| `GITHUB_TOKEN` | Real GitHub data (classic PAT, `read:user`). Without it the mock source is used. |
| `SESSION_SECRET` | Long random string that signs the CMS session cookie. Required when the CMS is enabled. |
| `WEB_ORIGIN` | Public site origin(s), comma-separated, for CORS. Not `*` if you want the CMS to work. |
| `PUBLIC_API_URL` | Browser to API URL, baked into the client bundle at build. |
| `CMS_ALLOWED_LOGIN` | The single GitHub login allowed into the CMS. |
| `GITHUB_OAUTH_CLIENT_ID` / `_SECRET` | GitHub OAuth app for CMS login. |
| `SMTP_*`, `CONTACT_TO` | Contact relay. Optional; unset means the contact endpoint is disabled. |

Two API URLs on purpose: `API_URL` (server to API, internal, set in compose) and
`PUBLIC_API_URL` (browser to API, public, a build arg).

## 2. Build and run

```bash
docker compose up -d --build
```

- server: port 8787, SQLite and media on the `store` volume.
- web: port 8080 (SSR), reads the API over the internal network.

On first boot the store seeds and the sync worker runs once (mock data if there's
no token). The store uses `node:sqlite` (built into Node 22.13+), so the images
have no native build step: no compiler, no node-gyp.

To run a real sync by hand (the runtime image is pruned, so call the built CLI
rather than `pnpm sync`):

```bash
docker compose exec server node dist/sync/cli.js
```

## 3. Reverse proxy and TLS

Put Caddy, Traefik, or nginx in front for `letsgaming.de` (to `web:8080`) and the
API path or subdomain (to `server:8787`), with Let's Encrypt. Keep the API
reachable from the browser at whatever you set as `PUBLIC_API_URL` (the same
domain under `/api`, or an `api.` subdomain with the site origin in `WEB_ORIGIN`).

Because the cookie is `secure` and `sameSite=lax` in production, the site and the
API need to be same-site. An `api.` subdomain of the site domain works; two
unrelated domains don't. See [SECURITY](../SECURITY.md).

## 4. Analytics and backups

Traffic analytics and backups each have their own page, because both have a few
moving parts:

- [operations/analytics-ingestion](./analytics-ingestion.md) for getting your
  reverse-proxy log into the store.
- [operations/backups](./backups.md) for backing up and restoring the store
  volume.

## Notes

The web tier is SSR (Nitro `node-server`), so content is always live: no rebuild on a
sync or a CMS edit. A short in-process cache absorbs bursts.
