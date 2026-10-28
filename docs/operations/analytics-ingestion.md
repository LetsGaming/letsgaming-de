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

### The last 10 seconds are held back

One classifier rule, `burst-adjacent`, judges a page view by the probe and
not-found lines within 10 seconds on either side of it, so a page view is only
final once those 10 seconds of log exist. Ingest therefore holds back the newest
lines: it stops recording at the first page view whose window is not complete yet
(about 12 seconds of wall clock, 10 plus a 2 second margin), and persists the
byte offset at the start of that line. The next run re-reads from there, so each
line is recorded exactly once. To give a held page view the probes that came
before it, a run also re-reads up to 256 KiB before the saved offset, as context
only; those lines are never recorded twice.

The visible effect is that the dashboard trails the log by up to a few seconds
past the 5 minute schedule, and the newest page view may appear one run later. It
is not a lost line. A log that stops growing settles by itself once the margin has
passed.

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

## Rollups

The dashboard reads pre-aggregated rows, not live sums. The sync worker keeps them
current, with nothing to configure:

| Job | When | Recomputes |
|---|---|---|
| Hourly | every hour at :05 | the current UTC hour and the two before it |
| Daily | 04:10 Europe/Berlin | the last two Berlin days, plus the last 48 hours of hour buckets |
| Catch-up | at server boot | both grains, from where each stopped (from the oldest hourly row on a fresh store) |

Each job recomputes whole buckets, so running one twice, or overlapping a range,
changes nothing. A failure is logged as `[maint] analytics ... rollup FAILED` and
the next run retries. To backfill or repair by hand, run `pnpm analytics:rollup`
(optionally `--from YYYY-MM-DD --to YYYY-MM-DD` for those Berlin days). In Docker
that is `node dist/analytics/rollup-cli.js`. The schema change behind this
(migration `0021`) is reversible: stop the server, copy the database, then
`pnpm db:migrate:down --to <version>`.

## Seeing the results

View them in the CMS Analytics screen. Preview traffic from the admin is never
counted.

### Reading the Traffic quality card

The card walks from the widest count to the narrowest, and each step is a counter,
never a matched request:

- **Requests** is page views + bots + probes. **Scanner probes**, **Bots** and
  **Page views** are the three things a request can be (not-found lines are kept
  as a count but are not requests here).
- **Script loads** is how many page loads ran the tracker. **Beacon coverage** is
  loads divided by page views. A low coverage with a large "page views had no
  script load" note means most logged traffic never ran the script: other bots the
  classifier missed, blockers, or a broken beacon (see the checklist below).
- **Confirmed visits** is loads that showed engagement. **Confirmation rate** is
  confirmed divided by loads. A load that bounces before 5 seconds without
  scrolling, seeing a section or clicking is a load, not a visit.
- **Completed visits** is visits that reported their end, which reads below
  confirmed by design (killed background tabs never fire `pagehide`).
- **Why requests were excluded** lists classifier rule ids (for example
  `probe-wordpress`, `ua-headless`, `burst-adjacent`) by count. A rule that is
  suddenly large is the thing to look at.

"Page views" is the ceiling and "Confirmed visits" the floor. The gap is the point
of the card, not an error.

### "Not measured" after deploy

The `visit` event only exists from the first deploy of the visit model. Before the
first one is recorded (`quality.confirmationSince`, a UTC hour), confirmed visits
and the confirmation rate show **Not measured**, not 0. A range that straddles that
moment says confirmation covers only part of it. This is expected right after the
deploy and fixes itself as days pass; nothing needs to be run. A stuck "not
measured" after traffic has arrived means no `visit` event is reaching the server,
which is the checklist below. Confirmed visits are never estimated from completed
visits.

### If confirmed visits stay at zero or coverage is low

Work through these in order. Pages without a beacon read as page views with no
script load.

1. **API origin.** The browser reaches the API at `PUBLIC_API_URL`, baked into the
   client bundle at build. If it was empty or wrong at build time, the tracker is
   off (`apiBase` is empty) or posts to the wrong host. A same-origin `/api/pulse`
   is not an option on this deployment: it returns 404. Check the built bundle,
   and rebuild the web image with the right `PUBLIC_API_URL` build argument.
2. **Reachability and CORS.** `POST https://<api>/api/pulse` from the site's origin
   should answer `204`. Anything else (a 404, a CORS failure, a 429 from the rate
   limit) means events are dropped.
3. **Tracker blockers.** The endpoint is named neutrally, but a blocker can still
   drop a cross-origin request to the API host. This shows up as low coverage with
   normal-looking traffic.
4. **Do Not Track.** A browser with DNT set sends nothing, by design. (Global
   Privacy Control is not honoured.)
5. **Owner opt-out.** Settings has an analytics opt-out stored in the browser. Your
   own browser may simply be opted out, along with preview frames and automated
   (`navigator.webdriver`) browsers, which never report.


## Clearing is durable, and how

Clearing a range from the CMS deletes the aggregate rows. It cannot delete the
access log — that lives on the NPM host, it is the source these numbers are
derived from, and this server has no business editing it.

The byte offset in `analytics_state` normally stops those lines being read twice.
But the offset resets whenever the file shrinks, and a shrinking file is exactly
what a rotation looks like: one rotation after a clear and the entire current log
is re-read, silently undoing the deletion.

So a clear also records a **watermark** — the hour it happened — and the ingest
drops any line older than it. The deletion then survives a rotation, a re-copy, or
a manual re-run.

Three things worth knowing about it:

- The comparison is strict, so the hour the clear happened in stays ingestible.
  Traffic logged seconds after the click is genuinely newer than the deletion.
- The watermark only moves forward. Clearing "last hour" after "everything"
  doesn't re-open the older window.
- **`analytics:rebuild` lifts it**, deliberately. A rebuild means "re-derive
  everything the log still holds", and that includes whatever was cleared. If you
  clear and then rebuild, it comes back.

## Repairing the aggregates after a rule change

Classification happens at ingest, so rows written before a rule existed keep the
dimension they were given. Two commands, and the difference between them matters:

| Command | What it does | When |
|---|---|---|
| `analytics:reclassify` | Moves stored `path` rows into `probe` where the current rules say so. In place, idempotent, no log needed. | The path list is polluted and you still want the counts. |
| `analytics:rebuild [access.log] [ownHost]` | **Deletes** every log-derived dimension and re-derives them by re-reading the log from byte zero, under the current classifier. | The browser/OS/device/referrer splits are polluted too, or a classifier rule changed. |
| `analytics:rollup [--from YYYY-MM-DD --to YYYY-MM-DD]` | Recomputes the materialized rollups from `analytics_hourly`. With no range it catches both grains up; with a range it recomputes those Berlin days. Idempotent. | Both commands above already finish with a full rollup. Run this on its own to catch up after downtime, or after an interrupted rebuild. |

Both of the first two default their arguments from the server's own config: the log path from
`ACCESS_LOG`, the host from `ANALYTICS_OWN_HOST` (falling back to the `WEB_ORIGIN`
host), so in a configured deployment they take none.

### Running them in Docker

`pnpm analytics:rebuild` is the **development** form. It won't work in the
container: the image is pruned to production dependencies, so there is no `pnpm`,
no `tsx` and no `src/`. What it does have is the compiled output, and these
commands are part of it — so invoke them with plain `node`:

```bash
# Safe form: the in-process ingest can't race the rebuild if the server is down.
docker compose stop server
docker compose run --rm server node dist/analytics/rebuild-cli.js
# Only needed on its own (the rebuild already ends with a full rollup):
docker compose run --rm server node dist/analytics/rollup-cli.js
docker compose start server
```

After a classifier change, the full repair is `analytics:rebuild`, then
`analytics:rollup` if you want to be certain the rollups match (in development
`pnpm analytics:rebuild` followed by `pnpm analytics:rollup`; the rebuild already
runs the same catch-up as its last step, so the second command is a no-op when
nothing was interrupted). Without the rebuild, existing rows keep the verdict they
were given at ingest.

`docker compose run` starts a throwaway container from the same image with the
same volumes, so it sees the same store at `/data` and the same log at `/logs`.
No arguments needed — the log path comes from `ACCESS_LOG`.

The stop/start matters. Analytics are ingested **in-process every 5 minutes**, and
the rebuild works by rewinding the file offset to zero and re-reading. If the
timer fires while that's happening, both readers start from the same rewound
offset and the counts double. Five minutes is a wide enough window to hit.

For the reclassify, which neither rewinds nor deletes, the quick form is fine:

```bash
docker compose exec server node dist/analytics/reclassify-cli.js
```

Reclassify can only fix the dimension it moves, and that is a property of the
storage rather than a shortcoming of the command. A request mistaken for a page
view wrote five rows — `path`, `referrer`, `browser`, `os`, `device` — and the
aggregates record no link between them. Moving the `path` row leaves the other
four behind, which is how a dashboard ends up reporting "Probes: 1,300" and
"Chrome: 863" on a site with forty visitors.

The log is the source of truth and the aggregates are a projection of it, so the
complete repair is to rebuild the projection. **Rebuild deletes before it
re-reads, and it can only restore what the log file still covers** — check what
your rotation keeps first. That includes the day rollups: the rebuild also deletes
the stored rollup rows of the log-derived dimensions, so history older than both
the log and the 90-day hourly retention is not re-derived and does not come back.
Engagement data (sections, clicks, dwell, visits) is
never touched: it comes from the browser beacon, and no log replay can
reconstruct it.

## Pair counters (cross-filtering)

Besides the five page-view dimensions, ingest also counts every pair of them
(path x referrer, path x device, browser x os, and so on: ten pairs) as
dimension `x:<a>:<b>` with the key `<a>\u0001<b>`. That is what lets a filter on
one dimension narrow the others in the CMS. A pair is still an aggregate count of
page views with both values; nothing links it to a visitor.

- **Storage is capped.** One pair dimension keeps at most 300 distinct keys per
  hour (`PAIR_KEY_CAP_PER_HOUR`). Past that, new combinations are dropped for the
  hour and known ones keep counting. The table is bounded by 10 x 300 rows an
  hour whatever the traffic.
- **Pairs are not rolled up.** They live in `analytics_hourly` only and are pruned
  with it, so a filter narrows the other lists within the hourly retention (90
  days by default), not over the full day-rollup history.
- **History needs a rebuild.** Pairs are written as lines are ingested, so traffic
  from before they shipped has none. `analytics:rebuild` drops and re-derives the
  pairs along with the other log dimensions, so it also backfills them for
  whatever the log still holds.
- **Reclassify does not touch pairs.** Run a rebuild after a reclassify if the
  moved paths also need to leave the pair counters.
- **The in-page script cannot be crossed.** A beacon carries no path, referrer or
  device, so the engagement lists stay whole under a filter.
