import { defineVitestConfig } from "@nuxt/test-utils/config";

/**
 * Component smoke tests. The `nuxt` environment is what makes them work now that
 * the components are Nuxt-native: `SmartLink` calls `useRuntimeConfig()` and
 * `DocsShell` calls `useRoute()`, both auto-imports that a bare happy-dom run
 * doesn't provide. Rather than stubbing those per test, the environment supplies
 * the real ones. SSR and the Nitro routes still aren't exercised here.
 */
export default defineVitestConfig({
  test: {
    environment: "nuxt",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
