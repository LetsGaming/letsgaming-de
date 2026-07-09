# 0013: In-process access-log ingest

**Status:** Accepted · 2026 · supersedes the manual-cron approach

## Context

Traffic analytics come from parsing the reverse-proxy access log. Originally that
ran only as a host-side cron calling the CLI, so if nobody set it up, the top
paths and referrer lists just sat empty. That's a bad default for a self-updating
site.

## Decision

The server ingests a configured `ACCESS_LOG` itself, once at boot and then every 5
minutes. The ingest is incremental and idempotent: it tracks a byte offset in the
store, reads only appended bytes, and resets when the file shrinks on rotation.
Missing or unreadable files degrade quietly rather than crashing. The CLI still
exists for anyone who prefers a host-side cron; both share the same parser and
offset tracking, so they can't double-count.

In Docker this is driven by one variable, `ACCESS_LOG_HOST`, which compose mounts
read-only and maps to the container's `ACCESS_LOG`.

## Consequences

- Traffic stats populate on their own; the CMS shows a hint when no log is
  configured.
- One variable to set, and no edits to the compose file.
- The IP is dropped at parse time and never stored.
- Earlier docs that described analytics as a manual cron are superseded.
