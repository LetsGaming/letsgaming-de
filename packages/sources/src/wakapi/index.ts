/**
 * The Wakapi adapter — one implementation of Source<WakapiRaw, WakapiData>.
 * `normalize` is pure (raw WakaTime-compat shapes in, the common shape out).
 */

import type { Source, WakapiData } from "@lg/core";
import { fetchWakapi, type WakapiConfig, type WakapiRaw } from "./fetch.js";

export function normalizeWakapi(raw: WakapiRaw): WakapiData {
  const d = raw.data ?? { languages: [] };
  const range =
    d.human_readable_range ??
    (typeof d.range === "string" ? d.range : d.range?.range) ??
    "last 7 days";
  const languages = (d.languages ?? [])
    .filter((l) => l && l.name && l.total_seconds > 0)
    .map((l) => ({
      name: l.name,
      seconds: Math.round(l.total_seconds),
      pct: Math.round(l.percent),
    }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 8);
  return {
    range,
    totalSeconds: Math.round(d.total_seconds ?? languages.reduce((s, l) => s + l.seconds, 0)),
    languages,
  };
}

/** Build the Wakapi source. Polls a bit more often than GitHub — coding time moves. */
export function wakapiSource(config: WakapiConfig): Source<WakapiRaw, WakapiData> {
  return {
    id: "wakapi",
    targetArea: "work",
    schedule: "*/30 * * * *", // every 30 minutes
    ttl: 2 * 60 * 60 * 1000, // tracked time; polls every 30m
    fetch: () => fetchWakapi(config),
    normalize: normalizeWakapi,
  };
}
