import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineNuxtConfig } from "nuxt/config";

// Load the shared monorepo-root `.env` — the same file the API server reads via
// `--env-file-if-exists=../../.env`. Nuxt only auto-loads a `.env` next to
// nuxt.config, and `nuxt dev` runs with the app dir as cwd, so without this the
// web app silently sees none of the shared config: PUBLIC_API_URL stays empty and
// every CMS call resolves against the Nuxt origin instead of the API.
// Resolved from this file, not cwd, so it holds however Nuxt is invoked.
const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/**
 * SSR Nuxt on the standalone Node preset — the same deploy shape as the Astro app
 * it replaces (@astrojs/node standalone). Pages render server-side; the SiteView is
 * resolved from the local read-only store in `server/utils/site.ts` (a direct read,
 * not an HTTP hop), exactly as `lib/site.ts` did under Astro.
 *
 * Env: start Nuxt from the monorepo root so it reads the shared root `.env`
 * (DB_PATH, API_URL, PUBLIC_API_URL) — the same keys Astro used. Server-only keys
 * (DB_PATH, API_URL) are read from `process.env` inside `server/` and never reach
 * the client; browser-visible values go through `runtimeConfig.public` below.
 */
export default defineNuxtConfig({
  ssr: true,

  // App code lives under `src/`, as it did before the migration. Nuxt's own default
  // is the project root; this keeps the tree (and the git history) recognisable.
  // `serverDir` is set explicitly rather than relied on: its default has moved
  // between Nuxt majors, and a silently-unfound `server/` means the API routes and
  // the SSR site loader vanish with no error.
  srcDir: "src/",
  serverDir: "src/server",
  // Opts into Nitro/Nuxt behaviour as of this date; bump deliberately, not casually.
  compatibilityDate: "2026-07-22",

  // Nuxt would default to 3000, but the API's CORS allow-list is
  // `WEB_ORIGIN=http://localhost:4321` (and the container publishes 4321). Keeping
  // the dev port means nothing downstream has to change.
  devServer: { port: 4321 },

  // Silences the "Failed to resolve import #app-manifest" pre-transform errors —
  // an upstream Nuxt bug (nuxt/nuxt#30461, #30700, #33606) where Vite statically
  // analyses an import inside a dead `if (false)` branch and reports it unresolved.
  // Harmless but noisy. Turning the feature off removes the code path entirely.
  // The cost is client-side route-rule awareness and build-id refresh detection,
  // neither of which this site uses (no `routeRules`, no `useAppManifest`).
  experimental: { appManifest: false },

  nitro: {
    preset: "node-server",
    // The docs were `prerender = true` under Astro: one static page per doc. The
    // crawler starts at the entry doc and follows the sidebar, which links every
    // one. If a crawl ever misses a page it still renders via SSR — the route
    // works either way, prerendering is only an optimization here.
    prerender: { crawlLinks: true, routes: ["/docs/readme", "/docs/api", "/datenschutz"] },
  },

  // `lib/api.ts` reads `import.meta.env.PUBLIC_API_URL` and captures it at module
  // scope (`cms.base` is fixed when the module first evaluates). Astro inlined that
  // value at build; Vite only exposes VITE_-prefixed vars, so inline it explicitly
  // here to keep the same semantics — and to avoid rewriting ~30 call sites into a
  // runtime lookup that this value never needed. `runtimeConfig.public.apiUrl`
  // above remains for anything that genuinely wants to change per deployment.
  vite: {
    define: {
      "import.meta.env.PUBLIC_API_URL": JSON.stringify(process.env.PUBLIC_API_URL ?? ""),
    },
  },

  // Flat auto-import names: `components/ui/SmartLink.vue` is <SmartLink>, not
  // <UiSmartLink>. The ported components already import each other explicitly, but
  // this keeps new usage consistent with how they're named everywhere else.
  components: [{ path: "~/components", pathPrefix: false }],

  runtimeConfig: {
    public: {
      // Client-visible. `apiUrl` for browser calls to the API ("" = same origin);
      // `siteUrl` is the canonical origin SmartLink uses to tell internal from
      // external. Overridable at runtime via NUXT_PUBLIC_API_URL / NUXT_PUBLIC_SITE_URL.
      apiUrl: process.env.PUBLIC_API_URL ?? "",
      siteUrl: process.env.PUBLIC_SITE_URL ?? "https://letsgaming.de",
    },
  },

  // Self-hosted fonts + design tokens + base styles (were imported in Layout.astro).
  // Order matters: fonts first so --f-d/--f-b/--f-m resolve, then tokens, then app.
  css: [
    "@fontsource/fredoka/400.css",
    "@fontsource/fredoka/500.css",
    "@fontsource/fredoka/600.css",
    "@fontsource/fredoka/700.css",
    "@fontsource/inter/400.css",
    "@fontsource/inter/500.css",
    "@fontsource/inter/600.css",
    "@fontsource/space-mono/400.css",
    "@fontsource/space-mono/700.css",
    "~/styles/tokens.css",
    "~/styles/app.css",
  ],

  app: {
    head: {
      htmlAttrs: { lang: "en" },
      title: "Domenic — web dev & tinkerer",
      meta: [
        { charset: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        {
          name: "description",
          content:
            "Personal homepage of Domenic (@LetsGaming) — full-time web developer in Germany. Clean interfaces by day; plant sensors and LED strips by night.",
        },
        { name: "theme-color", content: "#8b5cf6" },
      ],
      link: [
        { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
        { rel: "mask-icon", href: "/favicon.svg", color: "#8b5cf6" },
      ],
      // No-flash theme: set data-theme before first paint (ported verbatim from
      // Layout.astro's is:inline script). In <head> so it runs before body renders.
      script: [
        {
          tagPosition: "head",
          innerHTML:
            "(function(){try{var s=localStorage.getItem('theme');var t=s==='light'||s==='dark'?s:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='dark';}})();",
        },
        {
          // No-flash locale: if the URL carries no explicit ?lang but the visitor
          // previously chose one that differs from what the server rendered,
          // redirect once so the whole page is server-rendered in their language.
          // Cookieless (localStorage), guarded against loops (only when ?lang is
          // absent), and scoped to the locale-aware pages — `data-locale-aware` is
          // set by AreaPage, so the prerendered docs, which ignore ?lang, opt out.
          tagPosition: "head",
          innerHTML:
            "(function(){try{if(document.documentElement.dataset.localeAware!=='1')return;var u=new URL(location.href);if(u.searchParams.has('lang'))return;var s=localStorage.getItem('lang');if((s==='en'||s==='de')&&s!==document.documentElement.lang){u.searchParams.set('lang',s);location.replace(u.toString());}}catch(e){}})();",
        },
      ],
    },
  },

  // Astro's ClientRouter → Nuxt view transitions. Cosmetic; enable in Phase 6.
  // experimental: { viewTransition: true },

  typescript: { typeCheck: false }, // run vue-tsc in CI instead; keep dev fast
});
