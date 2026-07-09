# Analytics ingestion

There are two kinds of analytics (see
[concepts/analytics-and-privacy](../concepts/analytics-and-privacy.md)).
Engagement stats come from a cookieless beacon and work out of the box, nothing to
configure. Traffic stats (top paths, referrers, browsers, OS, devices) come from
your reverse-proxy access log, and that's what this page sets up. The IP is
dropped at parse time either way.

## The normal way: in-process, one variable

The server ingests a configured log itself, every 5 minutes, incrementally and
idempotently. You set one variable in `.env`:

```dotenv
ACCESS_LOG_HOST=/opt/lg/logs/access.log   # path to the log ON THE DOCKER HOST
ANALYTICS_OWN_HOST=letsgaming.de          # optional; keeps your domain out of Referrers
```

Compose mounts that host path read-only into the container and points the
container's `ACCESS_LOG` at it, so you never edit `docker-compose.yml`. Leave the
variable unset to disable ingestion (engagement stats still work). The log has to
be in nginx combined format; NPMplus's per-host `*_combined.log` already is. On
log rotation the file shrinks, and the ingest notices and resets its offset
automatically.

That's the whole setup if your reverse proxy runs on the Docker host.

## When the proxy runs on another host

If the proxy is on a different box (an NPMplus LXC, say), the container can't read
its filesystem. Sync the log to the Docker host first, then point
`ACCESS_LOG_HOST` at the synced copy. A small scp on a timer does it:

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

Run it from a systemd timer every couple of minutes (a `Type=oneshot` service plus
`OnUnitActiveSec=2min`). The temp file and `mv` keep the container from ever
reading a half-written file. The ingest tracks its own byte offset, so copying the
whole file each run is fine.

A ready-made version of this is `scripts/ingest-analytics.sh`, which scp's the log
and runs the CLI in one shot, with `PROXY_HOST`, `PROXY_LOG`, `LOCAL_LOG`, and
`OWN_HOST` overridable by environment.

## Alternative: host-side cron via the CLI

If you'd rather not use the in-process ingest, the CLI still works and bypasses
`ACCESS_LOG_HOST`:

```bash
docker compose exec server node dist/analytics/cli.js /path/to/access.log letsgaming.de
```

Schedule it however you like. It's the same parser and the same idempotent offset
tracking, so mixing it with the in-process ingest won't double-count.

## Seeing the results

View them in the CMS Analytics screen. Preview traffic from the admin is never
counted.
