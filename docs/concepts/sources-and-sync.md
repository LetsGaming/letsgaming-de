# Sources and sync

A source is any external integration that feeds the site. There are three today:
GitHub, Steam, and Wakapi. They all sit behind one interface, so adding a fourth
is an adapter plus one line in the registry, and nothing downstream changes.

## The contract

Every source implements `Source<Raw, Normalized>` from
`packages/core/src/source.ts`:

```ts
interface Source<Raw, Normalized> {
  id: string;                        // "github", used as the store key and label
  targetArea?: string;               // default area its modules belong to
  schedule: string;                  // cron-ish interval the worker reads
  fetch(): Promise<Raw>;             // hit the external API
  normalize(raw: Raw): Normalized;   // map to the common shape stored in the DB
}
```

Two properties earn their keep. `fetch` and `normalize` are split so normalization
stays pure and unit-testable, and so a mock can reuse the same `normalize`. And
only the normalized shape ever crosses the store, the API, and the frontend. A raw
API response never leaks past `normalize()`. This is
[ADR-0005](../adr/0005-source-contract.md).

## Real versus mock

The registry (`packages/sources/src/registry.ts`) picks adapters by
configuration, and both the real adapter and its mock emit the same normalized
shape, so the rest of the system can't tell them apart.

- GitHub registers the real GraphQL adapter when `GITHUB_TOKEN` is set, and the
  deterministic mock otherwise, so the site renders end to end offline with zero
  config.
- Steam and Wakapi register the real adapter only when their credentials are set.
  In development (`NODE_ENV` is not `production`) an unconfigured source falls
  back to its mock; in production an unconfigured source is simply absent, and its
  module shows nothing.

Which variables activate which source is in
[reference/configuration](../reference/configuration.md).

## The three normalized shapes

These are the only shapes anything downstream sees. Fields are described here;
the exact types are in `packages/core/src/source.ts`.

GitHub (`GitHubData`): headline `stats` (repo count, commits this year, all-time
commits, longest streak), `languages` by percentage, a per-day `contributions`
array accumulated over time, an `events` feed, and optional `repos`, `pinned`,
`releases`, `mergedPrs`, and `gists`. All-time commits are summed across every
contribution year because GitHub exposes no lifetime total. The `repos` list
drives the Projects section directly (pinned first, then most recently updated)
and enriches curated cards.

Wakapi (`WakapiData`): a human `range` label, `totalSeconds` tracked in that
range, and coding time by `language` as seconds plus percentages. Wakapi is
LAN-only; the worker reaches it over the local network, so nothing is exposed to
the internet.

Steam (`SteamData`): an optional `playing` game if the public profile exposes it,
and a `recent` list (last two weeks, most played first). It powers the "recently
on Steam" part of the presence widget.

## The sync worker

The worker (`apps/server/src/sync/runner.ts`) runs in the same process as the
API. On start it runs every registered source once, then schedules each on its
own interval:

| Source | Interval |
|---|---|
| GitHub | every 6 hours |
| Steam | every 15 minutes |
| Wakapi | every 30 minutes |

Each run is fetch, normalize, persist: append a snapshot to `source_snapshots`
(the archive) and upsert `source_current` (what the site reads). A run never
throws; a failed source is logged and the others carry on, and the site keeps
serving the last good snapshot.

Nothing is fetched on page load. The site only ever reads what a prior sync wrote,
which is what keeps it fresh when nobody touches it for months. To trigger a sync
by hand, see [reference/commands](../reference/commands.md).

## Snapshot versus current

`source_current` is today's snapshot, one row per source, and it's what a page
render reads. `source_snapshots` is the full history, one row per sync. The public
API of a service like GitHub only ever gives you "now", so the archive is how the
site ends up able to say "commits all-time" or "what I was into in 2024". It
accrues from day one onward and can't be reconstructed after the fact, so it's the
thing to back up (see [operations/backups](../operations/backups.md)).

The worker also runs a maintenance pass that rolls old hourly analytics into daily
rows and prunes them, which keeps storage flat over time. That's covered in
[analytics-and-privacy](./analytics-and-privacy.md).
