import { loadApiReference } from "~/lib/openapi";
import { docTree } from "../utils/docs";

/**
 * The parsed OpenAPI reference, with the docs sidebar tree alongside it.
 *
 * A server route because `loadApiReference` reads `openapi.yml` off disk — that
 * has to stay out of the client bundle, and the page only needs the parsed result.
 */
export default defineEventHandler(async () => ({
  ref: loadApiReference(),
  tree: await docTree(),
}));
