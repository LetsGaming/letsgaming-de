import { AREA, DEFAULT_THEME, isTheme, otherTheme, STORAGE_KEY } from "@lg/core";
import type { Locale, NavView, Theme } from "@lg/core";
import { initTracking, trackClick } from "~/lib/track";

/**
 * Client-side site preferences — currently just the theme.
 *
 * Built on Nuxt's `useState` rather than a store library. The reason the nanostore
 * had to go was SSR isolation: a module-level singleton is shared by every request
 * the Node process serves, so one visitor's theme could bleed into another's
 * render. `useState` gives exactly that isolation natively — the value is
 * per-request on the server and shared across the app on the client — for one ref
 * of state, which is all this site has.
 *
 * It also sidesteps a real bug: `@pinia/nuxt` installs a payload plugin that runs
 * `shouldHydrate()` over every value Nuxt serializes, and that calls
 * `obj.hasOwnProperty(...)` directly. Nuxt's 404 payload contains a null-prototype
 * object, which has no such method, so *any* `createError`/`showError` 404 crashed
 * the render with "obj.hasOwnProperty is not a function" (nuxt/nuxt#32740, still
 * open against pinia 3.x). No payload plugin, no crash.
 *
 * The theme is only ever written from client code (onMounted, event handlers); the
 * server renders the default and the pre-paint script in `nuxt.config` corrects it
 * before anything is visible.
 */

export function useTheme() {
  return useState<Theme>("site-theme", () => DEFAULT_THEME);
}

/** Guards `initSite` so tracking starts once per client session, not per component. */
function useTrackingStarted() {
  return useState<boolean>("site-tracking-started", () => false);
}

export function useSiteState() {
  const theme = useTheme();
  const trackingStarted = useTrackingStarted();

  /**
   * Seed shared state from the SSR'd nav. Idempotent — whichever component's
   * onMounted runs first wins. Reads the theme back from the <html data-theme> the
   * no-flash script already applied rather than re-deciding, so the two can't
   * disagree mid-hydration. Starts tracking exactly once.
   */
  function initSite(nav: NavView[]): void {
    if (!import.meta.client) return;
    const applied = document.documentElement.dataset.theme;
    theme.value = isTheme(applied) ? applied : DEFAULT_THEME;
    if (!trackingStarted.value) {
      initTracking(nav[0]?.id ?? AREA.home, theme.value);
      trackingStarted.value = true;
    }
  }

  function toggleTheme(): void {
    const next = otherTheme(theme.value);
    theme.value = next;
    document.documentElement.dataset.theme = next;
    trackClick("theme-toggle");
    try {
      localStorage.setItem(STORAGE_KEY.theme, next);
    } catch {
      /* private mode — ignore */
    }
  }

  /**
   * Persist the locale choice (cookieless) and reload so the page is rendered in
   * that language. A full navigation, not a client-side route change: the locale is
   * resolved during SSR, so the server has to render again.
   */
  function setLocale(next: Locale): void {
    try {
      localStorage.setItem(STORAGE_KEY.lang, next);
    } catch {
      /* private mode — the URL param still applies the choice for this visit */
    }
    if (!import.meta.client) return;
    const url = new URL(window.location.href);
    url.searchParams.set(STORAGE_KEY.lang, next);
    window.location.assign(url.toString());
  }

  return { theme, initSite, toggleTheme, setLocale };
}
