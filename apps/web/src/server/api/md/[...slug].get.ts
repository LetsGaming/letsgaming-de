import { marked } from "marked";

/**
 * A published Markdown asset (the blog), fetched from the API and rendered.
 *
 * A server route rather than a browser fetch, for the same reason the Astro page
 * did this in its frontmatter: `API_URL` is the internal address of the API
 * container, which the browser can't resolve and shouldn't know. `preview` is
 * forwarded untouched — the API decides whether a draft is visible; duplicating
 * that check here would create a second, laxer gate on the same secret.
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");
  const base = process.env.API_URL;
  if (!base || !slug) throw createError({ statusCode: 404, statusMessage: "Not found" });

  const { preview } = getQuery(event);
  const url = new URL(`${base}/api/assets/md/${encodeURIComponent(slug)}`);
  if (typeof preview === "string" && preview) url.searchParams.set("preview", preview);

  let doc: { title: string; markdown: string; draft?: boolean };
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    doc = await res.json();
  } catch {
    throw createError({ statusCode: 404, statusMessage: "Not found" });
  }

  // The body still carries its frontmatter fence; strip it rather than letting
  // marked render it as a table or a rule.
  const body = doc.markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
  return {
    title: doc.title,
    draft: doc.draft === true,
    html: await marked.parse(body, { async: true }),
  };
});
