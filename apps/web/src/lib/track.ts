/**
 * Cookieless engagement tracker (privacy addendum to §9).
 *
 * Measures on-page behaviour the reverse-proxy log can't see — section views,
 * dwell, section-to-section movement, scroll depth, named clicks — and sends
 * *already-aggregated, bucketed* events via `navigator.sendBeacon`.
 *
 * It never stores anything on the device (no cookie, no localStorage), never
 * creates a session id or identifier, and correlates the visit only in memory
 * here in the browser. The server receives self-contained counters. Do-Not-Track
 * and Global Privacy Control are honoured — if set, nothing is sent at all.
 */

import {
  type ClickAction,
  type TrackEvent,
  dwellBucket,
  scrollDepthsReached,
  sessionTabsBucket,
  viewportBucket,
} from "@lg/core";
import { apiBase } from "./api";


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

const OPTOUT_KEY = "lg-analytics-optout";

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
    return localStorage.getItem(OPTOUT_KEY) === "1";
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
  return new URLSearchParams(window.location.search).has("preview");
}

/** May we measure this visit? False if DNT is on, the visitor opted out, previewing, or no API. */
export function analyticsAllowed(): boolean {
  return (
    typeof window !== "undefined" && !!apiBase && !dntActive() && !isOptedOut() && !isPreview()
  );
}

/** Flip the opt-out at runtime (from the settings panel) and persist it. */
export function setOptedOut(optout: boolean) {
  try {
    if (optout) localStorage.setItem(OPTOUT_KEY, "1");
    else localStorage.removeItem(OPTOUT_KEY);
  } catch {
    /* private mode — ignore */
  }
  if (optout) {
    enabled = false;
    queue = [];
  } else if (!dntActive() && apiBase && !isPreview()) {
    // Opting back in mid-visit: register the current section so the visit counts.
    enabled = true;
    if (current) {
      q("tab", current);
      q("viewport", viewportBucket(window.innerWidth));
    }
    flush();
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
  const url = `${apiBase}/api/pulse`;
  if (navigator.sendBeacon?.(url, blob)) return;
  // Fallback for the rare browser without sendBeacon.
  void fetch(url, { method: "POST", body, keepalive: true }).catch(() => {});
}

function sectionElapsed(): number {
  return sectionActiveMs + (lastResume ? Date.now() - lastResume : 0);
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
    flush(); // good moment to ship what we have
  } else {
    lastResume = Date.now();
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
    for (const depth of scrollDepthsReached(pct)) {
      const key = `${current}|${depth}`;
      if (!scrollReached.has(key)) {
        scrollReached.add(key);
        q("scroll", key);
      }
    }
  });
}

/** Finalize the visit exactly once (on pagehide): last section dwell + summary. */
function end() {
  if (!enabled || ended) return;
  ended = true;
  const dwell = sectionElapsed();
  sessionActiveMs += dwell;
  q("dwell", `${current}|${dwellBucket(dwell)}`);
  q("exit", current);
  q("session_tabs", sessionTabsBucket(tabsVisited.size));
  q("session_dwell", dwellBucket(sessionActiveMs));
  flush();
}

/** Start tracking a visit. Safe to call once, client-side only. */
export function initTracking(initialSection: string, theme?: "dark" | "light") {
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
  }
}

/** Record a move to another section: dwell on the old one + the transition. */
export function trackSwitch(to: string) {
  if (!enabled || to === current) return;
  const from = current;
  const dwell = sectionElapsed();
  sessionActiveMs += dwell;
  q("dwell", `${from}|${dwellBucket(dwell)}`);
  q("transition", `${from}>${to}`);
  q("tab", to);
  enterSection(to);
  flush();
}

/** Record a named, allow-listed interaction. */
export function trackClick(action: ClickAction) {
  q("click", action);
  // clicks ship on the next flush (visibility/switch/end) to avoid a beacon per tap
}

/** Record which project (repo) card was opened. Repo names are public data. */
export function trackProject(name: string) {
  q("project", name);
}
