# Steam — parked

The Steam integration is **parked**. `client.ts` is all that remains: the raw
Steam Web API fetch layer (`fetchSteam` → `SteamRaw`). Nothing in the live site
imports it, and it is **not** registered in `../registry.ts`.

It was trimmed back to this core when playtime moved to Lanyard-observed sessions
plus RAWG for game metadata (which, unlike Steam, covers non-Steam titles). The
fetch plumbing is kept so the integration can be revived later from a known-good
base rather than rebuilt from scratch.

## Why it can't rot

`client.ts` imports **nothing internal** — not `@lg/core`, not `../http`. It has
its own `SteamResult`/`SteamFetchError` and its own small fetch wrapper, so the
rest of the codebase can change its `Result` type, restructure the shared http
client, or rename its errors without touching this file. It stays in the package
build and has a test (`../../tests/steam-client.test.ts`), so a compile break or
a broken request surfaces in CI immediately — parked, not abandoned.

## To revive

1. Write a `Source<SteamRaw, SteamData>` adapter: map `SteamResult` → the app's
   `Result`, and `SteamRaw` → a normalized shape. (The old adapter + icon-colour
   sampler are in git history if you want them back.)
2. Add a normalized output type to `@lg/core` and give the source a `ttl` /
   `SOURCE_TTL` entry and a `SOURCE_LABEL`.
3. Register it in `../registry.ts`, gated on its config (`steamApiKey` + `steamId`).
