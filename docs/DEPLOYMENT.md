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
token). Run a real sync anytime (the runtime image is prod-pruned, so invoke the
built CLI directly rather than `pnpm sync`):

```bash
docker compose exec server node dist/sync/cli.js
```

## 3. Reverse proxy + TLS

Put Caddy/Traefik/nginx in front for `letsgaming.de` (→ web:8080) and the API
path/subdomain (→ server:8787), with Let's Encrypt. Keep the API reachable from
the browser at `PUBLIC_API_URL` (same domain under `/api`, or an `api.` subdomain
with the site origin in `WEB_ORIGIN`).

## 4. Analytics

Engagement stats (sections, dwell, clicks, …) are cookieless and work out of the box.
The *traffic* stats (Top paths / referrers / browsers / OS / devices) come from your
reverse-proxy access log. Enable them by setting **one** variable in `.env`:

```dotenv
ACCESS_LOG_HOST=/opt/lg/logs/access.log   # path to the log ON THE DOCKER HOST
ANALYTICS_OWN_HOST=letsgaming.de          # optional; keeps your domain out of Referrers
```

Compose mounts that path read-only into the container and the server ingests it every
5 minutes (incremental + idempotent). You never edit `docker-compose.yml`. Leave the
variable unset to disable. The IP is dropped at parse time and never stored. The log
must be in Nginx **combined** format (NPMplus's per-host `*_combined.log` already is).

**If the proxy runs on another host** (e.g. an NPMplus LXC), the container can't read
its filesystem — sync the log to the Docker host first, then point `ACCESS_LOG_HOST`
at the synced copy. A small `scp` timer does it:

```bash
mkdir -p /opt/lg/logs
cat >/opt/lg/pull-access-log.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
scp -q -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new \
  root@192.168.2.12:/opt/npmplus/nginx/logs/letsgaming_combined.log \
  /opt/lg/logs/access.log.tmp
mv -f /opt/lg/logs/access.log.tmp /opt/lg/logs/access.log   # atomic swap
EOF
chmod +x /opt/lg/pull-access-log.sh
```

Run it from a systemd timer every couple of minutes (`Type=oneshot` service +
`OnUnitActiveSec=2min`). The temp-file + `mv` keeps the container from ever reading a
half-written file. On log rotation the file shrinks and the ingest resets automatically.

Prefer host-side cron instead? The CLI still works and bypasses `ACCESS_LOG_HOST`:

```bash
docker compose exec server node dist/analytics/cli.js /path/to/access.log letsgaming.de
```

View the results in the CMS **Analytics** screen.

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
- The store uses `node:sqlite` (built into Node ≥ 22.13) — images have no native
  build step, so no compiler or node-gyp is needed.
