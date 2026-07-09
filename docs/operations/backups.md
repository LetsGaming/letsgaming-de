# Backups

Back up the `store` volume. It holds the SQLite file (the archive, whose
accumulated history can't be re-fetched) and the uploaded media and cached
variants. Everything else is rebuildable from the repo, so this one volume is the
whole backup.

Why the archive matters: the public API of a source like GitHub only ever returns
"now". The store keeps every sync, so it accrues all-time totals and long-range
trends that can't be reconstructed after the fact. Lose the volume and you lose
that history, not the site. See
[concepts/sources-and-sync](../concepts/sources-and-sync.md).

## The script

`scripts/backup.sh` checkpoints the WAL first (so the copied `.sqlite` is as
complete as possible), then archives the whole volume, and keeps the newest N
archives:

```bash
# Usage: backup.sh [VOLUME_NAME] [DEST_DIR] [KEEP]
scripts/backup.sh
```

Defaults: volume `letsgaming-de_store`, destination `/opt/letsgaming/backups`,
keep the last 14. Run it on a schedule on the Docker host, for example daily:

```cron
0 3 * * *  /apps/letsgaming-de/scripts/backup.sh >> /var/log/lg-backup.log 2>&1
```

## By hand

If you just want a one-off archive without the script:

```bash
docker run --rm -v letsgaming-de_store:/data -v "$PWD":/backup alpine \
  tar czf /backup/store-$(date +%F).tar.gz -C /data .
```

Check the volume name with `docker volume ls`; Compose prefixes it with the
project directory name.

## Restore

Stop the stack first, then unpack an archive back into the volume:

```bash
docker compose down
docker run --rm -v letsgaming-de_store:/data -v "$PWD":/b alpine \
  sh -c 'rm -rf /data/* && tar xzf /b/store-YYYYMMDD-HHMMSS.tar.gz -C /data'
docker compose up -d
```
