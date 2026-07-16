/**
 * Post frontmatter — the metadata that makes a markdown file a post.
 *
 * It lives in the file rather than beside it in the library, so a post is
 * self-contained and portable: moving the blog to a repo subdir later is moving
 * files, not migrating a schema. The cost is one parse per post when the index
 * renders, which at personal-blog scale, behind the read cache, is a rounding
 * error. A DB index is strictly additive if it ever isn't.
 *
 * Deliberately not stored here: the preview token. A secret in a content file
 * gets committed the day the portability above is exercised, so it's derived
 * from the slug instead (see `previewToken`).
 *
 * Hand-rolled rather than a YAML dependency: the grammar is five keys of scalars
 * and one flat list, and a full YAML parser is a large surface for that.
 */

export interface PostFrontmatter {
  title: string;
  /** ISO date. Ordering key for the index. */
  date: string;
  /** Unpublished: absent from the index, and 404 without a preview token. */
  draft: boolean;
  /** OG description and index blurb. Falls back to the opening paragraph. */
  excerpt?: string;
  /** Display only — no filtering, no tag pages. The nav is at its breadth cap,
   *  so tag pages would have cost an area. The data's here if that changes. */
  tags: string[];
}

export interface ParsedPost {
  frontmatter: PostFrontmatter;
  /** The markdown with the frontmatter block removed. */
  body: string;
}

/** Markdown assets under this slug prefix are blog posts. A namespace inside the
 *  library, not a folder in the repo: the CMS still owns the file. */
export const POST_PREFIX = "blog/";

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

function unquote(raw: string): string {
  const v = raw.trim();
  const quoted = /^(["'])([\s\S]*)\1$/.exec(v);
  return quoted ? (quoted[2] ?? "") : v;
}

/** `[a, b]` or `a, b` — one flat list of scalars, which is all tags ever are. */
function parseList(raw: string): string[] {
  const inner = raw.trim().replace(/^\[|\]$/g, "");
  return inner
    .split(",")
    .map((s) => unquote(s))
    .filter(Boolean);
}

/** First non-empty paragraph, stripped of the most common inline markup. Used
 *  when no excerpt is given, so a post always has an OG description. */
export function firstParagraph(body: string, max = 200): string {
  const para = body
    .split(/\r?\n\r?\n/)
    .map((p) => p.trim())
    .find((p) => p && !p.startsWith("#") && !p.startsWith("!["));
  if (!para) return "";
  const flat = para
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * Parse a markdown asset into frontmatter + body.
 *
 * Never throws: a malformed post is a content problem, not a crash. Missing
 * fields degrade to sensible defaults, and a file with no frontmatter at all is
 * still readable — it just has no date and won't sort meaningfully. `title`
 * falls back to the first H1, then to the slug, so a post always has a name.
 */
export function parsePost(markdown: string, slug: string): ParsedPost {
  const match = FENCE.exec(markdown);
  const body = match ? markdown.slice(match[0].length) : markdown;
  const fields = new Map<string, string>();

  for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
    const kv = /^([a-zA-Z][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (kv?.[1]) fields.set(kv[1].toLowerCase(), kv[2] ?? "");
  }

  const h1 = /^#\s+(.+)$/m.exec(body)?.[1]?.trim();
  const rawDate = fields.get("date");
  const parsedDate = rawDate ? new Date(unquote(rawDate)) : undefined;

  return {
    frontmatter: {
      title: unquote(fields.get("title") ?? "") || h1 || slug,
      date:
        parsedDate && !Number.isNaN(parsedDate.getTime())
          ? parsedDate.toISOString()
          : new Date(0).toISOString(),
      draft: unquote(fields.get("draft") ?? "").toLowerCase() === "true",
      ...(fields.get("excerpt") ? { excerpt: unquote(fields.get("excerpt")!) } : {}),
      tags: fields.has("tags") ? parseList(fields.get("tags")!) : [],
    },
    body,
  };
}
