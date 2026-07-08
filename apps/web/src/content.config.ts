import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";

/**
 * The site's `/docs` are the repo's own `docs/` markdown, rendered at build time.
 * `base` is relative to this app's root (apps/web), so `../../docs` is the repo
 * root docs folder — the whole tree is present in the Docker build context.
 * No schema: these files have no frontmatter; titles come from the first heading.
 */
const docs = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "../../docs" }),
});

export const collections = { docs };
