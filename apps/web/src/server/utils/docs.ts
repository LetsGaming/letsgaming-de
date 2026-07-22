import { readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { Marked } from "marked";
import { buildDocTree, docTitle, rewriteDocLink, type DocLink } from "~/lib/docs";
import { withApiNav } from "~/lib/openapi";

/**
 * The `/docs` renderer: the repo's own `docs/` markdown, read from disk and
 * rendered server-side.
 *
 * Replaces Astro's `astro:content` glob collection plus its remark/rehype
 * pipeline. The interesting parts were never Astro's — `docTitle`, `buildDocTree`
 * and `rewriteDocLink` are pure helpers in `lib/docs.ts` and are reused verbatim.
 * What's rebuilt here is only the file reading and the markdown call, which now
 * goes through `marked` — the same renderer the blog route already used, so the
 * site has one markdown path instead of two.
 *
 * Slugs are lowercased to match the URLs Astro generated (it slugified collection
 * ids), so existing links and `rewriteDocLink`'s output keep resolving.
 */

// Repo-root `docs/`. Overridable for containers that mount it elsewhere; the
// default matches the Astro app's `base: "../../docs"` (relative to the app dir).
const DOCS_DIR = process.env.DOCS_DIR ?? resolve(process.cwd(), "../../docs");

async function walk(dir: string, base = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(join(dir, entry.name), rel)));
    else if (entry.name.toLowerCase().endsWith(".md")) out.push(rel);
  }
  return out;
}

/** `docs/adr/0005-Foo.md` → `adr/0005-foo` (lowercased, as Astro's ids were). */
function toSlug(relPath: string): string {
  return relPath.replace(/\.md$/i, "").split(sep).join("/").toLowerCase();
}

export interface DocFile {
  slug: string;
  title: string;
  body: string;
}

/** Every doc, with its title resolved. Cached — the files can't change at runtime. */
let filesCache: DocFile[] | null = null;

export async function readDocs(): Promise<DocFile[]> {
  if (filesCache) return filesCache;
  const rels = await walk(DOCS_DIR);
  const files = await Promise.all(
    rels.map(async (rel) => {
      const body = await readFile(join(DOCS_DIR, rel), "utf8");
      const slug = toSlug(rel);
      return { slug, title: docTitle(body, slug), body };
    }),
  );
  filesCache = files;
  return files;
}

/** The sidebar tree, including the generated API reference entry. */
export async function docTree() {
  const entries: DocLink[] = (await readDocs()).map(({ slug, title }) => ({ slug, title }));
  return withApiNav(buildDocTree(entries));
}

/**
 * Render one doc to HTML, rewriting intra-repo `*.md` links as it goes.
 *
 * A per-call `Marked` instance rather than the global one, because the rewrite
 * depends on which doc the link lives in — `marked.use()` is process-wide and two
 * concurrent renders would clobber each other's base slug.
 */
export async function renderDoc(slug: string): Promise<{ title: string; html: string } | null> {
  const doc = (await readDocs()).find((d) => d.slug === slug);
  if (!doc) return null;
  const md = new Marked({
    walkTokens(token) {
      if (token.type === "link") token.href = rewriteDocLink(token.href, slug);
    },
  });
  return { title: doc.title, html: await md.parse(doc.body, { async: true }) };
}
