# @lg/sources

Pluggable data-source adapters. Each implements the `Source` contract from
`@lg/core`; adding one is a new adapter plus one line in the registry.

| Path | Role |
|---|---|
| `github/` | GitHub GraphQL fetch (repos, languages, the contribution calendar, all-time commits) + REST events, `normalizeGitHub()`, and a deterministic mock. |
| `steam/` | Steam Web API (currently playing, recently played) + mock. |
| `wakapi/` | Self-hosted Wakapi coding time by language (LAN-only) + mock. |
| `registry.ts` | `getSources(env)`: real adapters when configured, mocks in dev. |

Three sources today, each behind one contract. See
[`docs/concepts/sources-and-sync.md`](../../docs/concepts/sources-and-sync.md).
