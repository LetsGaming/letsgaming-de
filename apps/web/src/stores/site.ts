import type { NavView } from "@lg/core";
import { atom } from "nanostores";
import { initTracking, trackClick } from "../lib/track";

/**
 * State shared between the separately-hydrated site islands (SiteChrome and
 * SitePanels). These are two islands rather than one so the static shell (brand,
 * footer) and the SSR'd panel markup aren't part of the hydrated tree.
 *
 * The active area used to live here as an atom, because two islands had to agree
 * on which tab was open. Areas are routes now — the server knows, the URL knows,
 * and the nav is `<a>` — so the atom, its setter and the SSR fallback are gone.
 * Theme still needs sharing; it's a real client-side preference.
 *
 * nanostores (not a plain module ref) because Astro only guarantees a single
 * shared instance across island bundles for a framework-agnostic store. On the
 * server these atoms are module singletons, so they are only ever written from
 * client-only code (onMounted / event handlers) — never during SSR — to avoid
 * leaking state between requests.
 */
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
	if (typeof document !== "undefined") {
		$theme.set(
			document.documentElement.dataset.theme === "light" ? "light" : "dark",
		);
	}
	if (!trackingStarted && typeof window !== "undefined") {
		initTracking(nav[0]?.id ?? "home", $theme.get());
		trackingStarted = true;
	}
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
