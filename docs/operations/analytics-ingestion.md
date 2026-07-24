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
its filesystem. Sync the log into `ACCESS_LOG_DIR` on the Docker host first.

**Use `scripts/ingest-analytics.sh`.** It scp's the log in and puts it where the
container reads it. It does not parse anything — the server ingests `/logs` itself
every 5 minutes (ADR 0013), so this script's only job is to put a *readable* file
there.

```bash
# on the Docker host, once: an SSH key to the proxy, and the two env vars
#   ACCESS_LOG_DIR=/opt/lg/logs     (the HOST directory, mounted at /logs)
#   ACCESS_LOG=/logs/access.log     (the path INSIDE the container)
*/10 * * * *  /apps/letsgaming-de/scripts/ingest-analytics.sh >> /var/log/lg-analytics.log 2>&1
```

`PROXY_HOST`, `PROXY_LOG`, `LOCAL_DIR`, `LOCAL_LOG` and `ENV_FILE` are overridable
by environment; everything else it reads from `.env`, so the script and the
container can't disagree about which directory they mean.

### Don't hand-roll the copy

This section used to print a two-line scp snippet to paste into your own
`/opt/lg/pull-access-log.sh`, and mention the shipped script afterwards as an
alternative. The snippet was missing the only line that matters:

```bash
scp -q root@proxy:/…/letsgaming_combined.log /opt/lg/logs/access.log.tmp
mv -f /opt/lg/logs/access.log.tmp /opt/lg/logs/access.log   # ← and nothing else
```

`scp` propagates the source file's mode, and an nginx access log is `0640`. The
container runs as `node` (see `apps/server/Dockerfile`), so the copy lands
unreadable — the scp succeeds, the `mv` succeeds, the file is *right there* with
the right name and the right contents, and ingest reads nothing, for ever, with no
error anywhere. `ingest-analytics.sh` exists for that one line; it `chmod 0644`s
before the atomic `mv`, and since the file is recreated every run, it is the only
thing that *can* own the mode. A host-side `chmod`, a `chgrp adm`, a
`group_add: ["4"]` in compose — each fixes a file that the next copy replaces, so
each works exactly once and then stops with nothing having changed.

If you already followed the old snippet: point the timer at
`scripts/ingest-analytics.sh` instead and delete `pull-access-log.sh`. The script
now verifies the mode it just set and fails loudly rather than printing `ok`, so
you'll know on the next run either way.

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


## Repairing the aggregates after a rule change

Classification happens at ingest, so rows written before a rule existed keep the
dimension they were given. Two commands, and the difference between them matters:

| Command | What it does | When |
|---|---|---|
| `pnpm analytics:reclassify` | Moves stored `path` rows into `probe` where the current rules say so. In place, idempotent, no log needed. | The path list is polluted and you still want the counts. |
| `pnpm analytics:rebuild <access.log> [ownHost]` | **Deletes** every log-derived dimension and re-derives them by re-reading the log from byte zero. | The browser/OS/device/referrer splits are polluted too. |

Reclassify can only fix the dimension it moves, and that is a property of the
storage rather than a shortcoming of the command. A request mistaken for a page
view wrote five rows — `path`, `referrer`, `browser`, `os`, `device` — and the
aggregates record no link between them. Moving the `path` row leaves the other
four behind, which is how a dashboard ends up reporting "Probes: 1,300" and
"Chrome: 863" on a site with forty visitors.

The log is the source of truth and the aggregates are a projection of it, so the
complete repair is to rebuild the projection. **Rebuild deletes before it
re-reads, and it can only restore what the log file still covers** — check what
your rotation keeps first. Engagement data (sections, clicks, dwell, visits) is
never touched: it comes from the browser beacon, and no log replay can
reconstruct it.
