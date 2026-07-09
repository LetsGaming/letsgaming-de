# Analytics ingestion

There are two kinds of analytics (see
[concepts/analytics-and-privacy](../concepts/analytics-and-privacy.md)).
Engagement stats come from a cookieless beacon and work out of the box, nothing to
configure. Traffic stats (top paths, referrers, browsers, OS, devices) come from
your reverse-proxy access log, and that's what this page sets up. The IP is
dropped at parse time either way.

## The normal way: in-process

The server ingests a configured log itself, every 5 minutes, incrementally and
idempotently. You set two variables in `.env`:

```dotenv
ACCESS_LOG_DIR=/opt/lg/logs        # the HOST directory that holds the log
ACCESS_LOG=/logs/access.log        # the log's path INSIDE the container, under /logs
ANALYTICS_OWN_HOST=letsgaming.de   # optional; keeps your domain out of Referrers
```

Compose mounts `ACCESS_LOG_DIR` read-only at `/logs`, and the server reads the log
at `ACCESS_LOG` from inside it. `ACCESS_LOG` is the variable the server actually
reads and the one the CMS hint names, so setting it is never silently ignored.
Leave both unset to disable ingestion (engagement stats still work). The log has to
be in nginx combined format; NPMplus's per-host `*_combined.log` already is. On log
rotation the file shrinks, and the ingest notices and resets its offset
automatically.

Why the directory and not the file: a file bind-mount pins the inode from mount
time, so if the log is ever replaced (a rotation, or a script that swaps it with
`mv`), the container keeps reading the old, frozen file and never sees a new line.
Mounting the directory makes the container resolve the log fresh on every read.

Recreate the container after changing these (`docker compose up -d`), a plain
restart won't re-read env or mounts.

That's the whole setup if your reverse proxy runs on the Docker host.

## When the proxy runs on another host

If the proxy is on a different box (an NPMplus LXC, say), the container can't read
its filesystem. Sync the log into `ACCESS_LOG_DIR` on the Docker host first. A
small scp on a timer does it:

```bash
mkdir -p /opt/lg/logs
cat >/opt/lg/pull-access-log.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
scp -q -i /root/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new \
  root@192.168.2.12:/opt/npmplus/nginx/logs/letsgaming_combined.log \
  /opt/lg/logs/access.log.tmp
mv -f /opt/lg/logs/access.log.tmp /opt/lg/logs/access.log
EOF
chmod +x /opt/lg/pull-access-log.sh
```

Run it from a systemd timer every couple of minutes (a `Type=oneshot` service plus
`OnUnitActiveSec=2min`), with `ACCESS_LOG_DIR=/opt/lg/logs` and
`ACCESS_LOG=/logs/access.log`. The `mv` swap is fine here because the directory is
what's mounted, and the ingest tracks its own byte offset, so copying the whole
file each run is fine.

A ready-made version is `scripts/ingest-analytics.sh`, which scp's the log and runs
the CLI in one shot, with `PROXY_HOST`, `PROXY_LOG`, `LOCAL_LOG`, and `OWN_HOST`
overridable by environment.

## Alternative: host-side cron via the CLI

If you'd rather not use the in-process ingest, the CLI still works and doesn't need
`ACCESS_LOG` set. Point it at the log's path inside the container (whatever
`ACCESS_LOG_DIR` mounts):

```bash
docker compose exec server node dist/analytics/cli.js /logs/access.log letsgaming.de
```

Schedule it however you like. It's the same parser and the same idempotent offset
tracking, so mixing it with the in-process ingest won't double-count.

## If traffic stats stay empty

Confirm the server actually sees the log:

```bash
docker compose exec server sh -c 'echo "ACCESS_LOG=[$ACCESS_LOG]"; ls -l "$ACCESS_LOG" 2>&1'
docker compose logs server | grep -i analytics   # expect "access-log ingest scheduled for ..."
```

An empty `ACCESS_LOG` means the value isn't reaching the container: check it's set
in `.env` and that you recreated the container (`docker compose up -d`, not a
restart). A missing file at that path means `ACCESS_LOG_DIR` isn't mounted or
points at the wrong directory. See
[operations/troubleshooting](./troubleshooting.md).

## Seeing the results

View them in the CMS Analytics screen. Preview traffic from the admin is never
counted.
