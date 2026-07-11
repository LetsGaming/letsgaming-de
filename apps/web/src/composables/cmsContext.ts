import { type InjectionKey, inject } from "vue";
import type { useCms } from "./useCms";

/**
 * The single `useCms()` instance, shared with the panel components.
 *
 * `useCms()` builds fresh state on every call, so panels can't each call it —
 * they'd get their own disconnected editor state. Instead CmsApp calls it once,
 * `provide()`s it under this key, and each panel `inject()`s it. That keeps the
 * state local to the CMS island (no global store) while avoiding a ~110-member
 * prop signature on every panel.
 */
export type CmsContext = ReturnType<typeof useCms>;

export const CMS_KEY: InjectionKey<CmsContext> = Symbol("cms-context");

/** Read the CMS context; throws if used outside a CmsApp that provides it. */
export function useCmsContext(): CmsContext {
	const ctx = inject(CMS_KEY);
	if (!ctx)
		throw new Error(
			"useCmsContext() must be used inside <CmsApp> (no provider found)",
		);
	return ctx;
}
