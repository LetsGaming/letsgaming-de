import type { Asset, AssetFolder, AssetKind, AssetVariant } from "@lg/core";
import type { DB } from "./database.js";
import {
  asNullableText,
  asNumber,
  asText,
  mapRow,
  mapRows,
  type Row,
} from "./row-mapper.js";

/** A filter for listing the library. All facets combine (AND). */
export interface AssetQuery {
  folderId?: string | null; // null = root; undefined = any folder
  tag?: string;
  kind?: AssetKind;
  q?: string; // matches filename/title/alt/caption
}

/** Fields a caller may create an asset with (id/hash/kind are intrinsic). */
export type NewAsset = Omit<Asset, "tags" | "createdAt"> & { tags?: string[]; createdAt?: string };

/**
 * The asset library repository. Identity is the content hash: creating an asset
 * whose hash already exists returns the existing one, so the same bytes are only
 * ever stored (and rowed) once. Metadata, folders, tags, cached image variants,
 * and usage back-references all hang off the asset id.
 */
export function assetsRepo(db: DB) {
  const tagsFor = (id: string): string[] =>
    mapRows(
      db.prepare("SELECT tag FROM asset_tags WHERE asset_id = ? ORDER BY tag"),
      (r) => asText(r.tag),
      id,
    );

  /** Build an Asset from a raw row, attaching its tags. The one place columns
   *  become a domain Asset — optional fields are only set when present. */
  const toAsset = (r: Row): Asset => {
    const a: Asset = {
      id: asText(r.id),
      hash: asText(r.hash),
      kind: asText(r.kind) as AssetKind,
      ext: asText(r.ext),
      mime: asText(r.mime),
      bytes: asNumber(r.bytes),
      filename: asText(r.filename),
      folderId: asNullableText(r.folder_id),
      tags: tagsFor(asText(r.id)),
      createdAt: asText(r.created_at),
    };
    if (r.width != null) a.width = asNumber(r.width);
    if (r.height != null) a.height = asNumber(r.height);
    if (r.slug) a.slug = asText(r.slug);
    if (r.alt) a.alt = asText(r.alt);
    if (r.title) a.title = asText(r.title);
    if (r.caption) a.caption = asText(r.caption);
    if (r.description) a.description = asText(r.description);
    return a;
  };

  const getById = (id: string): Asset | null =>
    mapRow(db.prepare("SELECT * FROM assets WHERE id = ?"), toAsset, id) ?? null;
  const getByHash = (hash: string): Asset | null =>
    mapRow(db.prepare("SELECT * FROM assets WHERE hash = ?"), toAsset, hash) ?? null;
  const getBySlug = (slug: string): Asset | null =>
    mapRow(db.prepare("SELECT * FROM assets WHERE slug = ?"), toAsset, slug) ?? null;

  const setTags = (id: string, tags: string[]) => {
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM asset_tags WHERE asset_id = ?").run(id);
      const ins = db.prepare("INSERT OR IGNORE INTO asset_tags (asset_id, tag) VALUES (?, ?)");
      for (const t of [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]) {
        ins.run(id, t);
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  };

  return {
    getById,
    getByHash,
    getBySlug,

    /**
     * Create an asset, or return the existing one if the hash already exists
     * (dedupe). The caller is expected to have written the bytes to disk keyed
     * by hash, so a dedupe hit means the file is already there.
     */
    create(input: NewAsset): Asset {
      const existing = getByHash(input.hash);
      if (existing) return existing;
      db.prepare(
        `INSERT INTO assets
           (id, hash, kind, ext, mime, bytes, width, height, slug, filename, alt, title,
            caption, description, folder_id, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        input.id,
        input.hash,
        input.kind,
        input.ext,
        input.mime,
        input.bytes,
        input.width ?? null,
        input.height ?? null,
        input.slug ?? null,
        input.filename,
        input.alt ?? null,
        input.title ?? null,
        input.caption ?? null,
        input.description ?? null,
        input.folderId ?? null,
        input.createdAt ?? new Date().toISOString(),
      );
      if (input.tags?.length) setTags(input.id, input.tags);
      return getById(input.id)!;
    },

    /** Patch metadata (only provided fields change). */
    update(
      id: string,
      patch: Partial<
        Pick<Asset, "filename" | "alt" | "title" | "caption" | "description" | "folderId" | "slug">
      >,
    ): Asset | null {
      const cur = getById(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      db.prepare(
        `UPDATE assets SET filename=?, alt=?, title=?, caption=?, description=?, folder_id=?, slug=?
         WHERE id=?`,
      ).run(
        next.filename,
        next.alt ?? null,
        next.title ?? null,
        next.caption ?? null,
        next.description ?? null,
        next.folderId ?? null,
        next.slug ?? null,
        id,
      );
      return getById(id);
    },

    setTags,
    allTags: (): string[] =>
      mapRows(db.prepare("SELECT DISTINCT tag FROM asset_tags ORDER BY tag"), (r) => asText(r.tag)),

    /** Delete an asset (variants/tags/usages cascade). Returns whether a row went. */
    remove(id: string): boolean {
      return Number(db.prepare("DELETE FROM assets WHERE id = ?").run(id).changes) > 0;
    },

    /** List assets, newest first, filtered by folder/tag/kind/search. */
    list(query: AssetQuery = {}): Asset[] {
      const where: string[] = [];
      const args: (string | number)[] = [];
      if (query.folderId === null) where.push("a.folder_id IS NULL");
      else if (query.folderId !== undefined) (where.push("a.folder_id = ?"), args.push(query.folderId));
      if (query.kind) (where.push("a.kind = ?"), args.push(query.kind));
      if (query.tag) {
        where.push("a.id IN (SELECT asset_id FROM asset_tags WHERE tag = ?)");
        args.push(query.tag.toLowerCase());
      }
      if (query.q) {
        where.push("(a.filename LIKE ? OR a.title LIKE ? OR a.alt LIKE ? OR a.caption LIKE ?)");
        const like = `%${query.q}%`;
        args.push(like, like, like, like);
      }
      const sql =
        "SELECT a.* FROM assets a" +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        " ORDER BY a.created_at DESC, a.id DESC";
      return mapRows(db.prepare(sql), toAsset, ...args);
    },

    // ── folders ──────────────────────────────────────────────────────────────
    listFolders: (): AssetFolder[] =>
      mapRows(db.prepare("SELECT id, name, parent_id FROM asset_folders ORDER BY name"), (r) => ({
        id: asText(r.id),
        name: asText(r.name),
        parentId: asNullableText(r.parent_id),
      })),
    createFolder(folder: AssetFolder) {
      db.prepare("INSERT INTO asset_folders (id, name, parent_id) VALUES (?, ?, ?)").run(
        folder.id,
        folder.name,
        folder.parentId,
      );
    },
    updateFolder(id: string, patch: { name?: string; parentId?: string | null }) {
      const cur = mapRow(
        db.prepare("SELECT id, name, parent_id FROM asset_folders WHERE id = ?"),
        (r) => ({ name: asText(r.name), parentId: asNullableText(r.parent_id) }),
        id,
      );
      if (!cur) return;
      db.prepare("UPDATE asset_folders SET name = ?, parent_id = ? WHERE id = ?").run(
        patch.name ?? cur.name,
        patch.parentId === undefined ? cur.parentId : patch.parentId,
        id,
      );
    },
    /** Delete a folder; children cascade, and assets in it fall back to root. */
    deleteFolder(id: string) {
      db.prepare("DELETE FROM asset_folders WHERE id = ?").run(id);
    },

    // ── image variants (cached derivatives) ────────────────────────────────────
    listVariants: (assetId: string): AssetVariant[] =>
      mapRows(
        db.prepare(
          "SELECT format, width, bytes FROM asset_variants WHERE asset_id = ? ORDER BY width",
        ),
        (r) => ({
          format: asText(r.format) as AssetVariant["format"],
          width: asNumber(r.width),
          bytes: asNumber(r.bytes),
        }),
        assetId,
      ),
    hasVariant: (assetId: string, format: string, width: number): boolean =>
      !!db
        .prepare("SELECT 1 FROM asset_variants WHERE asset_id = ? AND format = ? AND width = ?")
        .get(assetId, format, width),
    addVariant(assetId: string, v: AssetVariant) {
      db.prepare(
        `INSERT INTO asset_variants (asset_id, format, width, bytes) VALUES (?, ?, ?, ?)
         ON CONFLICT(asset_id, format, width) DO UPDATE SET bytes = excluded.bytes`,
      ).run(assetId, v.format, v.width, v.bytes);
    },

    // ── usage tracking (powers "used in" + delete warning) ─────────────────────
    /** Replace all usages recorded for a context with the given asset ids. */
    recordUsage(context: string, entries: { assetId: string; label?: string }[]) {
      db.exec("BEGIN");
      try {
        db.prepare("DELETE FROM asset_usages WHERE context = ?").run(context);
        const ins = db.prepare(
          "INSERT OR IGNORE INTO asset_usages (asset_id, context, label) VALUES (?, ?, ?)",
        );
        for (const e of entries) ins.run(e.assetId, context, e.label ?? null);
        db.exec("COMMIT");
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    clearUsageContext(context: string) {
      db.prepare("DELETE FROM asset_usages WHERE context = ?").run(context);
    },
    usagesFor: (assetId: string): { context: string; label?: string }[] =>
      mapRows(
        db.prepare(
          "SELECT context, label FROM asset_usages WHERE asset_id = ? ORDER BY context",
        ),
        (r) => {
          const label = asNullableText(r.label);
          return { context: asText(r.context), ...(label ? { label } : {}) };
        },
        assetId,
      ),
    usageCount: (assetId: string): number =>
      mapRow(
        db.prepare("SELECT COUNT(*) AS n FROM asset_usages WHERE asset_id = ?"),
        (r) => asNumber(r.n),
        assetId,
      ) ?? 0,
  };
}

export type AssetsRepo = ReturnType<typeof assetsRepo>;
