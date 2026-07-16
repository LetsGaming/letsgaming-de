#!/usr/bin/env bash
#
# Pull the reverse-proxy access log from the NPMplus host into the directory the
# server container reads. Schedule on the Docker host, e.g. every 10 minutes:
#
#   */10 * * * *  /apps/letsgaming-de/scripts/ingest-analytics.sh >> /var/log/lg-analytics.log 2>&1
#
# The server ingests /logs itself every 5 minutes (ADR 0013), so this script's only
# job is to put a readable file there. It does not parse anything.
#
# Prereqs:
#   1. SSH key from this host to the proxy host.
#   2. NPMplus mounts /opt/npmplus (host) at /data (container), so the log has TWO
#      names and they are not interchangeable:
#        - nginx writes to the CONTAINER path. In the host's advanced tab:
#              access_log /data/nginx/logs/letsgaming_combined.log combined;
#        - PROXY_LOG below is the HOST path, because scp reads the host's
#          filesystem over SSH:
#              /opt/npmplus/nginx/logs/letsgaming_combined.log
#      Using either path on the wrong side fails as "no such file" while the file
#      plainly exists — the same shape of bug as ACCESS_LOG_DIR vs ACCESS_LOG below.
#   3. mkdir -p /opt/npmplus/nginx/logs on the proxy host FIRST. nginx creates log
#      files, never their directories, and `nginx -t` refuses to start without it.
#
# Env overrides: PROXY_HOST, PROXY_LOG, LOCAL_DIR, LOCAL_LOG, ENV_FILE, OWN_HOST.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-${HERE}/.env}"

# Read ACCESS_LOG_DIR from .env rather than hardcoding a second default.
# This script and the container have to agree on one directory; when they didn't,
# the copy landed somewhere that wasn't mounted and ingest silently saw nothing.
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  ACCESS_LOG_DIR="$(grep -E '^\s*ACCESS_LOG_DIR=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
  ACCESS_LOG="$(grep -E '^\s*ACCESS_LOG=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
fi

PROXY_HOST="${PROXY_HOST:-root@192.168.2.12}"
PROXY_LOG="${PROXY_LOG:-/opt/npmplus/nginx/logs/letsgaming_combined.log}"
LOCAL_DIR="${LOCAL_DIR:-${ACCESS_LOG_DIR:-/opt/lg/logs}}"
# ACCESS_LOG is the path *inside* the container (under /logs); its basename is the
# filename on the host. Deriving it here means the two can't drift.
LOCAL_LOG="${LOCAL_LOG:-${LOCAL_DIR}/$(basename "${ACCESS_LOG:-access.log}")}"

if [[ -z "${ACCESS_LOG_DIR:-}" && -z "${LOCAL_DIR_EXPLICIT:-}" ]]; then
  echo "warn: ACCESS_LOG_DIR not set in ${ENV_FILE}; defaulting to ${LOCAL_DIR}." >&2
  echo "      The server only reads what's mounted at /logs — set it, or ingest sees nothing." >&2
fi

mkdir -p "$LOCAL_DIR"

# scp writes as this user (root, via cron) with root's umask: the result is
# root:root 0600. The server container runs as `node` and cannot read that, so
# the whole pipeline fails on a permission bit with the file sitting right there.
#
# Fix it here rather than on the host, because this script *creates the file every
# run* — a one-off chmod would be undone by the next copy. Nothing else owns this
# file's lifecycle, so nothing else can own its mode.
#
# 0644 is safe: the log is world-readable on a single-tenant host, it's mounted
# read-only, and the IP is dropped at parse time and never stored.
scp -q "${PROXY_HOST}:${PROXY_LOG}" "${LOCAL_LOG}.tmp"
chmod 0644 "${LOCAL_LOG}.tmp"
# Atomic swap so the server never reads a half-copied file. The ingest tracks a
# byte offset and resets when the file shrinks, so a replaced file is fine.
mv -f "${LOCAL_LOG}.tmp" "${LOCAL_LOG}"
chmod 0755 "$LOCAL_DIR"

echo "ok: $(wc -l < "$LOCAL_LOG") line(s) at ${LOCAL_LOG} — the server ingests /logs within 5 min."
