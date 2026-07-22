/**
 * `PUBLIC_API_URL` is inlined at build by `vite.define` (see nuxt.config), because
 * `lib/api.ts` captures it at module scope. The replacement is textual, so
 * TypeScript still needs to be told the property exists.
 */
interface ImportMetaEnv {
  readonly PUBLIC_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
