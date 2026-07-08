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
} from "@lg/core";

const API_BASE = (import.meta.env.PUBLIC_API_URL ?? "").replace(/\/$/, "");

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

function privacyOptOut(): boolean {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean; doNotTrack?: string };
  const dnt =
    n.doNotTrack ??
    (window as unknown as { doNotTrack?: string }).doNotTrack ??
    (n as unknown as { msDoNotTrack?: string }).msDoNotTrack;
  return dnt === "1" || dnt === "yes" || n.globalPrivacyControl === true;
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
  const url = `${API_BASE}/api/track`;
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
  if (typeof window === "undefined" || !API_BASE) return;
  if (privacyOptOut()) return;
  enabled = true;

  enterSection(initialSection);
  q("tab", initialSection);
  if (theme) q("theme", theme);
  flush();

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("scroll", onScroll, { passive: true });
  // pagehide is the reliable "leaving" signal (covers close, nav, bfcache).
  window.addEventListener("pagehide", end);
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
