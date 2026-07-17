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
# Env overrides: PROXY_HOST, PROXY_LOG, LOCAL_DIR, LOCAL_LOG, ENV_FILE.
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

if [[ -z "${ACCESS_LOG_DIR:-}" ]]; then
  echo "warn: ACCESS_LOG_DIR not set in ${ENV_FILE}; defaulting to ${LOCAL_DIR}." >&2
  echo "      The server only reads what's mounted at /logs — set it, or ingest sees nothing." >&2
fi


# scp writes as this user (root, via cron) with root's umask, and the source log
# is typically root:adm 0640 — either way the result is not readable by the
# container, which runs as `node` (see apps/server/Dockerfile). The whole pipeline
# then fails on a permission bit with the file sitting right there.
#
# Fix it here rather than on the host, because this script *creates the file every
# run* — a one-off `chmod`/`chgrp` on the host is undone by the next copy, which
# reads as "it worked once and broke itself", the least debuggable shape a problem
# has. Nothing else owns this file's lifecycle, so nothing else can own its mode.
# Do not add `group_add` to docker-compose to work around this; it grants the
# container a host group for a file this script recreates, so it fixes the symptom
# on a file that no longer exists by the next run.
#
# 0644 is safe: the log is world-readable on a single-tenant host, it's mounted
# read-only, and the IP is dropped at parse time and never stored.
mkdir -p "$LOCAL_DIR"
chmod 0755 "$LOCAL_DIR"
scp -q "${PROXY_HOST}:${PROXY_LOG}" "${LOCAL_LOG}.tmp"
chmod 0644 "${LOCAL_LOG}.tmp"
# Atomic swap so the server never reads a half-copied file. The ingest tracks a
# byte offset and resets when the file shrinks, so a replaced file is fine.
mv -f "${LOCAL_LOG}.tmp" "${LOCAL_LOG}"

# Check the one thing this script exists to guarantee, instead of assuming it.
#
# The job above is "put a *readable* file there", and until now the script printed
# "ok" without ever asking whether it had. Every mode bug in this pipeline has had
# the same shape: the file is present, the copy succeeded, the exit code is 0, and
# the container can't read a byte — so success and failure looked identical from
# the host, which is where you're standing when you run this.
#
# The test is the world bits, not a uid: the container's user is the image's
# business (`node`, uid 1000 today), and a file this script can prove is readable
# by *anyone* is readable by whoever that turns out to be. Same for the directory's
# x bit — a 0644 file in a 0750 directory is unreadable, and the file's own mode
# looks perfect while it is.
assert_world_readable() {
  local path="$1" bit="$2" what="$3"
  local mode
  mode="$(stat -c '%a' "$path")"
  if (( (8#$mode & bit) == 0 )); then
    echo "FAIL: ${path} is mode ${mode} ($(stat -c '%U:%G' "$path")) — ${what}" >&2
    echo "      The server container runs as \`node\`, not root, and cannot read it." >&2
    echo "      The copy succeeded; the ingest will still see nothing. Fix the mode" >&2
    echo "      here (this script recreates the file every run), not on the host." >&2
    return 1
  fi
}
assert_world_readable "$LOCAL_DIR" 1 "the container can't traverse into it (needs o+x)"
assert_world_readable "$LOCAL_LOG" 4 "the container can't read it (needs o+r)"

echo "ok: $(wc -l < "$LOCAL_LOG") line(s) at ${LOCAL_LOG}, readable by the container — ingests within 5 min."
