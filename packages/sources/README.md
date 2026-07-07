# @lg/sources

Pluggable data-source adapters. Each implements the `Source` contract from
`@lg/core`; adding one is a new adapter + one line in the registry.

- **`github/fetch.ts`** — GitHub GraphQL fetch layer (repos, languages, the
  contribution calendar, all-time commits summed across years) + REST events.
- **`github/index.ts`** — `normalizeGitHub()` (pure) + `githubSource()`.
- **`github/mock.ts`** — deterministic stand-in for dev without a token.
- **`registry.ts`** — `getSources(env)`: real GitHub with a token, mock without.

At launch: GitHub only. The contract exists so the next one is trivial.
