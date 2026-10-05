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

  const noteImage = db.prepare(`
    INSERT INTO game_images (name, application_id, large_image)
    VALUES (?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET
      application_id = excluded.application_id,
      large_image = COALESCE(excluded.large_image, game_images.large_image)
  `);

  return {
    /** The whole cache as a Map, for the resolver. Keys are already normalized. A
     *  Discord-resolved image fills in the cover for games RAWG has none for. */
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
      for (const r of mapRows(
        db.prepare("SELECT name, image_url FROM game_images WHERE image_url IS NOT NULL"),
        (row: Row) => ({ name: asText(row.name), imageUrl: asText(row.image_url) }),
      )) {
        const existing = map.get(r.name);
        if (existing?.coverUrl) continue;
        map.set(r.name, { ...existing, coverUrl: r.imageUrl });
      }
      return map;
    },

    /** Remember the Discord application behind a game, as seen on an activity.
     *  Idempotent; never touches an already resolved image. */
    noteApplication(name: string, applicationId: string, largeImage?: string): void {
      noteImage.run(gameMetaKey(name), applicationId, largeImage ?? null);
    },

    /** Games with an application id and no resolved image whose last attempt is
     *  missing or older than `retryBeforeIso`. */
    pendingImages(retryBeforeIso: string): { name: string; applicationId: string; largeImage?: string }[] {
      return mapRows(
        db.prepare(`
          SELECT name, application_id, large_image FROM game_images
          WHERE application_id IS NOT NULL AND image_url IS NULL
            AND (checked_at IS NULL OR checked_at < ?)
        `),
        (r: Row) => ({
          name: asText(r.name),
          applicationId: asText(r.application_id),
          ...(r.large_image == null ? {} : { largeImage: asText(r.large_image) }),
        }),
        retryBeforeIso,
      );
    },

    /** Persist the first working image URL for a game, or stamp a miss (`null`) so
     *  it is retried only after the retry window. */
    putImage(name: string, imageUrl: string | null, nowIso: string): void {
      db.prepare("UPDATE game_images SET image_url = ?, checked_at = ? WHERE name = ?").run(
        imageUrl,
        nowIso,
        gameMetaKey(name),
      );
    },

    /** Every game with a recorded Discord application, for diagnostics. */
    imageRows(): {
      name: string;
      applicationId: string | null;
      largeImage: string | null;
      imageUrl: string | null;
      checkedAt: string | null;
    }[] {
      return mapRows(
        db.prepare("SELECT name, application_id, large_image, image_url, checked_at FROM game_images ORDER BY name"),
        (r: Row) => ({
          name: asText(r.name),
          applicationId: r.application_id == null ? null : asText(r.application_id),
          largeImage: r.large_image == null ? null : asText(r.large_image),
          imageUrl: r.image_url == null ? null : asText(r.image_url),
          checkedAt: r.checked_at == null ? null : asText(r.checked_at),
        }),
      );
    },

    /** Forget recorded misses so the next sweep looks those games up again. Games
     *  that already have an image are untouched. Returns how many were reset. */
    resetMisses(): number {
      const res = db
        .prepare("UPDATE game_images SET checked_at = NULL WHERE image_url IS NULL AND checked_at IS NOT NULL")
        .run();
      return Number(res.changes);
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
