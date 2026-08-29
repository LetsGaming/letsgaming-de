import { type InjectionKey, inject } from "vue";

/**
 * The site's `syncedRelative` ("8m", "2d", ...), provided by AreaPage so the
 * hero can say when the site last synced without every module in the uniform
 * `sections[module.kind]` dispatch (Module.vue) needing a prop only the hero
 * uses. Optional: a component that injects this outside an AreaPage (a test,
 * an isolated render) just gets undefined and renders without the caption.
 */
export const SYNCED_RELATIVE_KEY: InjectionKey<string | undefined> = Symbol("synced-relative");

export function useSyncedRelative(): string | undefined {
  return inject(SYNCED_RELATIVE_KEY, undefined);
}
