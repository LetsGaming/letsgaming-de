import { gameMetaKey, type GameMeta } from "@lg/core";
import type { DatabaseSync } from "node:sqlite";
import { asText, mapRows, type Row } from "./row-mapper.js";

/**
 * Cached game metadata (cover art, genre) resolved from RAWG by name.
 *
 * Keyed by the normalized name (`gameMetaKey`), so a stored row and a lookup agree
 * regardless of the casing/spacing Discord reported. The server's metadata sweep
 * writes it; the resolver reads the whole table into a Map and attaches it to the
 * playtime rows. A row with NULL cover/genre is a real "resolved, nothing found"
 * answer — its presence is what keeps the sweep from re-querying that name.
 */
export function gameMetaRepo(db: DatabaseSync) {
  const upsert = db.prepare(`
    INSERT INTO game_metadata (name, cover_url, genre, resolved_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET
      cover_url = excluded.cover_url,
      genre = excluded.genre,
      resolved_at = excluded.resolved_at
  `);

  return {
    /** The whole cache as a Map, for the resolver. Keys are already normalized. */
    getAll(): Map<string, GameMeta> {
      const map = new Map<string, GameMeta>();
      for (const r of mapRows(db.prepare("SELECT name, cover_url, genre FROM game_metadata"), (row: Row) => ({
        name: asText(row.name),
        coverUrl: row.cover_url == null ? undefined : asText(row.cover_url),
        genre: row.genre == null ? undefined : asText(row.genre),
      }))) {
        map.set(r.name, {
          ...(r.coverUrl ? { coverUrl: r.coverUrl } : {}),
          ...(r.genre ? { genre: r.genre } : {}),
        });
      }
      return map;
    },

    /** Names already resolved (found or not), so the sweep can skip them. */
    resolvedKeys(): Set<string> {
      return new Set(mapRows(db.prepare("SELECT name FROM game_metadata"), (r: Row) => asText(r.name)));
    },

    /** Cache a game's resolved metadata under its normalized name. Idempotent. */
    put(name: string, meta: GameMeta): void {
      upsert.run(gameMetaKey(name), meta.coverUrl ?? null, meta.genre ?? null, new Date().toISOString());
    },
  };
}
