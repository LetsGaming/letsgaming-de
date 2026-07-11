import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

// Component smoke tests only — Astro pages/SSR aren't exercised here.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
