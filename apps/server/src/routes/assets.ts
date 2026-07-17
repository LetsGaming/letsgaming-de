/**
 * Asset library — storage + serving.
 *
 * Upload hashes the bytes (sha256) and de-dupes: the same file is only ever
 * stored once, under `assets/<hash>.<ext>`. Images get a small thumbnail at
 * upload; larger responsive renditions (WebP/AVIF) are derived lazily on first
 * request and cached to `variants/<hash>-w<width>.<fmt>`, so uploads stay fast
 * and the site still gets optimized images. SVGs are sanitized before storage
 * (they're inlined as icons). Markdown assets are fetched raw by the /md/<slug>
 * page. Everything the CMS needs (list/get/update/delete/folders) lives here too.
 */

import type { FastifyInstance } from "fastify";
import type { Store } from "@lg/db";
import {
  ASSET_KINDS,
  classifyAsset,
  isAssetKind,
  parsePost,
  slugify,
  type Asset,
  type AssetKind,
} from "@lg/core";
import { isValidPreviewToken } from "../preview.js";
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile, stat, unlink, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ServerEnv } from "../env.js";
import { requireAuth } from "../auth/guard.js";
import { badRequest, notFound, payloadTooLarge, unsupportedMedia } from "../errors.js";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB (covers PDFs)
const THUMB_WIDTH = 320;
// The only widths we'll ever generate — a fixed menu so a crafted URL can't ask
// us to render thousands of arbitrary sizes.
const ALLOWED_WIDTHS = [320, 640, 960, 1280, 1600] as const;
const ALLOWED_FORMATS = new Set(["webp", "avif"]);
const MIME: Record<string, string> = {
  webp: "image/webp",
  avif: "image/avif",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  md: "text/markdown; charset=utf-8",
};
const ID_RE = /^[A-Za-z0-9_-]+$/;
const HASH_RE = /^[a-f0-9]{64}$/;

/** Strip the obvious script vectors from an SVG before we inline it. */
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/(?:xlink:href|href)\s*=\s*"(?:\s*javascript:|\s*data:text\/html)[^"]*"/gi, "")
    .trim();
}

/** Best-effort intrinsic size for an SVG from viewBox / width+height. */
function svgSize(svg: string): { width?: number; height?: number } {
  const vb = /viewBox\s*=\s*"[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/i.exec(svg);
  if (vb) return { width: Math.round(+vb[1]!), height: Math.round(+vb[2]!) };
  const w = /\bwidth\s*=\s*"([\d.]+)/i.exec(svg);
  const h = /\bheight\s*=\s*"([\d.]+)/i.exec(svg);
  return { ...(w ? { width: Math.round(+w[1]!) } : {}), ...(h ? { height: Math.round(+h[1]!) } : {}) };
}

export async function registerAssetRoutes(
  app: FastifyInstance,
  store: Store,
  env: ServerEnv,
): Promise<void> {
  const base = resolve(env.mediaDir);
  const assetsDir = join(base, "assets");
  const variantsDir = join(base, "variants");
  await mkdir(assetsDir, { recursive: true });
  await mkdir(variantsDir, { recursive: true });

  const guard = { preHandler: requireAuth(env) };
  const origPath = (hash: string, ext: string) => join(assetsDir, `${hash}.${ext}`);
  const variantPath = (hash: string, width: number, fmt: string) =>
    join(variantsDir, `${hash}-w${width}.${fmt}`);

  /** A unique markdown slug derived from a preferred base. */
  const uniqueSlug = (base: string): string => {
    let slug = slugify(base);
    let n = 2;
    while (store.assets.getBySlug(slug)) slug = `${slugify(base)}-${n++}`;
    return slug;
  };

  // ── upload ─────────────────────────────────────────────────────────────────
  app.post("/api/cms/assets", guard, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_BYTES } });
    if (!file) throw badRequest("No file uploaded.");
    const ext = (file.filename.split(".").pop() ?? "").toLowerCase();
    const kind = classifyAsset(file.mimetype, ext);
    if (!kind) throw unsupportedMedia(`Unsupported type ${file.mimetype || ext}.`);

    let buf = await file.toBuffer();
    if (file.file.truncated) throw payloadTooLarge("File too large.");

    // Sanitize SVGs before they ever touch disk (they're inlined on the site).
    if (kind === "svg") buf = Buffer.from(sanitizeSvg(buf.toString("utf8")), "utf8");

    const hash = createHash("sha256").update(buf).digest("hex");
    const existing = store.assets.getByHash(hash);
    if (existing) return existing; // dedupe: identical bytes already stored

    let width: number | undefined;
    let height: number | undefined;
    if (kind === "image" || kind === "gif") {
      try {
        const meta = await sharp(buf, { animated: kind === "gif" }).metadata();
        width = meta.width;
        height = meta.height;
      } catch {
        /* non-fatal; store without dimensions */
      }
    } else if (kind === "svg") {
      ({ width, height } = svgSize(buf.toString("utf8")));
    }

    const storedExt = kind === "markdown" ? "md" : ext || kind;
    await writeFile(origPath(hash, storedExt), buf);

    // Eager thumbnail for the library grid (cheap); larger sizes stay lazy.
    if (kind === "image" || kind === "gif") {
      try {
        const out = await sharp(buf).rotate().resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
        await writeFile(variantPath(hash, THUMB_WIDTH, "webp"), out);
      } catch {
        /* skip thumbnail on failure */
      }
    }

    const id = randomUUID();
    const asset = store.assets.create({
      id,
      hash,
      kind,
      ext: storedExt,
      mime: file.mimetype || MIME[storedExt] || "application/octet-stream",
      bytes: buf.byteLength,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(kind === "markdown" ? { slug: uniqueSlug(file.filename.replace(/\.mde?$/i, "")) } : {}),
      filename: file.filename,
    });
    if (kind === "image" || kind === "gif") store.assets.addVariant(id, { format: "webp", width: THUMB_WIDTH, bytes: 0 });
    return asset;
  });

  // ── serve original (public) ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>("/assets/:id", async (req, reply) => {
    if (!ID_RE.test(req.params.id)) throw notFound("Not found.");
    const a = store.assets.getById(req.params.id);
    if (!a || !HASH_RE.test(a.hash)) throw notFound("Not found.");
    if (a.kind === "markdown" && a.slug) return reply.redirect(`/md/${a.slug}`, 302);
    const full = origPath(a.hash, a.ext);
    try {
      await stat(full);
    } catch {
      throw notFound("Not found.");
    }
    reply.header("Content-Type", a.mime || MIME[a.ext] || "application/octet-stream");
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    if (a.kind === "pdf" || a.kind === "file") {
      reply.header("Content-Disposition", `inline; filename="${a.filename.replace(/"/g, "")}"`);
    }
    return reply.send(createReadStream(full));
  });

  // ── serve a responsive variant, generating + caching on first hit (public) ────
  app.get<{ Params: { id: string; variant: string } }>("/assets/:id/:variant", async (req, reply) => {
    if (!ID_RE.test(req.params.id)) throw notFound("Not found.");
    const m = /^w(\d+)\.(webp|avif)$/.exec(req.params.variant);
    if (!m) throw badRequest("Bad variant.");
    const width = Number(m[1]);
    const fmt = m[2]!;
    if (!ALLOWED_WIDTHS.includes(width as (typeof ALLOWED_WIDTHS)[number]) || !ALLOWED_FORMATS.has(fmt)) {
      throw badRequest("Unsupported size/format.");
    }
    const a = store.assets.getById(req.params.id);
    if (!a || !HASH_RE.test(a.hash)) throw notFound("Not found.");
    if (a.kind !== "image" && a.kind !== "gif") {
      return reply.redirect(`/assets/${a.id}`, 302); // nothing to resize
    }

    const out = variantPath(a.hash, width, fmt);
    try {
      await stat(out); // cache hit
    } catch {
      try {
        const src = await readFile(origPath(a.hash, a.ext));
        const pipeline = sharp(src).rotate().resize({ width, withoutEnlargement: true });
        const buf = await (fmt === "avif" ? pipeline.avif({ quality: 55 }) : pipeline.webp({ quality: 80 })).toBuffer();
        await writeFile(out, buf);
        store.assets.addVariant(a.id, { format: fmt as "webp" | "avif", width, bytes: buf.byteLength });
      } catch {
        throw notFound("Not found.");
      }
    }
    reply.header("Content-Type", MIME[fmt]!);
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
    return reply.send(createReadStream(out));
  });

  // ── markdown raw (public) — the /md/<slug> page renders this in the site shell ─
  app.get<{ Params: { slug: string }; Querystring: { preview?: string } }>(
    "/api/assets/md/:slug",
    async (req, reply) => {
      const a = store.assets.getBySlug(req.params.slug);
      if (!a || a.kind !== "markdown") throw notFound("Not found.");
      const markdown = await readFile(origPath(a.hash, a.ext), "utf8").catch(() => null);
      if (markdown == null) throw notFound("Not found.");

      // Drafts 404 unless the caller has the derived preview token. Leaving them
      // out of the index isn't access control: /md/<slug> is guessable, and an
      // unpublished post is only unpublished if asking for it directly fails.
      // Same 404 as a missing post, so the response can't confirm a draft exists.
      const { frontmatter } = parsePost(markdown, a.slug ?? req.params.slug);
      if (frontmatter.draft) {
        const ok = isValidPreviewToken(
          a.slug ?? req.params.slug,
          env.previewSecret,
          req.query.preview,
        );
        if (!ok) throw notFound("Not found.");
        // A preview is a bearer link to unfinished work; keep it out of caches
        // and out of search.
        void reply.header("cache-control", "private, no-store");
        void reply.header("x-robots-tag", "noindex, nofollow");
      }

      return {
        slug: a.slug,
        title: frontmatter.title || a.title || a.filename.replace(/\.mde?$/i, ""),
        markdown,
        draft: frontmatter.draft,
      };
    },
  );

  // ── management API (authed) ────────────────────────────────────────────────
  app.get<{ Querystring: { folder?: string; tag?: string; kind?: string; q?: string } }>(
    "/api/cms/assets",
    guard,
    async (req) => {
      const q = req.query;
      // A query string is a stranger. `q.kind as AssetKind` asserted it was one of
      // six words; anything else reached the SQL, matched no rows, and showed an
      // empty library with no hint that the filter was the problem. A typo should
      // say so.
      if (q.kind !== undefined && !isAssetKind(q.kind)) {
        throw badRequest(`Unknown asset kind "${q.kind}". Expected one of: ${ASSET_KINDS.join(", ")}.`);
      }
      const assets = store.assets.list({
        ...(q.folder === "root" ? { folderId: null } : q.folder ? { folderId: q.folder } : {}),
        ...(q.tag ? { tag: q.tag } : {}),
        ...(q.kind ? { kind: q.kind } : {}),
        ...(q.q ? { q: q.q } : {}),
      });
      return { assets, folders: store.assets.listFolders(), tags: store.assets.allTags() };
    },
  );

  app.get<{ Params: { id: string } }>("/api/cms/assets/:id", guard, async (req, reply) => {
    const a = store.assets.getById(req.params.id);
    if (!a) throw notFound("Not found.");
    return { ...a, variants: store.assets.listVariants(a.id), usages: store.assets.usagesFor(a.id) };
  });

  /**
   * Rewrite a markdown asset's contents.
   *
   * The library is content-addressed — hash the bytes, dedupe, never store the
   * same file twice. That's exactly right for media: an image is uploaded once
   * and referenced, and two identical uploads are one asset.
   *
   * A post isn't media. It's a document with a stable identity that changes every
   * time you save, and dedupe is meaningless for it — two posts with byte-identical
   * text would be a coincidence, not a saving. So markdown gets an endpoint where
   * the **id** is the identity and the hash is only where the bytes live: rewrite
   * the file, recompute the hash, keep the row. Slugs, usages and links survive an
   * edit, which they wouldn't if editing meant re-uploading.
   *
   * Markdown only. Extending this to images would quietly break the dedupe and
   * variant model that makes the library work.
   */
  app.put<{ Params: { id: string }; Body: { markdown?: string } }>(
    "/api/cms/assets/:id/content",
    guard,
    async (req, reply) => {
      const a = store.assets.getById(req.params.id);
      if (!a) throw notFound("Not found.");
      if (a.kind !== "markdown") throw badRequest("Only markdown assets have editable content.");
      const markdown = req.body?.markdown;
      if (typeof markdown !== "string") throw badRequest("Expected a markdown string.");
      const buf = Buffer.from(markdown, "utf8");
      if (buf.byteLength > MAX_BYTES) throw payloadTooLarge("Too large.");

      const hash = createHash("sha256").update(buf).digest("hex");
      if (hash !== a.hash) {
        await writeFile(origPath(hash, a.ext), buf);
        store.assets.setContent(a.id, hash, buf.byteLength);
        // The old blob is now unreferenced. Left on disk deliberately: deleting it
        // would need a refcount (another asset may share the hash via dedupe), and
        // orphaned bytes are cheaper than a wrong delete. Sweeping them is a
        // maintenance job, not a request handler.
      }
      void reply.code(200);
      return { ...store.assets.getById(a.id)!, markdown };
    },
  );

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/cms/assets/:id",
    guard,
    async (req, reply) => {
      const b = req.body ?? {};
      const patch: Partial<Pick<Asset, "filename" | "alt" | "title" | "caption" | "description" | "folderId">> = {};
      for (const k of ["filename", "alt", "title", "caption", "description"] as const) {
        if (typeof b[k] === "string") patch[k] = b[k] as string;
      }
      if ("folderId" in b) patch.folderId = b.folderId === null ? null : String(b.folderId);
      const updated = store.assets.update(req.params.id, patch);
      if (!updated) throw notFound("Not found.");
      if (Array.isArray(b.tags)) store.assets.setTags(req.params.id, b.tags.map(String));
      return store.assets.getById(req.params.id);
    },
  );

  app.delete<{ Params: { id: string } }>("/api/cms/assets/:id", guard, async (req, reply) => {
    const a = store.assets.getById(req.params.id);
    if (!a) throw notFound("Not found.");
    // Remove derived variants + the original, then the row (usages cascade).
    const files = await readdir(variantsDir).catch(() => []);
    await Promise.all(
      files.filter((f) => f.startsWith(`${a.hash}-`)).map((f) => unlink(join(variantsDir, f)).catch(() => {})),
    );
    await unlink(origPath(a.hash, a.ext)).catch(() => {});
    store.assets.remove(a.id);
    return { ok: true };
  });

  // folders
  app.post<{ Body: { name?: string; parentId?: string | null } }>(
    "/api/cms/assets/folders",
    guard,
    async (req, reply) => {
      const name = (req.body?.name ?? "").trim();
      if (!name) throw badRequest("Folder name required.");
      const id = randomUUID();
      store.assets.createFolder({ id, name, parentId: req.body?.parentId ?? null });
      return { id, name, parentId: req.body?.parentId ?? null };
    },
  );
  app.patch<{ Params: { id: string }; Body: { name?: string; parentId?: string | null } }>(
    "/api/cms/assets/folders/:id",
    guard,
    async (req) => {
      store.assets.updateFolder(req.params.id, req.body ?? {});
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>("/api/cms/assets/folders/:id", guard, async (req) => {
    store.assets.deleteFolder(req.params.id);
    return { ok: true };
  });
}
