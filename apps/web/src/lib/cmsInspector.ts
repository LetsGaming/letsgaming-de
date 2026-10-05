import type { ModuleKind } from "@lg/core";

/**
 * What feeds each module that has no hand-edited content. `source` is an id from
 * `GET /api/cms/status`; `null` means the module is derived from other CMS data
 * (nav tree, other modules) and has no sync of its own.
 */
export interface SyncedInfo {
  source: string | null;
  /** One plain sentence on where the numbers come from. */
  from: string;
  /** The settings view (if any) that governs it, since presence privacy lives in Settings. */
  settingsLink?: "settings";
}

export const SYNCED_INFO: Partial<Record<ModuleKind, SyncedInfo>> = {
  areas: { source: null, from: "Built from the site's pages. Rename a page or edit its description to change a card." },
  teasers: { source: null, from: "Built from the other modules on the site; it updates when they do." },
  glance: { source: "github", from: "Stats and the latest event come from GitHub." },
  activity: { source: "github", from: "The contribution calendar comes from GitHub." },
  coding: { source: "wakapi", from: "Coding time and languages come from Wakapi." },
  projects: { source: "github", from: "The project list comes from your GitHub repositories." },
  featured: { source: "github", from: "Chosen from your synced GitHub repositories." },
  presence: {
    source: "presence",
    from: "The live card comes from Discord presence.",
    settingsLink: "settings",
  },
  music: { source: "presence", from: "Built from the Spotify sessions the presence sampler records." },
  playtime: { source: "presence", from: "Built from the game sessions the presence sampler records." },
  wrapped: { source: "presence", from: "Summarises the recorded listening and play history." },
};

/** Locale-aware date, e.g. 01.08.2026 in a German browser: the same rendering a date input shows. */
export function formatDate(iso: string, tag?: string): string {
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(tag, { timeZone: "UTC" });
}

export function formatDateTime(iso: string | null, tag?: string): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(tag);
}

/** Add a hidden-activity name: trimmed, ignored when empty or already present (case-insensitive). */
export function addTag(list: string[], raw: string): string[] {
  const name = raw.trim();
  if (!name || list.some((t) => t.toLowerCase() === name.toLowerCase())) return list;
  return [...list, name];
}

export const removeTag = (list: string[], name: string): string[] => list.filter((t) => t !== name);

/** Suggestions: not already chosen, matching the typed text, most-seen first (the server's order). */
export function suggestTags(names: { name: string }[], chosen: string[], typed: string, limit = 8): string[] {
  const have = new Set(chosen.map((t) => t.toLowerCase()));
  const q = typed.trim().toLowerCase();
  return names
    .map((n) => n.name)
    .filter((n) => !have.has(n.toLowerCase()) && (!q || n.toLowerCase().includes(q)))
    .slice(0, limit);
}
