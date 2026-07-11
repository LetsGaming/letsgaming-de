import type { NavView } from "@lg/core";
import { atom } from "nanostores";
import { initTracking, trackClick, trackSwitch } from "../lib/track";

/**
 * State shared between the separately-hydrated site islands (SiteChrome, the tab
 * bar, and SitePanels, the content). These are two islands rather than one so the
 * static shell (brand, footer) and the SSR'd panel markup aren't part of the
 * hydrated tree — only the interactive bits hydrate.
 *
 * nanostores (not a plain module ref) because Astro only guarantees a single
 * shared instance across island bundles for a framework-agnostic store. On the
 * server these atoms are module singletons, so they are only ever written from
 * client-only code (onMounted / event handlers) — never during SSR — to avoid
 * leaking state between requests.
 */
export const $activeTab = atom<string>("");
export const $theme = atom<"dark" | "light">("dark");

let nav: NavView[] = [];
let trackingStarted = false;

/**
 * Seed shared state from the SSR'd nav. Idempotent: whichever island's onMounted
 * runs first wins, the other is a no-op. Syncs the theme from the SSR-applied
 * <html data-theme> and starts tracking exactly once.
 */
export function initSite(navView: NavView[]) {
	nav = navView;
	if (!$activeTab.get()) $activeTab.set(navView[0]?.id ?? "home");
	if (typeof document !== "undefined") {
		$theme.set(
			document.documentElement.dataset.theme === "light" ? "light" : "dark",
		);
	}
	if (!trackingStarted && typeof window !== "undefined") {
		initTracking($activeTab.get(), $theme.get());
		trackingStarted = true;
	}
}

/** Switch tab (from the nav bar or an in-page link). Tracks only on real change. */
export function setTab(id: string) {
	if (id === $activeTab.get()) return;
	$activeTab.set(id);
	trackSwitch(id);
}

/** Resolve an in-page target (module id, e.g. "contact", or an area id) to its
 *  area, so an in-page link can switch to the tab that holds it. */
export function areaForTarget(target: string): NavView | undefined {
	return (
		nav.find((a) => (a.modules ?? []).includes(target)) ??
		nav.find((a) => a.id === target)
	);
}

export function toggleTheme() {
	const next = $theme.get() === "dark" ? "light" : "dark";
	$theme.set(next);
	document.documentElement.dataset.theme = next;
	trackClick("theme-toggle");
	try {
		localStorage.setItem("theme", next);
	} catch {
		/* private mode — ignore */
	}
}

/** Persist the locale choice (cookieless) and reload SSR in that language. */
export function setLocale(next: "en" | "de") {
	try {
		localStorage.setItem("lang", next);
	} catch {
		/* private mode — the URL param still applies the choice for this visit */
	}
	if (typeof window === "undefined") return;
	const url = new URL(window.location.href);
	url.searchParams.set("lang", next);
	window.location.assign(url.toString());
}
