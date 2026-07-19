/**
 * The RAWG adapter — maps a raw RAWG game to our small {@link GameMeta} shape.
 *
 * This is not a `Source`: sources produce one whole-integration snapshot per sync,
 * but game metadata is a per-name lookup keyed by game title, resolved lazily for
 * whatever the sampler has seen. So it's a pair of functions the server's metadata
 * sweep calls, not a registered source.
 */

import type { GameMeta } from "@lg/core";
import type { RawgGame } from "./fetch.js";

/** Map a RAWG game to the cached metadata shape. Pure. Missing fields are simply
 *  absent — a game with no cover art or no genre in RAWG is a real answer, and the
 *  UI falls back to a monogram / no subtitle. */
export function normalizeRawgGame(game: RawgGame): GameMeta {
  return {
    ...(game.background_image ? { coverUrl: game.background_image } : {}),
    ...(game.genres?.[0]?.name ? { genre: game.genres[0].name } : {}),
  };
}
