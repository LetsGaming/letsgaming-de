/**
 * Pure helpers for the on-site docs renderer (`/docs`). Kept free of Astro so
 * they're unit-testable: the page and the link-rewrite rehype plugin call them.
 *
 * Docs are the repo's own `docs/` markdown, rendered at build time. Slugs are the
 * path under `docs/` without the extension, e.g. `API` or `adr/0005-source-contract`.
 */

const GITHUB_BLOB = "https://github.com/LetsGaming/letsgaming-de/blob/main/";

/** Title-case a filename stem for a fallback heading (e.g. "DATA-MODEL" → "Data Model"). */
function humanize(stem: string): string {
  return stem
    .replace(/[-_]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * A doc's display title: its first `# ` heading, unless that heading is just the
 * filename (e.g. `# ARCHITECTURE.md`) — then fall back to a humanized stem.
 */
export function docTitle(body: string, slug: string): string {
  const stem = slug.split("/").pop() ?? slug;
  const m = body.match(/^#\s+(.+?)\s*$/m);
  const heading = m?.[1]?.trim();
  if (heading && !/\.md$/i.test(heading)) return heading;
  return humanize(stem);
}

export interface DocLink {
  slug: string;
  title: string;
}
export interface DocGroup {
  label: string;
  items: DocLink[];
}

/**
 * Group doc entries into a sidebar tree: a top-level "Overview" group for docs at
 * the docs root, then one group per subfolder (e.g. `adr` → "ADR"). Within a
 * group, README sorts first, then by slug.
 */
export function buildDocTree(entries: DocLink[]): DocGroup[] {
  const root: DocLink[] = [];
  const folders = new Map<string, DocLink[]>();
  for (const e of entries) {
    const parts = e.slug.split("/");
    if (parts.length === 1) root.push(e);
    else {
      const folder = parts[0]!;
      (folders.get(folder) ?? folders.set(folder, []).get(folder)!).push(e);
    }
  }
  const order = (a: DocLink, b: DocLink) => {
    const ar = /(^|\/)README$/i.test(a.slug) ? 0 : 1;
    const br = /(^|\/)README$/i.test(b.slug) ? 0 : 1;
    return ar - br || a.slug.localeCompare(b.slug);
  };
  const groups: DocGroup[] = [];
  if (root.length) groups.push({ label: "Overview", items: [...root].sort(order) });
  for (const folder of [...folders.keys()].sort()) {
    groups.push({ label: folder.toUpperCase(), items: [...folders.get(folder)!].sort(order) });
  }
  return groups;
}

/**
 * Rewrite a markdown link so it works on the site: an intra-`docs/` `*.md` link
 * becomes `/docs/<slug>`, and a `*.md` link that resolves *outside* `docs/`
 * (e.g. a package README) becomes a GitHub blob URL. Everything else (http(s),
 * mailto, in-page `#anchor`, absolute `/path`) is returned unchanged.
 *
 * @param href      the original href
 * @param fromSlug  slug of the doc the link lives in (its dir sets the base)
 */
export function rewriteDocLink(href: string, fromSlug: string): string {
  if (!href || /^(https?:|mailto:|#|\/)/i.test(href)) return href;
  const hashAt = href.indexOf("#");
  const pathPart = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  if (!/\.md$/i.test(pathPart)) return href;

  // Resolve relative to the current doc's directory under repo-root/docs/.
  const fromDir = fromSlug.includes("/") ? fromSlug.split("/").slice(0, -1) : [];
  const stack = ["docs", ...fromDir];
  for (const seg of pathPart.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") stack.pop();
    else stack.push(seg);
  }
  const repoPath = stack.join("/");
  if (repoPath.startsWith("docs/")) {
    // Astro slugifies collection ids to lowercase, so match the generated route.
    return `/docs/${repoPath.slice(5).replace(/\.md$/i, "").toLowerCase()}${hash}`;
  }
  return `${GITHUB_BLOB}${repoPath}${hash}`;
}
