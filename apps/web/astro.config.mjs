import node from "@astrojs/node";
import vue from "@astrojs/vue";
import { defineConfig } from "astro/config";
import { rewriteDocLink } from "./src/lib/docs.ts";

/**
 * Rewrite markdown `.md` links in the rendered docs so they work on the site:
 * intra-docs links become `/docs/<slug>`, links that escape `docs/` become
 * GitHub blob URLs. The current doc's slug is derived from its source path.
 */
function rehypeDocLinks() {
  return (tree, file) => {
    const p = (file?.path ?? file?.history?.[0] ?? "").replace(/\\/g, "/");
    const at = p.indexOf("/docs/");
    const fromSlug = at >= 0 ? p.slice(at + 6).replace(/\.md$/i, "") : "";
    const walk = (node) => {
      if (
        node.type === "element" &&
        node.tagName === "a" &&
        typeof node.properties?.href === "string"
      ) {
        node.properties.href = rewriteDocLink(node.properties.href, fromSlug);
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

// SSR: every request resolves the SiteView from the read API (which reads the
// local store — nothing external is fetched on page load). This closes the
// self-updating loop: a sync or a CMS edit shows up on the next request, no
// rebuild. loadSite() caches briefly so bursts don't hammer the API.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [vue()],
  site: "https://letsgaming.de",
  markdown: {
    rehypePlugins: [rehypeDocLinks],
  },
});
