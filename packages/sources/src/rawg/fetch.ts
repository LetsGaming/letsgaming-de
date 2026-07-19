/**
 * RAWG fetch layer (rawg.io Video Games Database API).
 *
 * Unlike the Steam integration this replaced, RAWG is cross-platform — it resolves
 * a bare game *name* (which is all Discord/Lanyard gives us) to cover art and a
 * genre for any title, not just Steam ones. A single API key, passed as a query
 * param; runs server-side during the metadata sweep. Kept separate from
 * `normalize` so the mapping stays testable without a network.
 */

import { err, ok, type Result } from "@lg/core";
import { fetchJson } from "../http.js";

export interface RawgConfig {
  /** RAWG API key (free tier). */
  apiKey: string;
  /** Injectable fetch, for tests. */
  fetchImpl?: typeof fetch;
}

/** The slice of a RAWG game record we use. RAWG returns far more; this is all the
 *  metadata cache needs. */
export interface RawgGame {
  name: string;
  slug?: string;
  /** Cover image URL on RAWG's CDN (`media.rawg.io`). Nullable in RAWG's schema. */
  background_image?: string | null;
  genres?: { name: string }[];
}

interface RawgSearchResponse {
  results?: RawgGame[];
}

const HOST = "https://api.rawg.io/api";

/**
 * Search RAWG for a game by name, returning the top match (or null if none).
 *
 * `search_precise` biases toward exact-name hits over fuzzy ones — the sampler
 * hands over the name Discord detected, which is usually the real title, so a
 * precise match is what's wanted. Returns a typed Result: a down/slow RAWG is
 * expected, and the sweep degrades (leaves the name unresolved, retries next run)
 * rather than throwing.
 */
export async function searchRawgGame(name: string, config: RawgConfig): Promise<Result<RawgGame | null>> {
  const key = encodeURIComponent(config.apiKey);
  const q = encodeURIComponent(name);
  const opts = config.fetchImpl ? { fetchImpl: config.fetchImpl } : {};
  const res = await fetchJson<RawgSearchResponse>(
    `${HOST}/games?key=${key}&search=${q}&search_precise=true&page_size=1`,
    opts,
  );
  if (!res.ok) return err(res.error);
  return ok(res.value.results?.[0] ?? null);
}
