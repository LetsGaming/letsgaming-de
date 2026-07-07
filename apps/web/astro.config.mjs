import node from "@astrojs/node";
import vue from "@astrojs/vue";
import { defineConfig } from "astro/config";

// SSR: every request resolves the SiteView from the read API (which reads the
// local store — nothing external is fetched on page load). This closes the
// self-updating loop: a sync or a CMS edit shows up on the next request, no
// rebuild. loadSite() caches briefly so bursts don't hammer the API.
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [vue()],
  site: "https://letsgaming.de",
});
