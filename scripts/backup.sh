#!/usr/bin/env bash
#
# Back up the store volume (SQLite DB + WAL + uploaded media) — the whole archive
# lives here (§10). Run on a schedule on the Docker host, e.g. daily:
#
#   0 3 * * *  /apps/letsgaming-de/scripts/backup.sh >> /var/log/lg-backup.log 2>&1
#
# Restore: stop the stack, then
#   docker run --rm -v letsgaming-de_store:/data -v "$PWD:/b" alpine \
#     sh -c 'rm -rf /data/* && tar xzf /b/store-YYYYMMDD-HHMMSS.tar.gz -C /data'
#
# Usage: backup.sh [VOLUME_NAME] [DEST_DIR] [KEEP]
set -euo pipefail

VOLUME="${1:-letsgaming-de_store}"
DEST="${2:-/opt/letsgaming/backups}"
KEEP="${3:-14}" # how many timestamped archives to retain

mkdir -p "$DEST"
ts="$(date +%Y%m%d-%H%M%S)"
out="store-${ts}.tar.gz"

# Checkpoint the WAL first so the copied .sqlite is as complete as possible, then
# archive the whole volume (db + -wal + -shm + media) for a consistent restore.
docker compose -f "$(dirname "$0")/../docker-compose.yml" exec -T server \
  node -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync(process.env.DB_PATH).exec('PRAGMA wal_checkpoint(TRUNCATE)')" \
  2>/dev/null || echo "warn: WAL checkpoint skipped (server not running?) — archiving as-is"

docker run --rm -v "${VOLUME}:/data:ro" -v "${DEST}:/backup" alpine \
  tar czf "/backup/${out}" -C /data .

# Retention: keep the newest $KEEP archives.
ls -1t "${DEST}"/store-*.tar.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | xargs -r rm -f

echo "backup: ${DEST}/${out} ($(du -h "${DEST}/${out}" | cut -f1))"
