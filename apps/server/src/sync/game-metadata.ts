import { gameMetaKey, PLAYTIME_WINDOW_DAYS } from "@lg/core";
import { normalizeRawgGame, searchRawgGame, type RawgConfig } from "@lg/sources";
import type { Store } from "@lg/db";

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

/**
 * Resolve game metadata (cover art, genre) for the games on the playtime shelf.
 *
 * The shelf is `playtime("game", window)`, so those are exactly the names worth a
 * lookup. Only names not already in the cache are queried — a resolved row, even an
 * empty "RAWG had nothing" one, is skipped — so the sweep converges to zero RAWG
 * calls once it's caught up and stays there (metadata doesn't change). A failed
 * lookup is left for the next run; a successful one is cached whether or not RAWG
 * knew the game. Returns how many names it newly resolved.
 */
export async function resolveGameMetadata(
  store: Store,
  config: RawgConfig,
  log: (m: string) => void = () => {},
): Promise<number> {
  const names = store.sessions.playtime("game", isoDaysAgo(PLAYTIME_WINDOW_DAYS)).map((e) => e.name);
  const done = store.gameMeta.resolvedKeys();

  let resolved = 0;
  for (const name of names) {
    if (done.has(gameMetaKey(name))) continue;
    const res = await searchRawgGame(name, config);
    if (!res.ok) {
      log(`[rawg] lookup failed for ${JSON.stringify(name)}: ${res.error.message}`);
      continue;
    }
    store.gameMeta.put(name, res.value ? normalizeRawgGame(res.value) : {});
    resolved++;
  }
  if (resolved) log(`[rawg] resolved metadata for ${resolved} game(s)`);
  return resolved;
}
