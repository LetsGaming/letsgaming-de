/**
 * Cookieless engagement tracker (privacy addendum to §9).
 *
 * Measures on-page behaviour the reverse-proxy log can't see — section views,
 * dwell, section-to-section movement, scroll depth, named clicks — and sends
 * *already-aggregated, bucketed* events via `navigator.sendBeacon`.
 *
 * It never stores anything on the device (no cookie, no localStorage), never
 * creates a session id or identifier, and correlates the visit only in memory
 * here in the browser. The server receives self-contained counters. Do-Not-Track,
 * the visitor's own opt-out and automated browsers (`navigator.webdriver`) are
 * honoured: if any applies, nothing is sent at all.
 */

import {
  type ClickAction,
  PREVIEW_PARAM,
  type Theme,
  type TrackEvent,
  type VisitTrigger,
  VISIT_DWELL_MS,
  dwellBucket,
  dwellKey,
  scrollDepthsReached,
  scrollKey,
  sessionTabsBucket,
  STORAGE_KEY,
  transitionKey,
  viewportBucket,
  visitTrigger,
} from "@lg/core";
import { apiBase, apiUrl } from "./api";

let enabled = false;
let queue: TrackEvent[] = [];

// In-memory visit state (gone when the tab closes).
let current = "";
let sessionActiveMs = 0;
let sectionActiveMs = 0;
let lastResume = 0; // 0 = currently hidden/paused
const tabsVisited = new Set<string>();
const scrollReached = new Set<string>(); // `${section}|${depth}` already sent
let ended = false;

// Visit confirmation: one `visit` event at the first real engagement signal.
let visitSent = false;
let maxScrollPct = 0;
let clicked = false;
let dwellTimer: ReturnType<typeof setTimeout> | undefined;

// Module focus, tracked with its own visible-time clock.
const MODULE_SELECTOR = "section.module-section[id]";
let moduleObserver: IntersectionObserver | undefined;
let qualified: string[] = []; // modules currently >=50% visible, most recent last
let focusModule = "";
let moduleActiveMs = 0;
let moduleResume = 0; // 0 = hidden or nothing focused
const modulesSeen = new Set<string>();

/** The value stored for an active opt-out. Presence is the signal; the value is
 *  just something non-empty. */
const OPTED_OUT = "1";

/** The browser's explicit Do-Not-Track signal (we honour DNT, but not GPC). */
export function dntActive(): boolean {
  if (typeof navigator === "undefined") return false;
  const n = navigator as Navigator & { msDoNotTrack?: string };
  const dnt =
    n.doNotTrack ?? (window as unknown as { doNotTrack?: string }).doNotTrack ?? n.msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}

/** The visitor's own opt-out choice, remembered locally (a functional preference). */
export function isOptedOut(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY.analyticsOptout) === OPTED_OUT;
  } catch {
    return false;
  }
}

/**
 * Preview context: the CMS embeds the site in an iframe with `?preview=1`. We
 * must not record the owner's preview traffic — detect it two ways (the query
 * marker, and simply being framed) and stay silent.
 */
export function isPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return true; // running inside a frame
  } catch {
    return true; // cross-origin framing throws — treat as framed
  }
  return new URLSearchParams(window.location.search).has(PREVIEW_PARAM);
}

/** Playwright, Puppeteer and Selenium set `navigator.webdriver`; people do not. */
export function isAutomated(): boolean {
  return typeof navigator !== "undefined" && navigator.webdriver === true;
}

/** May we measure this visit? False if DNT is on, the visitor opted out, previewing, automated, or no API. */
export function analyticsAllowed(): boolean {
  return (
    typeof window !== "undefined" &&
    !!apiBase &&
    !dntActive() &&
    !isOptedOut() &&
    !isPreview() &&
    !isAutomated()
  );
}

/** Flip the opt-out at runtime (from the settings panel) and persist it. */
export function setOptedOut(optout: boolean) {
  try {
    if (optout) localStorage.setItem(STORAGE_KEY.analyticsOptout, OPTED_OUT);
    else localStorage.removeItem(STORAGE_KEY.analyticsOptout);
  } catch {
    /* private mode — ignore */
  }
  if (optout) {
    enabled = false;
    queue = [];
  } else if (!dntActive() && apiBase && !isPreview() && !isAutomated()) {
    // Opting back in mid-visit: register the current section so the visit counts.
    enabled = true;
    if (current) {
      q("tab", current);
      q("viewport", viewportBucket(window.innerWidth));
    }
    flush();
    scheduleDwell();
  }
}

function q(d: TrackEvent["d"], k: string) {
  if (!enabled) return;
  queue.push({ d, k });
}

function flush() {
  if (!enabled || queue.length === 0) return;
  const body = JSON.stringify({ events: queue });
  queue = [];
  // text/plain keeps this a CORS-"simple" request (no preflight for beacons).
  const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
  const url = apiUrl("/api/pulse");
  if (navigator.sendBeacon?.(url, blob)) return;
  // Fallback for the rare browser without sendBeacon.
  void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
}

function sectionElapsed(): number {
  return sectionActiveMs + (lastResume ? Date.now() - lastResume : 0);
}

function moduleElapsed(): number {
  return moduleActiveMs + (moduleResume ? Date.now() - moduleResume : 0);
}

function confirmVisit(trigger: VisitTrigger) {
  if (!enabled || ended || visitSent) return;
  visitSent = true;
  clearTimeout(dwellTimer);
  q("visit", trigger);
  flush();
}

function checkVisit() {
  if (visitSent) return;
  const trigger = visitTrigger({
    scrollPct: maxScrollPct,
    modulesSeen: modulesSeen.size,
    visibleMs: sessionActiveMs + sectionElapsed(),
    clicked,
  });
  if (trigger) confirmVisit(trigger);
}

/** Arm a timer for the remaining visible time; it is dropped while the tab is hidden. */
function scheduleDwell() {
  clearTimeout(dwellTimer);
  if (!enabled || ended || visitSent || !lastResume) return;
  const remaining = Math.max(0, VISIT_DWELL_MS - (sessionActiveMs + sectionElapsed()));
  dwellTimer = setTimeout(() => {
    checkVisit();
    scheduleDwell();
  }, remaining);
}

function isVisibleEnough(e: IntersectionObserverEntry): boolean {
  if (!e.isIntersecting) return false;
  if (e.intersectionRatio >= 0.5) return true;
  const vh = e.rootBounds?.height ?? 0;
  return vh > 0 && e.intersectionRect.height >= vh * 0.5;
}

function focusOn(id: string) {
  if (id === focusModule) return;
  const from = focusModule;
  if (from) {
    q("module_dwell", dwellKey(from, dwellBucket(moduleElapsed())));
    q("module_flow", transitionKey(from, id));
  } else {
    q("module_entry", id);
  }
  focusModule = id;
  moduleActiveMs = 0;
  moduleResume = document.visibilityState === "visible" ? Date.now() : 0;
}

function onModules(entries: IntersectionObserverEntry[]) {
  for (const e of entries) {
    const id = (e.target as HTMLElement).id;
    qualified = qualified.filter((m) => m !== id);
    if (!isVisibleEnough(e)) continue;
    qualified.push(id);
    if (!modulesSeen.has(id)) {
      modulesSeen.add(id);
      q("module", id);
    }
  }
  const top = qualified[qualified.length - 1];
  if (top) focusOn(top);
  checkVisit();
}

function observeModules() {
  moduleObserver?.disconnect();
  moduleObserver = undefined;
  qualified = [];
  if (typeof IntersectionObserver === "undefined") return;
  const els = document.querySelectorAll(MODULE_SELECTOR);
  if (els.length === 0) return;
  moduleObserver = new IntersectionObserver(
    onModules,
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  for (const el of els) moduleObserver.observe(el);
}

function enterSection(id: string) {
  current = id;
  sectionActiveMs = 0;
  lastResume = document.visibilityState === "visible" ? Date.now() : 0;
  tabsVisited.add(id);
}

function onVisibility() {
  if (document.visibilityState === "hidden") {
    if (lastResume) {
      sectionActiveMs += Date.now() - lastResume;
      lastResume = 0;
    }
    if (moduleResume) {
      moduleActiveMs += Date.now() - moduleResume;
      moduleResume = 0;
    }
    clearTimeout(dwellTimer);
    flush(); // good moment to ship what we have
  } else {
    lastResume = Date.now();
    if (focusModule) moduleResume = lastResume;
    scheduleDwell();
  }
}

let scrollScheduled = false;
function onScroll() {
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    const el = document.scrollingElement ?? document.documentElement;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100));
    maxScrollPct = Math.max(maxScrollPct, pct);
    for (const depth of scrollDepthsReached(pct)) {
      const key = scrollKey(current, depth);
      if (!scrollReached.has(key)) {
        scrollReached.add(key);
        q("scroll", key);
      }
    }
    checkVisit();
  });
}

/**
 * Finalize the visit exactly once (on pagehide): last section dwell + summary.
 *
 * `session_tabs` and `session_dwell` are emitted only here, so they are the
 * *completed*-visit counts: a tab that's backgrounded and killed by the OS, or a
 * browser that never fires `pagehide`, contributes pageviews but no session row.
 * Visits therefore read slightly below pageviews by construction. The CMS labels
 * that metric "Visits — completed visits" for exactly this reason; don't
 * reconcile the two numbers by moving this call earlier, which would count
 * visits that hadn't happened yet.
 */
function end() {
  if (!enabled || ended) return;
  ended = true;
  moduleObserver?.disconnect();
  moduleObserver = undefined;
  clearTimeout(dwellTimer);
  const dwell = sectionElapsed();
  sessionActiveMs += dwell;

  // Closing events go first: the server keeps only the head of an over-long batch.
  const closing: TrackEvent[] = [
    { d: "session_tabs", k: sessionTabsBucket(tabsVisited.size) },
    { d: "session_dwell", k: dwellBucket(sessionActiveMs) },
  ];
  if (modulesSeen.size > 0) {
    closing.push({ d: "session_modules", k: sessionTabsBucket(modulesSeen.size) });
  }
  closing.push({ d: "exit", k: current });
  if (focusModule) closing.push({ d: "module_exit", k: focusModule });
  closing.push({ d: "dwell", k: dwellKey(current, dwellBucket(dwell)) });
  if (focusModule) {
    closing.push({ d: "module_dwell", k: dwellKey(focusModule, dwellBucket(moduleElapsed())) });
  }
  queue = [...closing, ...queue];
  flush();
}

/** Start tracking a visit. Safe to call once, client-side only. */
export function initTracking(initialSection: string, theme?: Theme) {
  if (typeof window === "undefined" || !apiBase) return;
  // Listeners are always attached so the settings toggle can start/stop measuring
  // live; whether anything is actually sent is gated on `enabled` below.
  enterSection(initialSection);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("scroll", onScroll, { passive: true });
  // pagehide is the reliable "leaving" signal (covers close, nav, bfcache).
  window.addEventListener("pagehide", end);

  // We honour Do-Not-Track and the visitor's own opt-out. Nothing personal is
  // stored either way; this is a courtesy, not a legal requirement.
  enabled = analyticsAllowed();
  if (enabled) {
    q("tab", initialSection);
    q("viewport", viewportBucket(window.innerWidth));
    if (theme) q("theme", theme);
    flush();
    scheduleDwell();
  }
  observeModules();
}

/** Record a move to another section: dwell on the old one + the transition. */
export function trackSwitch(to: string) {
  if (!enabled || to === current) return;
  const from = current;
  const dwell = sectionElapsed();
  sessionActiveMs += dwell;
  q("dwell", dwellKey(from, dwellBucket(dwell)));
  q("transition", transitionKey(from, to));
  q("tab", to);
  enterSection(to);
  flush();
  scheduleDwell();
  // The next area renders its modules after this call.
  requestAnimationFrame(observeModules);
}

/** Record a named, allow-listed interaction. */
export function trackClick(action: ClickAction) {
  q("click", action);
  if (!enabled) return;
  clicked = true;
  checkVisit();
  // clicks ship on the next flush (visibility/switch/end) to avoid a beacon per tap
}

/** Record which project (repo) card was opened. Repo names are public data. */
export function trackProject(name: string) {
  q("project", name);
}
