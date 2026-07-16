/**
 * Asset library (media manager). A central, reusable set of files on local disk,
 * referenced from anywhere on the site by a stable id. Identity is the content
 * hash — uploading the same bytes twice yields the same asset (dedupe). Images
 * get optimized, responsive variants derived lazily on first request; other
 * kinds (pdf, markdown, arbitrary files, inline SVG) are served/rendered per
 * their kind. This module holds the pure types and the reference format shared
 * by the server (storage/serving), the resolver (expansion), and the CMS (UI).
 */

/** What a stored asset is — drives processing and how a reference renders. */
export type AssetKind = "image" | "svg" | "gif" | "pdf" | "markdown" | "file";

/** A derived, cached rendition of an image asset (one width in one format). */
export interface AssetVariant {
  format: "webp" | "avif";
  width: number;
  bytes: number;
}

/** A reusable library asset. `hash` is the dedupe key; `id` is the reference. */
export interface Asset {
  id: string;
  /** sha256 of the original bytes — one asset per distinct file. */
  hash: string;
  kind: AssetKind;
  /** Original extension without the dot, e.g. "png", "pdf", "md", "svg". */
  ext: string;
  mime: string;
  /** Original file size in bytes. */
  bytes: number;
  /** Intrinsic pixel size for raster/vector images (absent for pdf/md/file). */
  width?: number;
  height?: number;
  /** Public slug for markdown assets rendered at /md/<slug> (absent otherwise). */
  slug?: string;
  /** Original upload filename, kept for display. */
  filename: string;
  alt?: string;
  title?: string;
  caption?: string;
  description?: string;
  /** Containing folder, or null at the library root. */
  folderId?: string | null;
  tags: string[];
  createdAt: string;
}

/** A folder in the library tree (folders + tags both organize the library). */
export interface AssetFolder {
  id: string;
  name: string;
  parentId: string | null;
}

/** A place an asset is referenced — powers "used in" and the delete warning. */
export interface AssetUsage {
  /** Stable context key, e.g. "gallery:travel", "hero", "link:github", "md:about". */
  context: string;
  /** Human label for the CMS list. */
  label?: string;
}

/** Accepted upload kinds, mapped from a mime type (with an extension fallback). */
export function classifyAsset(mime: string, ext: string): AssetKind | null {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (mime === "image/svg+xml" || e === "svg") return "svg";
  if (mime === "image/gif" || e === "gif") return "gif";
  if (mime === "application/pdf" || e === "pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime === "text/markdown" || e === "md" || e === "markdown") return "markdown";
  if (mime === "text/plain" && (e === "md" || e === "markdown")) return "markdown";
  // Everything else we still allow, but as a plain downloadable file.
  if (mime && (e === "txt" || e === "csv" || e === "json" || e === "zip")) return "file";
  return null;
}

/** True for kinds that have pixel dimensions and can produce image variants. */
export function isRaster(kind: AssetKind): boolean {
  return kind === "image" || kind === "gif";
}

// ── reference format ────────────────────────────────────────────────────────
// Content stores an opaque pointer, `asset:<id>`, never a path. The resolver
// expands it per surface at read time, so moving/optimizing files never breaks
// references and the client only ever sees resolved output.

const ASSET_REF = /^asset:([A-Za-z0-9_-]+)$/;

export function assetRef(id: string): string {
  return `asset:${id}`;
}

/** Extract the asset id from a reference, or null if the value isn't one. */
export function parseAssetRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = ASSET_REF.exec(ref);
  return m ? m[1]! : null;
}

/** A slug safe for /md/<slug> — lowercase, hyphenated, ascii. */
/**
 * Slug for a markdown asset's public URL.
 *
 * Path-aware: `/` separates segments and survives, so a slug can namespace a
 * markdown asset under a subpath — `blog/my-post` renders at `/md/blog/my-post`.
 * Each segment is slugified independently; empty segments collapse, so `//` and
 * a trailing `/` can't produce an empty path component.
 *
 * The slug *is* the path rather than being assembled from the asset's folder at
 * read time: one field, one uniqueness constraint, and `getBySlug` stays an exact
 * match. The CMS can still default the prefix from the folder — that's a UI
 * convenience, not a storage decision.
 */
export function slugify(input: string): string {
  return input
    .split("/")
    .map((segment) =>
      segment
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean)
    .join("/") || "untitled";
}

// ── resolution (ref → client-ready view) ─────────────────────────────────────
// The server resolves each `asset:<id>` reference into a small, fully-formed
// view the client renders directly — an image becomes a <picture> spec, an SVG
// becomes inline markup, a PDF/file becomes a download link, a markdown asset
// becomes a page link. Pure: it takes a lookup of the assets involved, never the
// filesystem.

/** Everything the resolver needs to expand one reference (built by the read route). */
export interface ResolvableAsset {
  id: string;
  kind: AssetKind;
  slug?: string;
  alt?: string;
  title?: string;
  caption?: string;
  filename?: string;
  width?: number;
  height?: number;
  /** Widths (ascending) that exist or may be generated on demand, for srcset. */
  variantWidths?: number[];
  /** Sanitized inline markup, for svg assets only. */
  /** Raw contents for markdown assets; the resolver parses frontmatter from it. */
  markdown?: string;
  svg?: string;
}

export interface ImageAssetView {
  kind: "image";
  src: string; // canonical original — the <img> fallback
  srcsetWebp?: string;
  srcsetAvif?: string;
  width?: number;
  height?: number;
  alt: string;
}
export interface GifAssetView {
  kind: "gif";
  src: string;
  width?: number;
  height?: number;
  alt: string;
}
export interface SvgAssetView {
  kind: "svg";
  svg: string; // inline, already sanitized on upload
  alt: string;
}
export interface DocAssetView {
  kind: "pdf" | "file";
  href: string;
  filename: string;
}
export interface PageAssetView {
  kind: "markdown";
  href: string; // /md/<slug>
  title: string;
}
export type AssetView =
  | ImageAssetView
  | GifAssetView
  | SvgAssetView
  | DocAssetView
  | PageAssetView;

/** The fixed menu of responsive widths we generate + serve for images. */
export const ASSET_WIDTHS = [320, 640, 960, 1280, 1600] as const;

/** Build a srcset string for one format from an asset's available widths. */
export function assetSrcset(id: string, widths: number[], format: "webp" | "avif"): string {
  return widths
    .slice()
    .sort((a, b) => a - b)
    .map((w) => `/assets/${id}/w${w}.${format} ${w}w`)
    .join(", ");
}

/**
 * Expand a reference (`asset:<id>` or a bare id) into a client-ready view.
 * `altOverride` lets a field supply its own alt (e.g. a gallery caption) that
 * wins over the asset's stored alt. Returns null if the id isn't in `assets`.
 */
export function resolveAsset(
  ref: string | null | undefined,
  assets: Map<string, ResolvableAsset>,
  altOverride?: string,
): AssetView | null {
  const id = parseAssetRef(ref) ?? (ref && /^[A-Za-z0-9_-]+$/.test(ref) ? ref : null);
  if (!id) return null;
  const a = assets.get(id);
  if (!a) return null;
  const alt = (altOverride || a.alt || a.caption || a.title || a.filename || "").trim();

  switch (a.kind) {
    case "image": {
      const widths = (a.variantWidths ?? []).filter((w) => !a.width || w <= a.width);
      const view: ImageAssetView = { kind: "image", src: `/assets/${a.id}`, alt };
      if (widths.length) {
        view.srcsetWebp = assetSrcset(a.id, widths, "webp");
        view.srcsetAvif = assetSrcset(a.id, widths, "avif");
      }
      if (a.width) view.width = a.width;
      if (a.height) view.height = a.height;
      return view;
    }
    case "gif": {
      const view: GifAssetView = { kind: "gif", src: `/assets/${a.id}`, alt };
      if (a.width) view.width = a.width;
      if (a.height) view.height = a.height;
      return view;
    }
    case "svg":
      return { kind: "svg", svg: a.svg ?? "", alt };
    case "markdown":
      return { kind: "markdown", href: `/md/${a.slug ?? a.id}`, title: a.title || a.filename || "Document" };
    case "pdf":
    case "file":
      return { kind: a.kind, href: `/assets/${a.id}`, filename: a.filename || `${a.id}.${a.kind}` };
  }
}
