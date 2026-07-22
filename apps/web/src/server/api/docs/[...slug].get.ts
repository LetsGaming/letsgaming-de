import { docTree, renderDoc } from "../../utils/docs";

/**
 * One doc, plus the sidebar tree the page renders around it.
 *
 * Both in a single response because the page always needs both, and during SSR
 * Nuxt calls this handler in-process — so it's one function call, not two
 * requests. A missing slug is a real 404 so the route can't silently render an
 * empty article.
 */
export default defineEventHandler(async (event) => {
  const slug = (getRouterParam(event, "slug") ?? "").toLowerCase();
  const doc = await renderDoc(slug);
  if (!doc) throw createError({ statusCode: 404, statusMessage: "No such doc." });
  return { ...doc, slug, tree: await docTree() };
});
