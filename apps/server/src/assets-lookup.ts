/**
 * Build the `Map<id, ResolvableAsset>` the resolver needs to expand `asset:<id>`
 * references. Metadata comes from the store; for SVGs we load the (already
 * sanitized) markup from disk so the resolver can inline it, and for raster
 * images we hand over the width menu capped to the intrinsic size.
 */
import { ASSET_WIDTHS, type ResolvableAsset } from "@lg/core";
import type { Store } from "@lg/db";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export async function buildAssetLookup(store: Store, mediaDir: string): Promise<Map<string, ResolvableAsset>> {
  const assetsDir = join(resolve(mediaDir), "assets");
  const map = new Map<string, ResolvableAsset>();
  for (const a of store.assets.list()) {
    const r: ResolvableAsset = {
      id: a.id,
      kind: a.kind,
      ...(a.slug ? { slug: a.slug } : {}),
      ...(a.alt ? { alt: a.alt } : {}),
      ...(a.title ? { title: a.title } : {}),
      ...(a.caption ? { caption: a.caption } : {}),
      filename: a.filename,
      ...(a.width ? { width: a.width } : {}),
      ...(a.height ? { height: a.height } : {}),
    };
    if (a.kind === "image" || a.kind === "gif") {
      r.variantWidths = ASSET_WIDTHS.filter((w) => !a.width || w <= a.width);
    } else if (a.kind === "markdown") {
      // Same shape as the SVG branch: the resolver needs the contents, not the
      // path, because frontmatter is what makes a post a post.
      r.markdown = await readFile(join(assetsDir, `${a.hash}.${a.ext}`), "utf8").catch(() => "");
    } else if (a.kind === "svg") {
      r.svg = await readFile(join(assetsDir, `${a.hash}.${a.ext}`), "utf8").catch(() => "");
    }
    map.set(a.id, r);
  }
  return map;
}
