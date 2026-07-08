import type { Asset, AssetFolder, AssetKind, AssetVariant } from "@lg/core";
import type { DB } from "./database.js";

/** A filter for listing the library. All facets combine (AND). */
export interface AssetQuery {
  folderId?: string | null; // null = root; undefined = any folder
  tag?: string;
  kind?: AssetKind;
  q?: string; // matches filename/title/alt/caption
}

interface AssetRow {
  id: string;
  hash: string;
  kind: AssetKind;
  ext: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  slug: string | null;
  filename: string;
  alt: string | null;
  title: string | null;
  caption: string | null;
  description: string | null;
  folder_id: string | null;
  created_at: string;
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
    (db.prepare("SELECT tag FROM asset_tags WHERE asset_id = ? ORDER BY tag").all(id) as {
      tag: string;
    }[]).map((r) => r.tag);

  const hydrate = (r: AssetRow): Asset => {
    const a: Asset = {
      id: r.id,
      hash: r.hash,
      kind: r.kind,
      ext: r.ext,
      mime: r.mime,
      bytes: r.bytes,
      filename: r.filename,
      folderId: r.folder_id,
      tags: tagsFor(r.id),
      createdAt: r.created_at,
    };
    if (r.width != null) a.width = r.width;
    if (r.height != null) a.height = r.height;
    if (r.slug) a.slug = r.slug;
    if (r.alt) a.alt = r.alt;
    if (r.title) a.title = r.title;
    if (r.caption) a.caption = r.caption;
    if (r.description) a.description = r.description;
    return a;
  };

  const getById = (id: string): Asset | null => {
    const r = db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as AssetRow | undefined;
    return r ? hydrate(r) : null;
  };
  const getByHash = (hash: string): Asset | null => {
    const r = db.prepare("SELECT * FROM assets WHERE hash = ?").get(hash) as AssetRow | undefined;
    return r ? hydrate(r) : null;
  };
  const getBySlug = (slug: string): Asset | null => {
    const r = db.prepare("SELECT * FROM assets WHERE slug = ?").get(slug) as AssetRow | undefined;
    return r ? hydrate(r) : null;
  };

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
      (db.prepare("SELECT DISTINCT tag FROM asset_tags ORDER BY tag").all() as { tag: string }[]).map(
        (r) => r.tag,
      ),

    /** Delete an asset (variants/tags/usages cascade). Returns whether a row went. */
    remove(id: string): boolean {
      const info = db.prepare("DELETE FROM assets WHERE id = ?").run(id) as { changes?: number };
      return (info.changes ?? 0) > 0;
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
      return (db.prepare(sql).all(...args) as unknown as AssetRow[]).map(hydrate);
    },

    // ── folders ──────────────────────────────────────────────────────────────
    listFolders: (): AssetFolder[] =>
      (db.prepare("SELECT id, name, parent_id FROM asset_folders ORDER BY name").all() as {
        id: string;
        name: string;
        parent_id: string | null;
      }[]).map((r) => ({ id: r.id, name: r.name, parentId: r.parent_id })),
    createFolder(folder: AssetFolder) {
      db.prepare("INSERT INTO asset_folders (id, name, parent_id) VALUES (?, ?, ?)").run(
        folder.id,
        folder.name,
        folder.parentId,
      );
    },
    updateFolder(id: string, patch: { name?: string; parentId?: string | null }) {
      const cur = db.prepare("SELECT id, name, parent_id FROM asset_folders WHERE id = ?").get(id) as
        | { id: string; name: string; parent_id: string | null }
        | undefined;
      if (!cur) return;
      db.prepare("UPDATE asset_folders SET name = ?, parent_id = ? WHERE id = ?").run(
        patch.name ?? cur.name,
        patch.parentId === undefined ? cur.parent_id : patch.parentId,
        id,
      );
    },
    /** Delete a folder; children cascade, and assets in it fall back to root. */
    deleteFolder(id: string) {
      db.prepare("DELETE FROM asset_folders WHERE id = ?").run(id);
    },

    // ── image variants (cached derivatives) ────────────────────────────────────
    listVariants: (assetId: string): AssetVariant[] =>
      (db.prepare("SELECT format, width, bytes FROM asset_variants WHERE asset_id = ? ORDER BY width").all(
        assetId,
      ) as unknown as AssetVariant[]),
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
      (db.prepare("SELECT context, label FROM asset_usages WHERE asset_id = ? ORDER BY context").all(
        assetId,
      ) as { context: string; label: string | null }[]).map((r) => ({
        context: r.context,
        ...(r.label ? { label: r.label } : {}),
      })),
    usageCount: (assetId: string): number =>
      (db.prepare("SELECT COUNT(*) AS n FROM asset_usages WHERE asset_id = ?").get(assetId) as {
        n: number;
      }).n,
  };
}

export type AssetsRepo = ReturnType<typeof assetsRepo>;
