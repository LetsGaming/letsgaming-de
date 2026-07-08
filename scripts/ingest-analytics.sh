#!/usr/bin/env bash
#
# Pull the reverse-proxy access log from the NPMplus host and ingest new lines
# into the analytics store (anonymous aggregates; the IP is dropped at parse).
# Schedule on the Docker host, e.g. every 10 minutes:
#
#   */10 * * * *  /apps/letsgaming-de/scripts/ingest-analytics.sh >> /var/log/lg-analytics.log 2>&1
#
# Prereqs: SSH key from this host to the proxy host; the log must be in nginx
# "combined" format (NPMplus host advanced tab: `access_log <path> combined;`);
# and /opt/letsgaming/logs must be mounted into the server container as /logs:ro.
#
# Env overrides: PROXY_HOST, PROXY_LOG, LOCAL_LOG, COMPOSE, OWN_HOST.
set -euo pipefail

PROXY_HOST="${PROXY_HOST:-root@192.168.2.12}"
PROXY_LOG="${PROXY_LOG:-/opt/npmplus/nginx/logs/letsgaming_combined.log}"
LOCAL_DIR="${LOCAL_DIR:-/opt/letsgaming/logs}"
LOCAL_LOG="${LOCAL_LOG:-${LOCAL_DIR}/letsgaming.log}"
COMPOSE="${COMPOSE:-/apps/letsgaming-de/docker-compose.yml}"
OWN_HOST="${OWN_HOST:-letsgaming.de}"

mkdir -p "$LOCAL_DIR"

# scp (works with just SSH — no rsync needed on either host). The ingest tracks
# its own byte offset, so copying the whole file each run is fine.
scp -q "${PROXY_HOST}:${PROXY_LOG}" "${LOCAL_LOG}"

docker compose -f "$COMPOSE" exec -T server \
  node apps/server/dist/analytics/cli.js /logs/"$(basename "$LOCAL_LOG")" "$OWN_HOST"
